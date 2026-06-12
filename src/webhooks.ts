import { KosovoPaySignatureVerificationError } from "./errors.ts";
import type { Event } from "./types.ts";

/** The header carrying the signature, e.g. `Kosovopay-Signature`. */
export const SIGNATURE_HEADER = "Kosovopay-Signature";

export interface VerifyOptions {
  /**
   * The **raw** request body, exactly as received — a string or bytes. Do not
   * `JSON.parse` then re-`stringify`; the signature is over the raw bytes.
   */
  payload: string | Uint8Array;
  /** The `Kosovopay-Signature` header value (`t=<unix>,v1=<hmac>`). */
  signature: string;
  /** The endpoint signing secret (`whsec_…`). */
  secret: string;
  /** Max allowed clock skew, in seconds. Default `300` (5 minutes). */
  tolerance?: number;
  /** Override "now" (unix seconds) — for testing. Defaults to the system clock. */
  now?: number;
}

/**
 * Verify a webhook signature and parse the event in one step. Throws
 * {@link KosovoPaySignatureVerificationError} if the signature is missing,
 * malformed, stale, or wrong — so a thrown error maps cleanly to an HTTP `400`.
 *
 * ```ts
 * const event = await pay.webhooks.constructEvent({
 *   payload: rawBody,
 *   signature: req.headers.get("kosovopay-signature")!,
 *   secret: env.KP_WEBHOOK_SECRET,
 * });
 * if (event.type === "payment.captured") { ... }
 * ```
 *
 * Web-Crypto based — runs unchanged on Cloudflare Workers, Bun, Deno, and Node 20+.
 */
export class Webhooks {
  /** Verify the signature and return the typed {@link Event}. Throws on failure. */
  async constructEvent<T = unknown>(opts: VerifyOptions): Promise<Event<T>> {
    const ok = await this.verify(opts);
    if (!ok) {
      throw new KosovoPaySignatureVerificationError(
        "Webhook signature verification failed.",
      );
    }
    const text =
      typeof opts.payload === "string"
        ? opts.payload
        : new TextDecoder().decode(opts.payload);
    return JSON.parse(text) as Event<T>;
  }

  /**
   * Verify the signature, returning a boolean instead of throwing. Use this
   * when you want to handle rejection yourself.
   */
  async verify(opts: VerifyOptions): Promise<boolean> {
    const tolerance = opts.tolerance ?? 300;
    const parsed = parseSignatureHeader(opts.signature);
    if (!parsed) return false;

    const { t, v1 } = parsed;
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(t) || Math.abs(now - t) > tolerance) return false;

    const body =
      typeof opts.payload === "string"
        ? opts.payload
        : new TextDecoder().decode(opts.payload);

    const expected = await hmacSha256Hex(opts.secret, `${t}.${body}`);
    return timingSafeEqualHex(expected, v1);
  }
}

/** Parse `t=<unix>,v1=<hmac>` (whitespace-tolerant, order-independent). */
function parseSignatureHeader(
  header: string,
): { t: number; v1: string } | null {
  if (!header) return null;
  let t: number | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") t = Number(value);
    else if (key === "v1") v1 = value;
  }
  if (t === undefined || v1 === undefined) return null;
  return { t, v1 };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Constant-time comparison of two equal-purpose hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
