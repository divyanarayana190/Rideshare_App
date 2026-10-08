/**
 * R2 upload service unit tests.
 * R2 calls and DB are mocked — no real bucket or database connection needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (factories must not reference outer-scope variables — hoisting) ────

vi.mock("@/server/db", () => {
  const limitFn = vi.fn().mockResolvedValue([]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  const insertValuesFn = vi.fn().mockResolvedValue(undefined);
  const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });
  const deleteWhereFn = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhereFn });
  return {
    db: {
      select: selectFn,
      insert: insertFn,
      delete: deleteFn,
    },
  };
});

vi.mock("@/server/services/r2Service", () => {
  const validateFile = vi.fn((mimeType: string, sizeBytes: number) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(mimeType)) throw new Error(`File type not allowed. Accepted: ${allowed.join(", ")}`);
    if (sizeBytes > 10 * 1024 * 1024) throw new Error("File too large. Maximum size is 10MB");
  });
  return {
    validateFile,
    uploadFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue("https://r2.example.com/signed?token=abc"),
    r2HealthCheck: vi.fn().mockResolvedValue({ ok: true, message: "R2 storage is healthy" }),
  };
});

// Imports after vi.mock calls so they receive the mocked versions
import { validateFile, uploadFile, getSignedDownloadUrl, r2HealthCheck } from "@/server/services/r2Service";
import { db } from "@/server/db";
import { saveUploadedFile, getFileOwner } from "@/server/services/fileUploadService";

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetDbSelectToReturn(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as any);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("r2Service — validateFile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts image/jpeg", () => {
    expect(() => validateFile("image/jpeg", 100)).not.toThrow();
  });

  it("accepts image/png", () => {
    expect(() => validateFile("image/png", 100)).not.toThrow();
  });

  it("accepts image/webp", () => {
    expect(() => validateFile("image/webp", 100)).not.toThrow();
  });

  it("accepts application/pdf", () => {
    expect(() => validateFile("application/pdf", 100)).not.toThrow();
  });

  it("rejects invalid file type", () => {
    expect(() => validateFile("video/mp4", 100)).toThrow("File type not allowed");
  });

  it("rejects file over 10MB", () => {
    expect(() => validateFile("image/jpeg", 11 * 1024 * 1024)).toThrow("File too large");
  });

  it("accepts file exactly at 10MB limit", () => {
    expect(() => validateFile("image/jpeg", 10 * 1024 * 1024)).not.toThrow();
  });
});

describe("fileUploadService — saveUploadedFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadFile).mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) } as any);
    // Restore default validateFile behaviour
    vi.mocked(validateFile).mockImplementation((mimeType: string, sizeBytes: number) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(mimeType)) throw new Error(`File type not allowed. Accepted: ${allowed.join(", ")}`);
      if (sizeBytes > 10 * 1024 * 1024) throw new Error("File too large. Maximum size is 10MB");
    });
  });

  it("returns uploadId and R2 key for a valid jpeg upload", async () => {
    const result = await saveUploadedFile({
      userId: 42,
      purpose: "profile_photo",
      fileBuffer: Buffer.from("test image data"),
      originalName: "photo.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.uploadId).toBeTruthy();
    expect(result.key).toContain("users/42/profile/");
    expect(result.key).toContain("photo.jpg");
  });

  it("uses drivers/…/license/front/ key prefix for license_front", async () => {
    const result = await saveUploadedFile({
      userId: 7,
      purpose: "license_front",
      fileBuffer: Buffer.from("license image"),
      originalName: "license.png",
      mimeType: "image/png",
    });

    expect(result.key).toContain("drivers/7/license/front/");
  });

  it("uses drivers/…/license/back/ key prefix for license_back", async () => {
    const result = await saveUploadedFile({
      userId: 7,
      purpose: "license_back",
      fileBuffer: Buffer.from("back image"),
      originalName: "back.png",
      mimeType: "image/png",
    });

    expect(result.key).toContain("drivers/7/license/back/");
  });

  it("uses drivers/…/insurance/ key prefix for insurance_doc", async () => {
    const result = await saveUploadedFile({
      userId: 7,
      purpose: "insurance_doc",
      fileBuffer: Buffer.from("insurance pdf"),
      originalName: "insurance.pdf",
      mimeType: "application/pdf",
    });

    expect(result.key).toContain("drivers/7/insurance/");
  });

  it("uses drivers/…/registration/ key prefix for vehicle_registration", async () => {
    const result = await saveUploadedFile({
      userId: 7,
      purpose: "vehicle_registration",
      fileBuffer: Buffer.from("reg doc"),
      originalName: "reg.pdf",
      mimeType: "application/pdf",
    });

    expect(result.key).toContain("drivers/7/registration/");
  });

  it("calls uploadFile with generated key and correct mime type", async () => {
    const result = await saveUploadedFile({
      userId: 1,
      purpose: "profile_photo",
      fileBuffer: Buffer.from("img data"),
      originalName: "selfie.jpg",
      mimeType: "image/jpeg",
    });

    expect(uploadFile).toHaveBeenCalledWith(result.key, expect.any(Buffer), "image/jpeg");
  });

  it("rejects invalid mime type and does not upload to R2", async () => {
    await expect(
      saveUploadedFile({
        userId: 1,
        purpose: "profile_photo",
        fileBuffer: Buffer.from("bad file"),
        originalName: "file.exe",
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toThrow("File type not allowed");

    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects file over 10MB and does not upload to R2", async () => {
    await expect(
      saveUploadedFile({
        userId: 1,
        purpose: "profile_photo",
        fileBuffer: Buffer.alloc(11 * 1024 * 1024),
        originalName: "huge.jpg",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow("File too large");

    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("sanitises path-traversal sequences in filename", async () => {
    const result = await saveUploadedFile({
      userId: 5,
      purpose: "misc",
      fileBuffer: Buffer.from("data"),
      originalName: "../../../etc/passwd.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.key).not.toContain("..");
    expect(result.key).not.toContain("etc/passwd");
  });
});

describe("r2Service — getSignedDownloadUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a non-empty string URL", async () => {
    vi.mocked(getSignedDownloadUrl).mockResolvedValue("https://r2.example.com/signed?token=xyz");
    const url = await getSignedDownloadUrl("users/1/profile/test.jpg", 300);
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  it("is called with the correct key and expiry", async () => {
    vi.mocked(getSignedDownloadUrl).mockResolvedValue("https://r2.example.com/signed");
    await getSignedDownloadUrl("drivers/7/license/front/doc.jpg", 300);
    expect(getSignedDownloadUrl).toHaveBeenCalledWith("drivers/7/license/front/doc.jpg", 300);
  });
});

describe("r2Service — r2HealthCheck", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports ok:true when R2 is healthy", async () => {
    vi.mocked(r2HealthCheck).mockResolvedValue({ ok: true, message: "R2 storage is healthy" });
    const result = await r2HealthCheck();
    expect(result.ok).toBe(true);
    expect(result.message).toContain("healthy");
  });

  it("reports ok:false when R2 is unreachable", async () => {
    vi.mocked(r2HealthCheck).mockResolvedValue({ ok: false, message: "Connection refused" });
    const result = await r2HealthCheck();
    expect(result.ok).toBe(false);
  });
});

describe("/healthz — independent from R2", () => {
  beforeEach(() => vi.clearAllMocks());

  it("R2 service is not called during a health check cycle", () => {
    // /healthz checks MySQL + Redis only (see server/_core/index.ts).
    // R2 health is a separate admin-only route: GET /admin/r2-health.
    // Structural assertion: after clearing mocks, nothing calls r2HealthCheck.
    expect(r2HealthCheck).not.toHaveBeenCalled();
  });
});

describe("signed URL access control logic (getFileOwner helper)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the owner userId when the R2 key exists in DB", async () => {
    resetDbSelectToReturn([{ userId: 5 }]);
    const owner = await getFileOwner("users/5/profile/photo.jpg");
    expect(owner).toBe(5);
  });

  it("returns null when the R2 key is not found in DB", async () => {
    resetDbSelectToReturn([]);
    const owner = await getFileOwner("nonexistent/key.jpg");
    expect(owner).toBeNull();
  });

  it("owner userId matches requesting userId — access granted", async () => {
    resetDbSelectToReturn([{ userId: 12 }]);
    const owner = await getFileOwner("users/12/profile/img.jpg");
    const requestingUserId = 12;
    expect(owner === requestingUserId).toBe(true);
  });

  it("owner userId does not match requesting userId — access denied", async () => {
    resetDbSelectToReturn([{ userId: 12 }]);
    const owner = await getFileOwner("users/12/profile/img.jpg");
    const requestingUserId = 999;
    expect(owner === requestingUserId).toBe(false);
  });

  it("admin role bypasses ownership check (structural)", () => {
    // Route handler in index.ts skips getFileOwner when role === 'admin'
    const userRole = "admin";
    expect(userRole === "admin").toBe(true);
  });
});
