import {
  isApiErrorBody,
  KosovoPayApiError,
  KosovoPayConnectionError,
  KosovoPayTimeoutError,
} from "./errors.ts";

/** The default production base URL. */
export const DEFAULT_BASE_URL = "https://pay.kosovo.sh/api/sdk";

/** The API version this SDK was written against. */
export const DEFAULT_API_VERSION = "2026-06-01";

/** A `fetch` implementation. Defaults to the runtime global. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /**
   * Your secret key — `sk_test_…` or `sk_live_…`. Keep it server-side.
   * Falls back to `process.env.KOSOVOPAY_API_KEY` when omitted.
   */
  apiKey?: string;
  /** Override the base URL (e.g. a staging host). */
  baseUrl?: string;
  /**
   * Pin the dated API version sent as `Kosovopay-Version`. Defaults to the
   * version this SDK targets so behaviour never shifts under you.
   */
  apiVersion?: string;
  /** Max automatic retries for transient failures (429 / 5xx / network). Default `2`. */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Default `60_000`. `0` disables it. */
  timeout?: number;
  /** Inject a custom `fetch` (testing, proxies, Workers service bindings). */
  fetch?: FetchLike;
  /** Extra headers sent on every request. */
  defaultHeaders?: Record<string, string>;
}

/** Per-call options accepted by every resource method. */
export interface RequestOptions {
  /**
   * Idempotency key for mutating requests. Replays of the same key return the
   * original response for 24h. If omitted, the SDK generates one automatically
   * so its own retries can never double-charge.
   */
  idempotencyKey?: string;
  /** Override the API version for this one call. */
  apiVersion?: string;
  /** Abort signal to cancel the request. */
  signal?: AbortSignal;
  /** Extra headers for this one call. */
  headers?: Record<string, string>;
  /** Override `maxRetries` for this one call. */
  maxRetries?: number;
}

/** HTTP methods the transport understands. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface InternalRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  options?: RequestOptions;
}

const isMutation = (method: string) => method !== "GET";

/**
 * The transport core. Resource namespaces are thin wrappers over `#request`.
 * Built on web-standard `fetch` + `AbortController`, so it runs unmodified on
 * Node 20+, Bun, Deno, and Cloudflare Workers.
 */
export class HttpClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #apiVersion: string;
  readonly #maxRetries: number;
  readonly #timeout: number;
  readonly #fetch: FetchLike;
  readonly #defaultHeaders: Record<string, string>;

  constructor(options: ClientOptions | string = {}) {
    const opts: ClientOptions =
      typeof options === "string" ? { apiKey: options } : options;

    const apiKey =
      opts.apiKey ??
      (typeof process !== "undefined"
        ? process.env?.KOSOVOPAY_API_KEY
        : undefined);

    if (!apiKey) {
      throw new Error(
        "KosovoPay: missing API key. Pass `apiKey` or set KOSOVOPAY_API_KEY.",
      );
    }

    const fetchImpl = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new Error(
        "KosovoPay: no global `fetch` found. Pass one via the `fetch` option.",
      );
    }

    this.#apiKey = apiKey;
    this.#baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION;
    this.#maxRetries = opts.maxRetries ?? 2;
    this.#timeout = opts.timeout ?? 60_000;
    this.#fetch = fetchImpl;
    this.#defaultHeaders = opts.defaultHeaders ?? {};
  }

  async request<T>(req: InternalRequest): Promise<T> {
    const url = this.#buildUrl(req.path, req.query);
    const init = this.#buildInit(req);
    const maxRetries = req.options?.maxRetries ?? this.#maxRetries;

    let attempt = 0;
    // One initial try + `maxRetries` retries.
    for (;;) {
      try {
        const response = await this.#fetchWithTimeout(
          url,
          init,
          req.options?.signal,
        );

        if (response.ok) {
          if (response.status === 204) return undefined as T;
          return (await response.json()) as T;
        }

        const retryable = this.#isRetryableStatus(response.status);
        if (retryable && attempt < maxRetries) {
          await this.#backoff(attempt, response);
          attempt++;
          continue;
        }
        throw await this.#toApiError(response);
      } catch (err) {
        // Re-throw API errors untouched.
        if (err instanceof KosovoPayApiError) throw err;

        // A caller-initiated abort is not a timeout and must never be retried —
        // surface the original abort so callers see the cancellation they asked for.
        if (req.options?.signal?.aborted) throw err;

        const connErr = this.#toConnectionError(err);
        if (
          !(connErr instanceof KosovoPayTimeoutError) &&
          attempt < maxRetries
        ) {
          await this.#backoff(attempt);
          attempt++;
          continue;
        }
        throw connErr;
      }
    }
  }

  #buildUrl(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const url = new URL(this.#baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  #buildInit(req: InternalRequest): RequestInit {
    const headers = new Headers(this.#defaultHeaders);
    headers.set("Authorization", `Bearer ${this.#apiKey}`);
    headers.set("Accept", "application/json");
    headers.set(
      "Kosovopay-Version",
      req.options?.apiVersion ?? this.#apiVersion,
    );

    if (isMutation(req.method)) {
      // Auto-generate so the SDK's own retries are always safe.
      headers.set(
        "Idempotency-Key",
        req.options?.idempotencyKey ?? crypto.randomUUID(),
      );
    }

    if (req.options?.headers) {
      for (const [k, v] of Object.entries(req.options.headers)) {
        headers.set(k, v);
      }
    }

    const init: RequestInit = { method: req.method, headers };
    if (req.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(req.body);
    }
    return init;
  }

  async #fetchWithTimeout(
    url: string,
    init: RequestInit,
    userSignal?: AbortSignal,
  ): Promise<Response> {
    if (this.#timeout <= 0) {
      return this.#fetch(url, { ...init, signal: userSignal });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeout);
    const onUserAbort = () => controller.abort();
    userSignal?.addEventListener("abort", onUserAbort);

    try {
      return await this.#fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    }
  }

  #isRetryableStatus(status: number): boolean {
    return status === 429 || status === 408 || status >= 500;
  }

  async #toApiError(response: Response): Promise<KosovoPayApiError | Error> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (isApiErrorBody(body)) {
      return new KosovoPayApiError(
        body.error,
        response.status,
        response.headers,
      );
    }
    return new KosovoPayApiError(
      {
        type: "api_error",
        code: "internal_error",
        message: `Unexpected ${response.status} response with no error body.`,
      },
      response.status,
      response.headers,
    );
  }

  #toConnectionError(err: unknown): KosovoPayConnectionError {
    if (err instanceof KosovoPayConnectionError) return err;
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: string }).name === "TimeoutError");
    if (aborted) {
      return new KosovoPayTimeoutError(
        `Request timed out or was aborted after ${this.#timeout}ms.`,
        err,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return new KosovoPayConnectionError(
      `Network error reaching KosovoPay: ${message}`,
      err,
    );
  }

  async #backoff(attempt: number, response?: Response): Promise<void> {
    const retryAfter = response?.headers.get("retry-after");
    if (retryAfter) {
      // `Retry-After` may be a number of seconds or an HTTP date.
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) {
        await sleep(Math.max(0, seconds * 1000));
        return;
      }
      const whenMs = Date.parse(retryAfter);
      if (Number.isFinite(whenMs)) {
        // Cap at 60s so a far-future date can't stall a request indefinitely.
        await sleep(Math.min(60_000, Math.max(0, whenMs - Date.now())));
        return;
      }
    }
    // Exponential backoff with jitter: ~0.5s, ~1s, ~2s … capped at 8s.
    const base = Math.min(8000, 500 * 2 ** attempt);
    const jitter = base * 0.25 * Math.random();
    await sleep(base + jitter);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
