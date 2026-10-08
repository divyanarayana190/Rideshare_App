import { describe, expect, it } from "vitest";
import { isEduEmail } from "../../server/services/studentVerificationService";

describe("isEduEmail — student email validation", () => {
  describe("valid .edu addresses", () => {
    it("accepts a standard state.edu address", () => {
      expect(isEduEmail("student@state.edu")).toBe(true);
    });

    it("accepts a well-known university domain", () => {
      expect(isEduEmail("user@mit.edu")).toBe(true);
    });

    it("accepts a subdomain .edu address", () => {
      expect(isEduEmail("user@cs.njit.edu")).toBe(true);
    });
  });

  describe("non-edu addresses that should be rejected", () => {
    it("rejects a Gmail address", () => {
      expect(isEduEmail("user@gmail.com")).toBe(false);
    });

    it("rejects a generic company address", () => {
      expect(isEduEmail("user@company.com")).toBe(false);
    });

    it("rejects an address where .edu is not the TLD", () => {
      // .edu appears mid-domain, does not end with .edu
      expect(isEduEmail("user@university.edu.fake.com")).toBe(false);
    });

    it("rejects a bare .edu domain with no label before the TLD", () => {
      expect(isEduEmail("user@.edu")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("rejects an address with no @ sign", () => {
      expect(isEduEmail("notanemail")).toBe(false);
    });

    it("handles leading/trailing whitespace gracefully", () => {
      expect(isEduEmail("  student@mit.edu  ")).toBe(true);
    });
  });
});
