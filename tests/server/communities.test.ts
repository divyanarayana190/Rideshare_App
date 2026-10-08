import { describe, expect, it } from "vitest";
import {
  emailMatchesDomain,
  generateInviteCode,
  haversineMiles,
  normalizeDomain,
  resolveJoinStatus,
  slugifyCommunityName,
} from "../../server/services/communityService";

describe("slugifyCommunityName", () => {
  it("lowercases and hyphenates names", () => {
    expect(slugifyCommunityName("NJIT Carpool")).toBe("njit-carpool");
  });

  it("strips special characters", () => {
    expect(slugifyCommunityName("Hello!!! World???")).toBe("hello-world");
  });
});

describe("emailMatchesDomain", () => {
  it("matches email domain case-insensitively", () => {
    expect(emailMatchesDomain("student@NJIT.edu", "njit.edu")).toBe(true);
  });

  it("rejects mismatched domain", () => {
    expect(emailMatchesDomain("user@gmail.com", "njit.edu")).toBe(false);
  });
});

describe("normalizeDomain", () => {
  it("strips leading @", () => {
    expect(normalizeDomain("@NJIT.edu")).toBe("njit.edu");
  });
});

describe("resolveJoinStatus", () => {
  it("auto-approves public community with no verification", () => {
    expect(
      resolveJoinStatus({
        visibility: "public",
        verificationType: "none",
        hasValidInvite: false,
        emailDomainOk: true,
      }),
    ).toBe("active");
  });

  it("pending for private communities", () => {
    expect(
      resolveJoinStatus({
        visibility: "private",
        verificationType: "none",
        hasValidInvite: false,
        emailDomainOk: true,
      }),
    ).toBe("pending");
  });

  it("rejects edu mismatch", () => {
    expect(
      resolveJoinStatus({
        visibility: "public",
        verificationType: "edu_email",
        hasValidInvite: false,
        emailDomainOk: false,
      }),
    ).toBe("rejected");
  });

  it("pending for invite-only without code", () => {
    expect(
      resolveJoinStatus({
        visibility: "invite_only",
        verificationType: "none",
        hasValidInvite: false,
        emailDomainOk: true,
      }),
    ).toBe("pending");
  });
});

describe("generateInviteCode", () => {
  it("returns 8-char uppercase hex", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-F]{8}$/);
  });
});

describe("haversineMiles", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(haversineMiles(40.742, -74.179, 40.742, -74.179)).toBeCloseTo(0, 3);
  });

  it("returns positive distance for separated points", () => {
    const d = haversineMiles(40.742, -74.179, 40.75, -74.17);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(5);
  });
});
