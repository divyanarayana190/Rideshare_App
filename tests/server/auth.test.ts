import { describe, it, expect } from "vitest";
import { SignJWT, jwtVerify } from "jose";

// Test JWT sign/verify directly (same logic as SDK)
const TEST_SECRET = new TextEncoder().encode("test_secret_key_for_testing_123");

async function signSession(payload: { openId: string; appId: string; name: string }) {
  const expirationSeconds = Math.floor((Date.now() + 86400000) / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(TEST_SECRET);
}

async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, TEST_SECRET, { algorithms: ["HS256"] });
    const { openId, appId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || typeof appId !== "string") return null;
    return { openId, appId, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

describe("Auth Token (JWT)", () => {
  it("creates and verifies a valid session token", async () => {
    const token = await signSession({
      openId: "otp:phone:1234567890",
      appId: "rideshare-dev",
      name: "Test User",
    });

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

    const session = await verifySession(token);
    expect(session).not.toBeNull();
    expect(session!.openId).toBe("otp:phone:1234567890");
    expect(session!.appId).toBe("rideshare-dev");
    expect(session!.name).toBe("Test User");
  });

  it("rejects token signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong_secret");
    const token = await new SignJWT({ openId: "test", appId: "test", name: "Test" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + 86400000) / 1000))
      .sign(wrongSecret);

    const session = await verifySession(token);
    expect(session).toBeNull();
  });

  it("rejects expired token", async () => {
    const token = await new SignJWT({ openId: "test", appId: "test", name: "Test" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() - 10000) / 1000)) // expired 10s ago
      .sign(TEST_SECRET);

    const session = await verifySession(token);
    expect(session).toBeNull();
  });

  it("rejects tampered token", async () => {
    const token = await signSession({ openId: "test", appId: "test", name: "Test" });
    const parts = token.split(".");
    // Tamper with payload
    const tamperedPayload = Buffer.from(JSON.stringify({ openId: "hacker", appId: "evil" })).toString("base64url");
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const session = await verifySession(tampered);
    expect(session).toBeNull();
  });

  it("rejects empty/null tokens", async () => {
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("not-a-jwt")).toBeNull();
    expect(await verifySession("a.b.c")).toBeNull();
  });

  it("handles token without name field", async () => {
    const token = await new SignJWT({ openId: "test:user", appId: "app" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + 86400000) / 1000))
      .sign(TEST_SECRET);

    const session = await verifySession(token);
    expect(session).not.toBeNull();
    expect(session!.name).toBe("");
  });

  it("rejects token without required fields", async () => {
    const token = await new SignJWT({ foo: "bar" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + 86400000) / 1000))
      .sign(TEST_SECRET);

    const session = await verifySession(token);
    expect(session).toBeNull(); // openId and appId are required
  });
});
