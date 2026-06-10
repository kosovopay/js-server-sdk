import { describe, expect, test } from "bun:test";
import {
  KosovoPaySignatureVerificationError,
  Webhooks,
} from "../src/index.ts";

const SECRET = "whsec_test_secret";

/** Build a valid `t=<unix>,v1=<hmac>` header for a payload, the way the API does. */
async function sign(payload: string, secret: string, t: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${t}.${payload}`),
  );
  const hex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${t},v1=${hex}`;
}

const body = JSON.stringify({
  object: "event",
  id: "evt_1",
  type: "payment.captured",
  data: { object: { object: "payment", id: "pi_1", status: "captured" } },
});

describe("Webhooks", () => {
  const webhooks = new Webhooks();
  const now = 1_749_600_200;

  test("verifies a valid signature", async () => {
    const signature = await sign(body, SECRET, now);
    expect(await webhooks.verify({ payload: body, signature, secret: SECRET, now })).toBe(true);
  });

  test("constructEvent returns the typed event", async () => {
    const signature = await sign(body, SECRET, now);
    const event = await webhooks.constructEvent({ payload: body, signature, secret: SECRET, now });
    expect(event.type).toBe("payment.captured");
    expect((event.data.object as { id: string }).id).toBe("pi_1");
  });

  test("rejects a tampered body", async () => {
    const signature = await sign(body, SECRET, now);
    const tampered = body.replace("pi_1", "pi_999");
    expect(await webhooks.verify({ payload: tampered, signature, secret: SECRET, now })).toBe(false);
  });

  test("rejects the wrong secret", async () => {
    const signature = await sign(body, SECRET, now);
    expect(await webhooks.verify({ payload: body, signature, secret: "whsec_wrong", now })).toBe(false);
  });

  test("rejects a stale timestamp (replay)", async () => {
    const signature = await sign(body, SECRET, now);
    expect(
      await webhooks.verify({ payload: body, signature, secret: SECRET, now: now + 600 }),
    ).toBe(false);
  });

  test("rejects a malformed header", async () => {
    expect(await webhooks.verify({ payload: body, signature: "nonsense", secret: SECRET, now })).toBe(false);
  });

  test("constructEvent throws on a bad signature", async () => {
    await expect(
      webhooks.constructEvent({ payload: body, signature: "t=1,v1=deadbeef", secret: SECRET, now }),
    ).rejects.toBeInstanceOf(KosovoPaySignatureVerificationError);
  });

  test("accepts a Uint8Array payload", async () => {
    const signature = await sign(body, SECRET, now);
    const bytes = new TextEncoder().encode(body);
    expect(await webhooks.verify({ payload: bytes, signature, secret: SECRET, now })).toBe(true);
  });
});
