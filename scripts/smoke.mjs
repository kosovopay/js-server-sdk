// Runtime-agnostic smoke test.
//
// Runs against the BUILT output in ../dist on Node, Bun, and Deno (and, by
// construction, any Workers-style runtime), proving the SDK's web-standard core
// — `fetch`, `AbortController`, Web Crypto, TextEncoder — works with no platform
// shims. The full behavioural suite lives in test/ (bun:test); this is the
// portability gate CI runs on every runtime.

import {
  createKosovoPay,
  KosovoPay,
  KosovoPayApiError,
  SIGNATURE_HEADER,
  Webhooks,
} from "../dist/index.js";

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`smoke assertion failed: ${msg}`);
  passed++;
}

// 1. Client construction + outgoing request shape (auth, idempotency) via an
//    injected fetch — no network.
const calls = [];
const pay = new KosovoPay({
  apiKey: "sk_test_smoke",
  fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "pay_1", status: "captured" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
const payment = await pay.payments.create({
  amount: 1000,
  currency: "EUR",
  mode: "hosted",
  success_url: "https://shop.example.com/thanks",
});
assert(payment.id === "pay_1", "payment created and parsed");
const sent = calls[0].init.headers;
assert(sent.get("Authorization") === "Bearer sk_test_smoke", "auth header set");
assert(Boolean(sent.get("Idempotency-Key")), "idempotency key auto-attached");

// 2. Typed error envelope on a non-2xx response.
const failing = new KosovoPay({
  apiKey: "sk_test",
  maxRetries: 0,
  fetch: async () =>
    new Response(
      JSON.stringify({
        error: {
          type: "validation_error",
          code: "amount_below_minimum",
          message: "too small",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
});
let caught;
try {
  await failing.payments.retrieve("pay_x");
} catch (e) {
  caught = e;
}
assert(
  caught instanceof KosovoPayApiError && caught.code === "amount_below_minimum",
  "typed API error surfaced",
);

// 3. Webhook signature round-trip over Web Crypto.
const secret = "whsec_smoke";
const body = JSON.stringify({ id: "evt_1", type: "payment.captured" });
const t = 1700000000;
const enc = new TextEncoder();
const key = await crypto.subtle.importKey(
  "raw",
  enc.encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`));
const hex = [...new Uint8Array(mac)]
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");
const webhooks = new Webhooks();
const event = await webhooks.constructEvent({
  payload: body,
  signature: `t=${t},v1=${hex}`,
  secret,
  now: t,
});
assert(event.type === "payment.captured", "valid webhook verified + parsed");
const tampered = await webhooks.verify({
  payload: body,
  signature: `t=${t},v1=${"0".repeat(hex.length)}`,
  secret,
  now: t,
});
assert(tampered === false, "tampered webhook signature rejected");

// 4. Exports are intact.
assert(SIGNATURE_HEADER === "Kosovopay-Signature", "SIGNATURE_HEADER exported");
assert(typeof createKosovoPay === "function", "createKosovoPay exported");

const runtime =
  typeof navigator !== "undefined" && navigator.userAgent
    ? navigator.userAgent
    : "this runtime";
console.log(`smoke ok — ${passed} assertions passed on ${runtime}`);
