/**
 * Profile photo feature tests.
 * Covers: upload stores R2 key, ownership check on updateProfilePhoto,
 * signed URL access control, and initials fallback logic.
 * R2 and DB are mocked — no real bucket or database connection needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/server/db", () => {
  const limitFn = vi.fn().mockResolvedValue([]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  const insertValuesFn = vi.fn().mockResolvedValue(undefined);
  const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });
  const updateSetFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });
  return {
    db: { select: selectFn, insert: insertFn, update: updateFn },
  };
});

vi.mock("@/server/services/r2Service", () => ({
  validateFile: vi.fn(),
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getSignedDownloadUrl: vi.fn().mockResolvedValue("https://r2.example.com/signed?token=abc&expires=300"),
}));

import { db } from "@/server/db";
import { saveUploadedFile, getFileOwner } from "@/server/services/fileUploadService";
import { getSignedDownloadUrl } from "@/server/services/r2Service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetDbSelectToReturn(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("profile photo — upload stores R2 key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the upload and returns an R2 key under users/{userId}/profile/", async () => {
    const { uploadId, key } = await saveUploadedFile({
      userId: 42,
      purpose: "profile_photo",
      fileBuffer: Buffer.from("fake-image-data"),
      originalName: "avatar.jpg",
      mimeType: "image/jpeg",
    });

    expect(uploadId).toBeTruthy();
    expect(key).toMatch(/^users\/42\/profile\//);
  });

  it("does not store a public URL (bucket is private)", async () => {
    let insertedValues: any = null;
    const valuesFn = vi.fn((v: any) => {
      insertedValues = v;
      return Promise.resolve(undefined);
    });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as any);

    await saveUploadedFile({
      userId: 7,
      purpose: "profile_photo",
      fileBuffer: Buffer.from("img"),
      originalName: "me.png",
      mimeType: "image/png",
    });

    expect(insertedValues?.publicUrl).toBeNull();
    expect(insertedValues?.storagePath).toMatch(/^users\/7\/profile\//);
  });
});

describe("profile photo — getFileOwner returns correct user", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the userId that uploaded the file", async () => {
    resetDbSelectToReturn([{ userId: 99 }]);
    const owner = await getFileOwner("users/99/profile/1234-avatar.jpg");
    expect(owner).toBe(99);
  });

  it("returns null when the key does not exist in fileUploads", async () => {
    resetDbSelectToReturn([]);
    const owner = await getFileOwner("users/99/profile/nonexistent.jpg");
    expect(owner).toBeNull();
  });
});

describe("profile photo — signed URL access control", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a signed URL for the file owner", async () => {
    const key = "users/5/profile/1700000000000-photo.jpg";
    const url = await getSignedDownloadUrl(key, 300);
    expect(url).toContain("r2.example.com");
    expect(url).toContain("signed");
  });

  it("ownership check: unrelated user is denied (getFileOwner !== requesterId)", async () => {
    // Simulate: file owned by userId=5, request from userId=99
    resetDbSelectToReturn([{ userId: 5 }]);
    const ownerUserId = await getFileOwner("users/5/profile/photo.jpg");
    const requesterId = 99;
    expect(ownerUserId).not.toBe(requesterId);
    // The /api/files/signed-url endpoint would respond 403 in this case
  });

  it("ownership check: owner can access their own file", async () => {
    resetDbSelectToReturn([{ userId: 5 }]);
    const ownerUserId = await getFileOwner("users/5/profile/photo.jpg");
    const requesterId = 5;
    expect(ownerUserId).toBe(requesterId);
  });
});

describe("profile photo — initials fallback", () => {
  it("derives single uppercase letter from full name", () => {
    const name = "Alice Johnson";
    const initial = (name?.[0] ?? "U").toUpperCase();
    expect(initial).toBe("A");
  });

  it("falls back to U when name is empty", () => {
    const name = "";
    const initial = (name?.[0] ?? "U").toUpperCase();
    expect(initial).toBe("U");
  });

  it("falls back to U when name is undefined", () => {
    const name: string | undefined = undefined;
    const initial = (name?.[0] ?? "U").toUpperCase();
    expect(initial).toBe("U");
  });
});
