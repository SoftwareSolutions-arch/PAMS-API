import crypto from "crypto";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

function getS3() {
  if (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET || !process.env.S3_REGION) {
    throw new Error("S3 not configured. Provide S3_ENDPOINT, S3_BUCKET, S3_REGION");
  }
  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  });
}

export function sanitizeFileName(originalName) {
  const base = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 200);
}

export async function uploadToS3({ buffer, contentType, originalName, prefix = "attachments" }) {
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error("Invalid file buffer");
  if (buffer.length > MAX_FILE_SIZE_BYTES) throw new Error("File too large");

  const keyBase = sanitizeFileName(originalName || "file");
  const unique = crypto.randomBytes(8).toString("hex");
  const key = `${prefix}/${Date.now()}-${unique}-${keyBase}`;

  const client = getS3();
  const bucket = process.env.S3_BUCKET;

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType || "application/octet-stream" })
  );

  const baseUrl = process.env.S3_PUBLIC_BASE_URL || `${process.env.S3_ENDPOINT.replace(/\/$/, "")}/${bucket}`;
  return { fileUrl: `${baseUrl}/${key}`, key, bucket };
}
