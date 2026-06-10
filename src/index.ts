import {
  HttpClient,
  type ClientOptions,
  type FetchLike,
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
 * import { KosovoPay } from "kosovopay";
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

  #identity: Identity;

  constructor(options: ClientOptions | string = {}) {
    const http = new HttpClient(options);
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
}

/**
 * Functional factory, for those who prefer it over `new`. Identical behaviour.
 *
 * ```ts
 * const pay = createKosovoPay({ apiKey: env.KOSOVOPAY_API_KEY });
 * ```
 */
export function createKosovoPay(options: ClientOptions | string = {}): KosovoPay {
  return new KosovoPay(options);
}

export default KosovoPay;

// Public surface.
export {
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  type ClientOptions,
  type FetchLike,
  type RequestOptions,
} from "./client.ts";
export { Page, type PageFetcher } from "./pagination.ts";
export {
  SIGNATURE_HEADER,
  Webhooks,
  type VerifyOptions,
} from "./webhooks.ts";
export {
  KosovoPayApiError,
  KosovoPayConnectionError,
  KosovoPayError,
  KosovoPaySignatureVerificationError,
  KosovoPayTimeoutError,
  type ApiErrorBody,
  type ErrorCode,
  type ErrorType,
} from "./errors.ts";

// Resource classes (handy for typing helpers / DI).
export { Banks } from "./resources/banks.ts";
export { Currencies } from "./resources/currencies.ts";
export { Identity } from "./resources/identity.ts";
export { Payments } from "./resources/payments.ts";
export { Refunds } from "./resources/refunds.ts";
export { WebhookEndpoints } from "./resources/webhook-endpoints.ts";

export * from "./types.ts";
