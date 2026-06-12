/**
 * Basic usage — create a hosted payment, then verify the webhook that confirms
 * it. Runs on Node, Bun, Deno, and Cloudflare Workers unchanged.
 *
 *   KOSOVOPAY_API_KEY=sk_test_… bun run examples/basic.ts
 */
import { KosovoPay, KosovoPayApiError } from "@kosovopay/server-sdk";

const pay = new KosovoPay(); // reads KOSOVOPAY_API_KEY from the environment

// 1. Create a payment and send the customer to the hosted checkout.
try {
  const payment = await pay.payments.create({
    amount: 4990, // €49.90 — always integer minor units
    currency: "EUR",
    mode: "hosted",
    success_url: "https://shop.example.com/thanks",
  });
  console.log("redirect the customer to:", payment.hosted_url);
} catch (err) {
  if (err instanceof KosovoPayApiError) {
    // Switch on the stable `code`, never the human message.
    console.error(`payment failed [${err.code}]: ${err.message}`);
  } else {
    throw err;
  }
}

// 2. List every captured payment, one network round-trip at a time.
for await (const p of await pay.payments.list({ status: "captured" })) {
  console.log(p.id, p.amount, p.currency);
}

// 3. Verifying a webhook in your HTTP handler (raw body + signature header):
//
//   const event = await pay.webhooks.constructEvent({
//     payload: rawBody,
//     signature: req.headers.get("kosovopay-signature")!,
//     secret: process.env.KOSOVOPAY_WEBHOOK_SECRET!,
//   });
//   if (event.type === "payment.captured") { /* fulfil the order */ }
