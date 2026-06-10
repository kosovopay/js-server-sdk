/**
 * Resource & parameter types for the KosovoPay API.
 *
 * Every amount in this API is an **integer in minor units** (e.g. `500` = €5.00).
 * There are no floats anywhere — model money as `number` of cents.
 */

import type { ErrorCode } from "./errors.ts";

/** Lets a string-literal union still accept arbitrary strings without losing autocomplete. */
type OpenUnion<T extends string> = T | (string & {});

/** Live vs. test. A key — and everything it creates — is bound to exactly one mode. */
export type Mode = "test" | "live";

/** How the customer reaches the bank when a payment is created. */
export type CheckoutMode = "hosted" | "direct";

/**
 * The payment state machine:
 *
 * ```
 *  created ─► pending ─► authorized ─► captured ─┬─► partially_refunded
 *               │            │                    └─► refunded
 *               ├─► canceled │
 *               └─► expired   └─► failed
 * ```
 */
export type PaymentStatus =
  | "created"
  | "pending"
  | "authorized"
  | "captured"
  | "partially_refunded"
  | "refunded"
  | "canceled"
  | "expired"
  | "failed";

export type RefundStatus = "pending" | "succeeded" | "failed";

export type RefundReason =
  | "requested_by_customer"
  | "duplicate"
  | "fraudulent"
  | "other";

/** Unix epoch seconds — the API never uses milliseconds or ISO strings for timestamps. */
export type UnixTime = number;

/** Free-form string→string map you can attach to payments. */
export type Metadata = Record<string, string>;

export interface Payer {
  name?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface LineItem {
  name?: string;
  /** Minor units. */
  amount?: number;
  quantity?: number;
  [key: string]: unknown;
}

/** FX detail attached to a payment that crossed currencies. */
export interface Fx {
  from: string;
  to: string;
  rate: string;
  [key: string]: unknown;
}

export interface PaymentLastError {
  code: ErrorCode;
  message: string;
  [key: string]: unknown;
}

export interface Payment {
  object: "payment";
  id: string;
  status: PaymentStatus;
  mode: Mode;
  /** Total amount in minor units. */
  amount: number;
  amount_captured: number;
  amount_refunded: number;
  currency: string;
  bank_code: string | null;
  merchant_reference: string | null;
  description: string | null;
  payer: Payer | null;
  line_items: LineItem[] | null;
  metadata: Metadata | null;
  fx: Fx | null;
  last_error: PaymentLastError | null;
  expires_at: UnixTime | null;
  captured_at: UnixTime | null;
  created: UnixTime;
  refunds: Refund[];
  /**
   * Present on `create`. For `mode: "hosted"`, the branded checkout page to send
   * the customer to. `null` for `direct`.
   */
  hosted_url?: string | null;
  /**
   * Present on `create`. For `mode: "direct"`, the bank URL to redirect to. `null`
   * for `hosted`.
   */
  redirect_url?: string | null;
}

export interface Refund {
  object: "refund";
  id: string;
  /** The id of the payment being refunded. */
  payment: string;
  amount: number;
  status: RefundStatus;
  reason: RefundReason | null;
  failure_reason: string | null;
  created: UnixTime;
  succeeded_at: UnixTime | null;
}

export interface BankCapabilities {
  currencies: string[];
  /** Smallest amount this bank accepts, in minor units. */
  min_amount: number;
  /** Amounts must be a multiple of this step, in minor units. */
  amount_step: number;
  refunds: {
    supported: boolean;
    partial: boolean;
  };
}

export interface Bank {
  object: "bank";
  code: string;
  display_name: string;
  logo_url: string | null;
  enabled: boolean;
  modes: Mode[];
  capabilities: BankCapabilities;
}

export interface Currency {
  object: "currency";
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_default: boolean;
}

export interface Rate {
  object: "rate";
  from: string;
  to: string;
  /** Decimal string, not a float — e.g. `"0.9234"`. */
  rate: string;
  /** ISO-8601 timestamp of the last sync. */
  synced_at: string;
  stale: boolean;
}

export interface Me {
  object: "me";
  team: {
    id: string;
    name: string;
    logo_url: string | null;
  };
  mode: Mode;
  key_prefix: string;
  enabled_banks: string[];
  default_currency: string;
}

export type WebhookEndpointStatus = "enabled" | "disabled";

export interface WebhookEndpoint {
  object: "webhook_endpoint";
  id: string;
  url: string;
  description: string | null;
  enabled_events: WebhookEventType[];
  status: WebhookEndpointStatus;
  mode: Mode;
  created: UnixTime;
  /**
   * The signing secret (`whsec_…`). Returned **once**, on `create` and on
   * `rotateSecret` — never on read. Store it; you verify every delivery with it.
   */
  secret?: string;
}

/** A single step in a payment's audit trail. */
export interface TimelineEvent {
  type: WebhookEventType;
  at: UnixTime;
}

export interface DeletedResource<O extends string = string> {
  object: O;
  id: string;
  deleted: true;
}

/** The event types you can subscribe a webhook endpoint to. */
export type WebhookEventType = OpenUnion<
  | "payment.pending"
  | "payment.authorized"
  | "payment.captured"
  | "payment.failed"
  | "payment.canceled"
  | "payment.expired"
  | "payment.partially_refunded"
  | "payment.refunded"
  | "refund.succeeded"
  | "refund.failed"
>;

/** The signed payload delivered to your webhook endpoint. */
export interface Event<T = unknown> {
  object: "event";
  id: string;
  type: WebhookEventType;
  created: UnixTime;
  livemode: boolean;
  api_version: string;
  data: {
    object: T;
  };
}

/** A cursor-paginated list envelope. */
export interface ListResponse<T> {
  object: "list";
  data: T[];
  has_more: boolean;
  url: string;
}

// ---------------------------------------------------------------------------
// Request parameters
// ---------------------------------------------------------------------------

export interface PaymentCreateParams {
  /** Amount in minor units (e.g. `4990` = €49.90). Must be ≥ 1. */
  amount: number;
  /** ISO-4217 code, 3 letters (e.g. `"EUR"`). */
  currency: string;
  /** Where we send the payer after a successful payment. Required. */
  success_url: string;
  /** `"hosted"` (we render checkout) or `"direct"` (you name the bank). */
  mode?: CheckoutMode;
  /** Required for `mode: "direct"`. */
  bank_code?: string;
  cancel_url?: string;
  fail_url?: string;
  description?: string;
  /** Your own order reference; surfaces on the payment and in webhooks. */
  merchant_reference?: string;
  payer?: Payer;
  metadata?: Metadata;
  line_items?: LineItem[];
  /** Unix epoch seconds after which an unpaid payment expires. */
  expires_at?: UnixTime;
}

export interface PaymentListParams {
  /** 1–100, defaults to 10. */
  limit?: number;
  /** Cursor: the `id` of the last item on the previous page. */
  starting_after?: string;
  /** Cursor: the `id` of the first item on the next page. */
  ending_before?: string;
  status?: PaymentStatus;
  bank_code?: string;
  currency?: string;
  merchant_reference?: string;
}

export interface RefundCreateParams {
  /** The payment id to refund. */
  payment: string;
  /** Minor units. Omit for a full refund; pass for a partial (where supported). */
  amount?: number;
  reason?: RefundReason;
}

export interface RefundListParams {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
  /** Filter to a single payment id. */
  payment?: string;
}

export interface WebhookEndpointCreateParams {
  url: string;
  enabled_events: WebhookEventType[];
  description?: string;
}

export interface RateParams {
  /** Source currency code. */
  from: string;
  /** Target currency code. */
  to: string;
}
