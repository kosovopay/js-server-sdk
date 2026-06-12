import { describe, expect, test } from "bun:test";
import {
  type FetchLike,
  KosovoPay,
  KosovoPayApiError,
  KosovoPayTimeoutError,
} from "../src/index.ts";

/** A tiny scriptable fetch double. Returns queued responses and records requests. */
function mockFetch(
  responses: Array<{
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }>,
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...r.headers },
    });
  };
  return { fetch, calls };
}

const payment = {
  object: "payment",
  id: "pi_1",
  status: "pending",
  mode: "test",
  amount: 4990,
  currency: "EUR",
};

describe("HttpClient", () => {
  test("sends auth, version, and accept headers", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { object: "me" } },
    ]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch });
    await pay.me();

    const headers = calls[0]!.init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer sk_test_abc");
    expect(headers.get("Kosovopay-Version")).toBe("2026-06-01");
    expect(headers.get("Accept")).toBe("application/json");
    expect(calls[0]!.url).toBe("https://pay.kosovo.sh/api/sdk/me");
  });

  test("auto-attaches an Idempotency-Key to mutations", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: payment }]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch });
    await pay.payments.create({
      amount: 4990,
      currency: "EUR",
      success_url: "https://x.test/ok",
    });
    const headers = calls[0]!.init.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBeTruthy();
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  test("honours an explicit idempotency key", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: payment }]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch });
    await pay.payments.create(
      { amount: 1, currency: "EUR", success_url: "https://x.test/ok" },
      { idempotencyKey: "order-42" },
    );
    expect((calls[0]!.init.headers as Headers).get("Idempotency-Key")).toBe(
      "order-42",
    );
  });

  test("parses the typed error envelope", async () => {
    const { fetch } = mockFetch([
      {
        status: 422,
        body: {
          error: {
            type: "payment_error",
            code: "amount_below_minimum",
            message: "The amount is below the bank's minimum.",
            param: "amount",
            request_id: "req_1",
          },
        },
      },
    ]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch, maxRetries: 0 });

    const err = await pay.payments
      .create({ amount: 1, currency: "EUR", success_url: "https://x.test/ok" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(KosovoPayApiError);
    expect(err.code).toBe("amount_below_minimum");
    expect(err.type).toBe("payment_error");
    expect(err.param).toBe("amount");
    expect(err.requestId).toBe("req_1");
    expect(err.statusCode).toBe(422);
  });

  test("retries on 429 then succeeds", async () => {
    const { fetch, calls } = mockFetch([
      {
        status: 429,
        body: {
          error: {
            type: "rate_limit_error",
            code: "rate_limited",
            message: "slow down",
          },
        },
        headers: { "retry-after": "0" },
      },
      { status: 200, body: { object: "me" } },
    ]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch });
    await pay.me();
    expect(calls.length).toBe(2);
  });

  test("request() escape hatch sends method, path, body, and query", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { ok: true } }]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch });

    const res = await pay.request<{ ok: boolean }>("POST", "/custom/thing", {
      body: { a: 1 },
      query: { x: 2 },
    });

    expect(res).toEqual({ ok: true });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/sdk/custom/thing");
    expect(url.searchParams.get("x")).toBe("2");
    const headers = calls[0]!.init.headers as Headers;
    // POST is a mutation, so it gets an auto idempotency key.
    expect(headers.get("Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ a: 1 });
  });

  test("a caller abort surfaces as abort, not a timeout, and isn't retried", async () => {
    const calls: RequestInit[] = [];
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        calls.push(init);
        const abort = () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        };
        if (init.signal?.aborted) return abort();
        init.signal?.addEventListener("abort", abort);
      });

    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch, maxRetries: 2 });
    const controller = new AbortController();
    const promise = pay.me({ signal: controller.signal });
    controller.abort();

    const err = await promise.catch((e) => e);
    expect(err.name).toBe("AbortError");
    expect(err).not.toBeInstanceOf(KosovoPayTimeoutError);
    expect(calls.length).toBe(1); // never retried
  });

  test("query params are serialized and undefined dropped", async () => {
    const { fetch, calls } = mockFetch([
      {
        status: 200,
        body: { object: "list", data: [], has_more: false, url: "/payments" },
      },
    ]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch });
    await pay.payments.list({
      limit: 50,
      status: "captured",
      currency: undefined,
    });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("status")).toBe("captured");
    expect(url.searchParams.has("currency")).toBe(false);
  });
});

describe("pagination", () => {
  test("auto-paginates across pages when iterated", async () => {
    const page1 = {
      object: "list",
      has_more: true,
      url: "/payments",
      data: [
        { ...payment, id: "pi_1" },
        { ...payment, id: "pi_2" },
      ],
    };
    const page2 = {
      object: "list",
      has_more: false,
      url: "/payments",
      data: [{ ...payment, id: "pi_3" }],
    };
    const { fetch, calls } = mockFetch([
      { status: 200, body: page1 },
      { status: 200, body: page2 },
    ]);
    const pay = new KosovoPay({ apiKey: "sk_test_abc", fetch });

    const ids: string[] = [];
    for await (const p of await pay.payments.list({ limit: 2 })) ids.push(p.id);

    expect(ids).toEqual(["pi_1", "pi_2", "pi_3"]);
    // Second page requested with starting_after = last id of page 1.
    expect(new URL(calls[1]!.url).searchParams.get("starting_after")).toBe(
      "pi_2",
    );
  });
});
