import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror of the Zod schemas used in server/routers.ts so tests are self-contained
// and don't require a live DB or Stripe connection.

const optionalEmail = (field = "email") =>
  z.preprocess(v => (v === "" ? undefined : v), z.string().email(`Invalid ${field}`).optional());

const verifyOtpSchema = z.object({
  method: z.enum(["phone", "email"]),
  destination: z.string().min(3),
  code: z.string().length(6),
  purpose: z.enum(["signup", "login"]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: optionalEmail("email"),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional(),
  role: z.enum(["user", "driver"]).optional(),
  isStudent: z.boolean().optional(),
  collegeEmail: optionalEmail("college email"),
  password: z.string().min(8).optional(),
});

const registerWithPasswordSchema = z.object({
  method: z.enum(["phone", "email"]),
  destination: z.string().min(3),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: optionalEmail(),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional(),
  role: z.enum(["user", "driver"]).optional(),
  isStudent: z.boolean().optional(),
  collegeEmail: optionalEmail("college email"),
});

// ── verifyOtp schema ────────────────────────────────────────────────────────

describe("verifyOtp input validation", () => {
  const base = {
    method: "phone" as const,
    destination: "5551234567",
    code: "123456",
    purpose: "signup" as const,
    firstName: "Jane",
    lastName: "Doe",
  };

  describe("phone-only signup (no email)", () => {
    it("accepts when email is absent", () => {
      expect(() => verifyOtpSchema.parse(base)).not.toThrow();
    });

    it("accepts when email is undefined", () => {
      expect(() => verifyOtpSchema.parse({ ...base, email: undefined })).not.toThrow();
    });

    it("converts empty string email to undefined (no error)", () => {
      const result = verifyOtpSchema.parse({ ...base, email: "" });
      expect(result.email).toBeUndefined();
    });
  });

  describe("email-only signup", () => {
    it("accepts valid email address", () => {
      const input = {
        method: "email" as const,
        destination: "jane@example.com",
        code: "123456",
        purpose: "signup" as const,
        firstName: "Jane",
        lastName: "Doe",
      };
      expect(() => verifyOtpSchema.parse(input)).not.toThrow();
    });
  });

  describe("phone + email signup", () => {
    it("accepts phone destination with supplemental email", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, email: "jane@example.com" })
      ).not.toThrow();
    });
  });

  describe("email field format validation", () => {
    it("rejects malformed email", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, email: "not-an-email" })
      ).toThrow();
    });

    it("rejects email missing @", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, email: "userexample.com" })
      ).toThrow();
    });

    it("accepts valid college email", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, collegeEmail: "jane@state.edu" })
      ).not.toThrow();
    });

    it("rejects malformed college email", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, collegeEmail: "not-an-email" })
      ).toThrow();
    });

    it("converts empty string collegeEmail to undefined", () => {
      const result = verifyOtpSchema.parse({ ...base, collegeEmail: "" });
      expect(result.collegeEmail).toBeUndefined();
    });
  });

  describe("OTP code validation", () => {
    it("accepts exactly 6 digits", () => {
      expect(() => verifyOtpSchema.parse(base)).not.toThrow();
    });

    it("rejects 5-digit code", () => {
      expect(() => verifyOtpSchema.parse({ ...base, code: "12345" })).toThrow();
    });

    it("rejects 7-digit code", () => {
      expect(() => verifyOtpSchema.parse({ ...base, code: "1234567" })).toThrow();
    });

    it("rejects empty code", () => {
      expect(() => verifyOtpSchema.parse({ ...base, code: "" })).toThrow();
    });
  });

  describe("purpose validation", () => {
    it("accepts signup purpose", () => {
      expect(() => verifyOtpSchema.parse({ ...base, purpose: "signup" })).not.toThrow();
    });

    it("accepts login purpose", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, purpose: "login", firstName: undefined, lastName: undefined })
      ).not.toThrow();
    });

    it("rejects unknown purpose", () => {
      expect(() => verifyOtpSchema.parse({ ...base, purpose: "register" as any })).toThrow();
    });
  });

  describe("password-mode signup", () => {
    it("accepts valid password", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, password: "securePass123" })
      ).not.toThrow();
    });

    it("rejects password shorter than 8 characters", () => {
      expect(() =>
        verifyOtpSchema.parse({ ...base, password: "short" })
      ).toThrow();
    });

    it("accepts no password (OTP-only mode)", () => {
      expect(() => verifyOtpSchema.parse(base)).not.toThrow();
    });
  });
});

// ── registerWithPassword schema ─────────────────────────────────────────────

describe("registerWithPassword input validation", () => {
  const base = {
    method: "phone" as const,
    destination: "5551234567",
    password: "securePass123",
    firstName: "Jane",
    lastName: "Doe",
  };

  it("accepts phone-only (no email)", () => {
    expect(() => registerWithPasswordSchema.parse(base)).not.toThrow();
  });

  it("converts empty string email to undefined", () => {
    const result = registerWithPasswordSchema.parse({ ...base, email: "" });
    expect(result.email).toBeUndefined();
  });

  it("accepts valid supplemental email", () => {
    expect(() =>
      registerWithPasswordSchema.parse({ ...base, email: "jane@example.com" })
    ).not.toThrow();
  });

  it("rejects malformed email", () => {
    expect(() =>
      registerWithPasswordSchema.parse({ ...base, email: "bad-email" })
    ).toThrow();
  });

  it("rejects password shorter than 8 chars", () => {
    expect(() =>
      registerWithPasswordSchema.parse({ ...base, password: "short" })
    ).toThrow();
  });

  it("rejects missing first name", () => {
    expect(() =>
      registerWithPasswordSchema.parse({ ...base, firstName: "" })
    ).toThrow();
  });

  it("rejects missing last name", () => {
    expect(() =>
      registerWithPasswordSchema.parse({ ...base, lastName: "" })
    ).toThrow();
  });

  it("accepts email as primary method", () => {
    expect(() =>
      registerWithPasswordSchema.parse({
        ...base,
        method: "email",
        destination: "jane@example.com",
      })
    ).not.toThrow();
  });
});
