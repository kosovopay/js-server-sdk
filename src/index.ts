import {
  type ClientOptions,
  HttpClient,
  type HttpMethod,
  type RequestOptions,
} from "./client.ts";
import { Banks } from "./resources/banks.ts";
import { Currencies } from "./resources/currencies.ts";
import { Identity } from "./resources/identity.ts";
import { Payments } from "./resources/payments.ts";
import { Refunds } from "./resources/refunds.ts";
import { WebhookEndpoints } from "./resources/webhook-endpoints.ts";
import { Webhooks } from "./webhooks.ts";

/**
 * The KosovoPay client.
 *
 * ```ts
 * import { KosovoPay } from "@kosovopay/server-sdk";
 *
 * const pay = new KosovoPay(process.env.KOSOVOPAY_API_KEY!);
 *
 * const payment = await pay.payments.create({
 *   amount: 4990,            // €49.90 — always minor units
 *   currency: "EUR",
 *   mode: "hosted",
 *   success_url: "https://shop.example.com/thanks",
 * });
 * // redirect the customer to payment.hosted_url
 * ```
 *
 * Built on web-standard `fetch` + Web Crypto: the same instance runs on Node,
 * Bun, Deno, and Cloudflare Workers with no adapters.
 */
export class KosovoPay {
  readonly payments: Payments;
  readonly refunds: Refunds;
  readonly banks: Banks;
  readonly currencies: Currencies;
  readonly webhookEndpoints: WebhookEndpoints;
  /** Verify and parse incoming webhook deliveries. */
  readonly webhooks: Webhooks;

  #http: HttpClient;
  #identity: Identity;

  constructor(options: ClientOptions | string = {}) {
    const http = new HttpClient(options);
    this.#http = http;
    this.payments = new Payments(http);
    this.refunds = new Refunds(http);
    this.banks = new Banks(http);
    this.currencies = new Currencies(http);
    this.webhookEndpoints = new WebhookEndpoints(http);
    this.webhooks = new Webhooks();
    this.#identity = new Identity(http);
  }

  /** Identify the API key: which team, mode, banks, and default currency it resolves to. */
  me(options?: RequestOptions) {
    return this.#identity.retrieve(options);
  }

  /**
   * Low-level escape hatch. Call any endpoint directly — including ones this
   * SDK version doesn't model yet — with the same auth, versioning, retries,
   * and idempotency the typed resources get.
   *
   * ```ts
   * const res = await pay.request<{ ok: boolean }>("POST", "/some/new/endpoint", {
   *   body: { foo: "bar" },
   * });
   * ```
   */
  request<T = unknown>(
    method: HttpMethod,
    path: string,
    params: {
      query?: Record<string, string | number | undefined>;
      body?: unknown;
    } & RequestOptions = {},
  ): Promise<T> {
    const { query, body, ...options } = params;
    return this.#http.request<T>({ method, path, query, body, options });
  }
}

/**
 * Functional factory, for those who prefer it over `new`. Identical behaviour.
 *
 * ```ts
 * const pay = createKosovoPay({ apiKey: env.KOSOVOPAY_API_KEY });
 * ```
 */
export function createKosovoPay(
  options: ClientOptions | string = {},
): KosovoPay {
  return new KosovoPay(options);
}

export default KosovoPay;

// Public surface.
export {
  type ClientOptions,
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  type FetchLike,
  type HttpMethod,
  type RequestOptions,
} from "./client.ts";
export {
  type ApiErrorBody,
  type ErrorCode,
  type ErrorType,
  KosovoPayApiError,
  KosovoPayConnectionError,
  KosovoPayError,
  KosovoPaySignatureVerificationError,
  KosovoPayTimeoutError,
} from "./errors.ts";
export { Page, type PageFetcher } from "./pagination.ts";
// Resource classes (handy for typing helpers / DI).
export { Banks } from "./resources/banks.ts";
export { Currencies } from "./resources/currencies.ts";
export { Identity } from "./resources/identity.ts";
export { Payments } from "./resources/payments.ts";
export { Refunds } from "./resources/refunds.ts";
export { WebhookEndpoints } from "./resources/webhook-endpoints.ts";
export * from "./types.ts";
export {
  SIGNATURE_HEADER,
  type VerifyOptions,
  Webhooks,
} from "./webhooks.ts";
