import crypto from "crypto";
import path from "path";
import { db } from "../db";
import { fileUploads } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import logger from "../logger";
import { uploadFile, deleteFile, validateFile } from "./r2Service";

type UploadPurpose =
  | "profile_photo"
  | "license_front"
  | "license_back"
  | "insurance_doc"
  | "vehicle_photo"
  | "vehicle_registration"
  | "community_logo"
  | "community_banner"
  | "misc";

function buildR2Key(
  userId: number,
  purpose: UploadPurpose,
  originalName: string,
): string {
  const timestamp = Date.now();
  const safeFileName = path
    .basename(originalName)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);

  switch (purpose) {
    case "profile_photo":
      return `users/${userId}/profile/${timestamp}-${safeFileName}`;
    case "license_front":
      return `drivers/${userId}/license/front/${timestamp}-${safeFileName}`;
    case "license_back":
      return `drivers/${userId}/license/back/${timestamp}-${safeFileName}`;
    case "insurance_doc":
      return `drivers/${userId}/insurance/${timestamp}-${safeFileName}`;
    case "vehicle_photo":
      return `drivers/${userId}/vehicle/${timestamp}-${safeFileName}`;
    case "vehicle_registration":
      return `drivers/${userId}/registration/${timestamp}-${safeFileName}`;
    case "community_logo":
      return `communities/${userId}/logo/${timestamp}-${safeFileName}`;
    case "community_banner":
      return `communities/${userId}/banner/${timestamp}-${safeFileName}`;
    default:
      return `users/${userId}/misc/${timestamp}-${safeFileName}`;
  }
}

export async function saveUploadedFile(params: {
  userId: number;
  purpose: UploadPurpose;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
}): Promise<{ uploadId: string; key: string }> {
  const { userId, purpose, fileBuffer, originalName, mimeType } = params;

  validateFile(mimeType, fileBuffer.length);

  const uploadId = crypto.randomUUID();
  const key = buildR2Key(userId, purpose, originalName);

  await uploadFile(key, fileBuffer, mimeType);

  await db.insert(fileUploads).values({
    uploadId,
    userId,
    purpose,
    originalName,
    mimeType,
    sizeBytes: fileBuffer.length,
    storagePath: key, // R2 object key stored here
    publicUrl: null,  // private bucket — no public URL
  });

  return { uploadId, key };
}

export async function getUploadsByUser(userId: number) {
  return db.select().from(fileUploads).where(eq(fileUploads.userId, userId));
}

export async function deleteUpload(uploadId: string, userId: number) {
  const [file] = await db
    .select()
    .from(fileUploads)
    .where(and(eq(fileUploads.uploadId, uploadId), eq(fileUploads.userId, userId)))
    .limit(1);

  if (!file) return false;

  try {
    await deleteFile(file.storagePath);
  } catch (e) {
    logger.warn({ err: e }, "[fileUpload] Failed to delete R2 object");
  }

  await db.delete(fileUploads).where(eq(fileUploads.uploadId, uploadId));
  return true;
}

export async function getFileOwner(r2Key: string): Promise<number | null> {
  const [file] = await db
    .select({ userId: fileUploads.userId })
    .from(fileUploads)
    .where(eq(fileUploads.storagePath, r2Key))
    .limit(1);
  return file ? file.userId : null;
}
