import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "../_core/env";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SIGNED_URL_TTL = 300; // 5 minutes

function createClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: ENV.r2Endpoint,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
  });
}

export function validateFile(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`File type not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(", ")}`);
  }
  if (sizeBytes > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
}

export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const client = createClient();
  await client.send(
    new PutObjectCommand({
      Bucket: ENV.r2BucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

export async function deleteFile(key: string): Promise<void> {
  const client = createClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: ENV.r2BucketName,
      Key: key,
    }),
  );
}

export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = SIGNED_URL_TTL,
): Promise<string> {
  const client = createClient();
  const command = new GetObjectCommand({
    Bucket: ENV.r2BucketName,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function r2HealthCheck(): Promise<{
  ok: boolean;
  message: string;
  details?: Record<string, string>;
}> {
  const missing = [
    ["R2_ACCOUNT_ID", ENV.r2AccountId],
    ["R2_ACCESS_KEY_ID", ENV.r2AccessKeyId],
    ["R2_SECRET_ACCESS_KEY", ENV.r2SecretAccessKey],
    ["R2_BUCKET_NAME", ENV.r2BucketName],
    ["R2_ENDPOINT", ENV.r2Endpoint],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    return {
      ok: false,
      message: "R2 environment variables not configured",
      details: { missing: missing.join(", ") },
    };
  }

  const testKey = `health-checks/${Date.now()}-healthcheck.txt`;
  const testContent = Buffer.from("yoo-r2-health-check");

  try {
    await uploadFile(testKey, testContent, "text/plain");

    const signedUrl = await getSignedDownloadUrl(testKey, 60);
    if (!signedUrl) throw new Error("Signed URL generation returned empty");

    await deleteFile(testKey);

    return { ok: true, message: "R2 storage is healthy" };
  } catch (err: any) {
    try { await deleteFile(testKey); } catch { /* best-effort cleanup */ }
    return { ok: false, message: err.message || "R2 health check failed" };
  }
}
