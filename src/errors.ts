/**
 * Errors.
 *
 * The API returns a typed envelope on failure:
 *
 * ```json
 * { "error": {
 *     "type": "validation_error",
 *     "code": "amount_below_minimum",
 *     "message": "The amount is below the bank's minimum.",
 *     "param": "amount",
 *     "doc_url": "…/errors/amount_below_minimum",
 *     "request_id": "req_01H…"
 * } }
 * ```
 *
 * Always switch on the stable `code` — never on the human-readable `message`.
 */

/** The category an error falls into. */
export type ErrorType =
  | "authentication_error"
  | "validation_error"
  | "rate_limit_error"
  | "idempotency_error"
  | "payment_error"
  | "api_error";

/** Every stable error `code` the API can return. */
export type ErrorCode =
  | "missing_key"
  | "invalid_key"
  | "invalid_request"
  | "resource_missing"
  | "rate_limited"
  | "internal_error"
  | "unknown_api_version"
  | "idempotency_payload_mismatch"
  | "idempotency_conflict"
  | "amount_below_minimum"
  | "amount_step_invalid"
  | "currency_not_supported"
  | "rate_unavailable"
  | "bank_not_enabled"
  | "bank_unreachable"
  | "payment_not_cancelable"
  | "payment_not_refundable"
  | "refund_exceeds_remaining"
  | "partial_refund_unsupported";

export interface ApiErrorBody {
  type: ErrorType;
  code: ErrorCode;
  message: string;
  param?: string;
  doc_url?: string;
  request_id?: string;
}

/** Base class for everything this SDK throws. `instanceof KosovoPayError` catches all. */
export class KosovoPayError extends Error {
  override readonly name: string = "KosovoPayError";

  constructor(message: string) {
    super(message);
    // Restore the prototype chain when targeting older runtimes / down-compiled output.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * A typed error returned by the API. Carries the full error envelope plus the
 * HTTP status and `request_id` (include it in any support request).
 */
export class KosovoPayApiError extends KosovoPayError {
  override readonly name = "KosovoPayApiError";

  readonly type: ErrorType;
  readonly code: ErrorCode;
  readonly param?: string;
  readonly docUrl?: string;
  readonly requestId?: string;
  readonly statusCode: number;
  readonly headers: Headers;

  constructor(body: ApiErrorBody, statusCode: number, headers: Headers) {
    super(body.message);
    this.type = body.type;
    this.code = body.code;
    this.param = body.param;
    this.docUrl = body.doc_url;
    this.requestId = body.request_id;
    this.statusCode = statusCode;
    this.headers = headers;
  }

  /** True for `rate_limited` and transient `5xx` codes — i.e. worth retrying. */
  get isRetryable(): boolean {
    return (
      this.code === "rate_limited" ||
      this.code === "internal_error" ||
      this.code === "bank_unreachable" ||
      this.statusCode >= 500
    );
  }
}

/** A network-level failure (DNS, TCP, TLS, timeout, abort) before a response arrived. */
export class KosovoPayConnectionError extends KosovoPayError {
  override readonly name: string = "KosovoPayConnectionError";
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/** A request that exceeded the configured timeout. */
export class KosovoPayTimeoutError extends KosovoPayConnectionError {
  override readonly name = "KosovoPayTimeoutError";
}

/** A webhook whose signature could not be verified. Reject the delivery (`400`). */
export class KosovoPaySignatureVerificationError extends KosovoPayError {
  override readonly name = "KosovoPaySignatureVerificationError";
}

/** Narrows an `unknown` JSON body to the API error envelope. */
export function isApiErrorBody(body: unknown): body is { error: ApiErrorBody } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "object" &&
    (body as { error: unknown }).error !== null &&
    "code" in (body as { error: object }).error
  );
}
