# @kosovopay/server-sdk

[![CI](https://github.com/kosovopay/js-server-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/kosovopay/js-server-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@kosovopay/server-sdk.svg)](https://www.npmjs.com/package/@kosovopay/server-sdk)

> Type-safe, runtime-agnostic server SDK for the [KosovoPay](https://pay.kosovo.sh/docs) payment orchestrator.

One client. Runs unchanged on **Node 20+**, **Bun**, **Deno**, and **Cloudflare Workers** — built entirely on web-standard `fetch` and Web Crypto, with **zero dependencies**. Fully typed end to end: every resource, parameter, error `code`, and webhook event is inferred for you.

```ts
import { KosovoPay } from "@kosovopay/server-sdk";

const pay = new KosovoPay(process.env.KOSOVOPAY_API_KEY!);

const payment = await pay.payments.create({
  amount: 4990,            // €49.90 — always integer minor units
  currency: "EUR",
  mode: "hosted",
  success_url: "https://shop.example.com/thanks",
});

// Redirect the customer to payment.hosted_url
```

---

## Why

KosovoPay is a **payment orchestrator**: you bring your own bank acquiring credentials (BYOK), it runs the lifecycle, hosted checkout, reconciliation, and webhooks. This SDK is a thin, faithful, deeply-typed layer over that REST API.

- **One core, every runtime.** No `node:crypto`, no `axios`, no platform shims. The same instance works in a Lambda, a Worker, a Bun server, or a Deno edge function.
- **Types are the product.** Switch on a payment's `status` or an error's `code` and the compiler has your back. No `any` leaks.
- **Safe by default.** Mutating calls get an auto-generated `Idempotency-Key`, so the SDK's own retries can never double-charge. Transient `429`/`5xx`/network failures are retried with jittered backoff that honours `Retry-After`.
- **Auto-pagination.** `for await … of` walks every page; one round-trip at a time.

## Install

```bash
bun add @kosovopay/server-sdk
# or: npm i @kosovopay/server-sdk / pnpm add @kosovopay/server-sdk / deno add npm:@kosovopay/server-sdk
```

## Configuration

```ts
const pay = new KosovoPay({
  apiKey: process.env.KOSOVOPAY_API_KEY, // or set KOSOVOPAY_API_KEY and pass nothing
  baseUrl: "https://pay.kosovo.sh/api/sdk", // override for staging
  apiVersion: "2026-06-01",                 // pinned so behaviour never shifts
  maxRetries: 2,                            // transient-failure retries
  timeout: 60_000,                          // per request, ms (0 disables)
  fetch: myFetch,                           // inject a custom fetch
  defaultHeaders: { "X-Trace": "…" },
});
```

A key is bound to one **team** and one **mode** (`sk_test_…` / `sk_live_…`). Keep it server-side. There's also a functional factory if you prefer it: `createKosovoPay({ … })`.

## Amounts

Every amount is an **integer in minor units** — `4990` is €49.90. There are no floats anywhere in the API.

---

## Payments

```ts
// Hosted checkout — we render the page, the customer picks the bank.
const payment = await pay.payments.create({
  amount: 4990,
  currency: "EUR",
  mode: "hosted",
  success_url: "https://shop.example.com/thanks",
  cancel_url: "https://shop.example.com/cart",
  metadata: { order_id: "O-1234" },
});
// → redirect the browser to payment.hosted_url

// Direct checkout — you pick the bank, straight to the bank page.
const direct = await pay.payments.create({
  amount: 2500,
  currency: "EUR",
  mode: "direct",
  bank_code: "onefor",
  success_url: "https://shop.example.com/ok",
  fail_url: "https://shop.example.com/failed",
});
// → redirect to direct.redirect_url

const fresh = await pay.payments.retrieve("pi_…");
await pay.payments.cancel("pi_…");
const timeline = await pay.payments.timeline("pi_…"); // ordered audit trail
```

> **Never trust the browser redirect.** The `?payment_id=…&status=…` query params are for UX only. Confirm the real state with a webhook (recommended) or a server-side `retrieve()` before fulfilling an order. A background reconciler settles abandoned redirects within ~60s, so you never lose a payment.

### Listing & auto-pagination

`list()` returns one `Page`. Use it as a page, or iterate it to stream every record across all pages:

```ts
// One page:
const page = await pay.payments.list({ limit: 50, status: "captured" });
console.log(page.data, page.has_more);

// Every matching payment, transparently paginated:
for await (const payment of await pay.payments.list({ status: "captured" })) {
  console.log(payment.id, payment.amount);
}

// Or collect it all:
const all = await (await pay.refunds.list({ payment: "pi_…" })).toArray();
```

## Refunds

```ts
// Full refund: omit amount. Partial: pass it (where the bank supports partials).
const refund = await pay.refunds.create({
  payment: "pi_…",
  amount: 1000,
  reason: "requested_by_customer",
});

await pay.refunds.retrieve("re_…");
await pay.refunds.list({ payment: "pi_…" });
```

## Banks, currencies & FX

```ts
const banks = await pay.banks.list();          // capabilities, min amount, modes…
const onefor = await pay.banks.retrieve("onefor");

const currencies = await pay.currencies.list();
const rate = await pay.currencies.rate({ from: "USD", to: "EUR" });
// rate.rate is a decimal string, e.g. "0.9234"; check rate.stale before relying on it.
```

## Identity

```ts
const me = await pay.me();
// → { team, mode, key_prefix, enabled_banks, default_currency }
```

---

## Escape hatch

Need an endpoint this SDK version doesn't model yet? `pay.request()` calls any
path directly with the same auth, versioning, retries, and idempotency the typed
resources get:

```ts
const res = await pay.request<{ ok: boolean }>("POST", "/some/new/endpoint", {
  body: { foo: "bar" },
  query: { expand: "details" },
});
```

---

## Webhooks

Webhooks — not the browser redirect — are the source of truth for fulfilment. Register an endpoint, store the one-time `secret`, and verify every delivery.

### Register an endpoint

```ts
const endpoint = await pay.webhookEndpoints.create({
  url: "https://shop.example.com/webhooks/kosovopay",
  enabled_events: ["payment.captured", "refund.succeeded"],
});
console.log(endpoint.secret); // whsec_… — shown ONCE. Store it now.

await pay.webhookEndpoints.list();
await pay.webhookEndpoints.rotateSecret(endpoint.id); // returns a new secret
await pay.webhookEndpoints.del(endpoint.id);
```

### Verify & handle a delivery

`pay.webhooks.constructEvent()` verifies the HMAC-SHA256 signature (constant-time, with a 5-minute replay window) and returns the typed `Event`. It throws `KosovoPaySignatureVerificationError` on anything suspicious — map that straight to a `400`.

Pass the **raw** request body, never a re-serialized object.

**Cloudflare Workers**

```ts
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const raw = await req.text();
    try {
      const event = await pay.webhooks.constructEvent({
        payload: raw,
        signature: req.headers.get("kosovopay-signature")!,
        secret: env.KP_WEBHOOK_SECRET,
      });

      switch (event.type) {
        case "payment.captured":
          await fulfil((event.data.object as Payment).metadata?.order_id);
          break;
        case "refund.succeeded":
          await reverse(event.data.object as Refund);
          break;
      }
      return new Response(null, { status: 200 });
    } catch {
      return new Response("bad signature", { status: 400 });
    }
  },
};
```

**Node / Express** (give the route the raw body, e.g. `express.raw({ type: "application/json" })`):

```ts
app.post("/webhooks/kosovopay", async (req, res) => {
  try {
    const event = await pay.webhooks.constructEvent({
      payload: req.body, // Buffer/Uint8Array or string — both accepted
      signature: req.header("kosovopay-signature")!,
      secret: process.env.KP_WEBHOOK_SECRET!,
    });
    handle(event);
    res.sendStatus(200);
  } catch {
    res.sendStatus(400);
  }
});
```

Return any `2xx` to acknowledge. Non-2xx or a timeout triggers retries (1m → 5m → 30m → 2h → 12h → 24h) before the delivery is dead-lettered.

---

## Errors

Every API failure throws a typed `KosovoPayApiError`. Switch on the stable `code`, never the message:

```ts
import { KosovoPayApiError } from "@kosovopay/server-sdk";

try {
  await pay.payments.create({ amount: 1, currency: "EUR", success_url: "…" });
} catch (err) {
  if (err instanceof KosovoPayApiError) {
    switch (err.code) {
      case "amount_below_minimum":
      case "amount_step_invalid":
        // err.param tells you which field, err.docUrl explains the code
        break;
      case "rate_limited":
        // err.isRetryable === true
        break;
    }
    console.error(err.requestId); // include in any support request
  }
}
```

The error hierarchy (all extend `KosovoPayError`):

| Class | Thrown when |
|---|---|
| `KosovoPayApiError` | The API returned a typed error envelope (`code`, `type`, `param`, `docUrl`, `requestId`, `statusCode`). |
| `KosovoPayConnectionError` | A network failure before any response. |
| `KosovoPayTimeoutError` | The request exceeded `timeout` (or was aborted). |
| `KosovoPaySignatureVerificationError` | A webhook signature didn't verify. |

`ErrorCode` is a closed union of all 19 stable codes (`amount_below_minimum`, `bank_not_enabled`, `refund_exceeds_remaining`, …) — exhaustive `switch`es type-check.

## Idempotency & retries

Mutating requests auto-attach a unique `Idempotency-Key`, so the SDK's built-in retries are always safe. To make your *own* retries safe across process restarts, pass a stable key:

```ts
await pay.payments.create(params, { idempotencyKey: `order-${orderId}` });
```

Replaying a key returns the original response for 24h. Replaying it with a *different* body raises `idempotency_payload_mismatch`.

Per-call overrides are available on every method:

```ts
await pay.payments.retrieve("pi_…", { signal, apiVersion: "2026-06-01", maxRetries: 5 });
```

## Going live

1. Configure live bank credentials for the team.
2. Swap `sk_test_…` for `sk_live_…`.
3. Use **https** URLs (required in live mode).
4. Verify webhook signatures and confirm payment state server-side before fulfilling.

---

## Development

```bash
bun install
bun run ci      # typecheck + lint + tests (what CI runs)
bun run smoke   # build, then run the smoke test on the current runtime
bun run build
```

CI proves the cross-runtime promise: the built output is verified to contain no
Node builtins and the smoke test runs on **Node 20/22/24, Bun, and Deno**.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) to get started and
[`SECURITY.md`](./SECURITY.md) to report a vulnerability.

## License

MIT

