import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import * as tar from "tar";
import dotenv from "dotenv";
import nodeCron from "node-cron";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";

dotenv.config();
const execAsync = promisify(exec);

// --- CONFIG ---
const BUCKET = process.env.S3_BUCKET;
const BACKUP_DIR = process.env.BACKUP_DIR || "./mongo-backups";
const PREFIX = process.env.S3_PREFIX || "mongo-backups/";
const MAX_BACKUPS = Number(process.env.MAX_BACKUPS || 30); // ⬅️ Keep latest N backups
// ----------------

// Initialize AWS S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      : undefined
});

// --- BACKUP LOGIC ---
async function backupMongoDB() {
  const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
  const dumpName = `pams-backup-${timestamp}`;
  const dumpPath = path.join(BACKUP_DIR, dumpName);
  const archivePath = `${dumpPath}.tar.gz`;
  const s3Key = `${PREFIX}${dumpName}.tar.gz`;

  try {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
    console.log(`\n🗄️  Starting MongoDB backup: ${dumpName} ...`);

    // Run mongodump
    const dumpCmd = `mongodump --uri="${process.env.MONGO_URI}" --out="${dumpPath}"`;
    await execAsync(dumpCmd);
    console.log("✅ MongoDB dump complete");

    // Compress
    console.log("📦 Compressing backup folder...");
    await tar.c(
      {
        gzip: true,
        file: archivePath,
        cwd: BACKUP_DIR
      },
      [dumpName]
    );
    console.log("✅ Compression complete:", archivePath);

    // Upload to S3
    console.log(`☁️  Uploading to s3://${BUCKET}/${s3Key} ...`);
    const fileStream = fs.createReadStream(archivePath);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: fileStream
      })
    );
    console.log("✅ Upload successful!");
    console.log(`📂 File stored at: s3://${BUCKET}/${s3Key}`);

    // Clean up local
    await fs.promises.rm(dumpPath, { recursive: true, force: true });
    await fs.promises.rm(archivePath, { force: true });
    console.log("🧹 Local backup files cleaned up.");

    // Retain only latest N backups
    await cleanupOldBackups(BUCKET);
  } catch (err) {
    console.error("❌ Backup failed:", err);
  }
}

/**
 * Keep only the latest MAX_BACKUPS in S3.
 * Sorts by LastModified and deletes older ones.
 */
async function cleanupOldBackups(bucket) {
  console.log("🧩 Checking old backups in S3...");

  let continuationToken = undefined;
  let allObjects = [];

  try {
    // Fetch all objects with pagination
    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: continuationToken
      });

      const data = await s3.send(listCmd);
      const objects = data.Contents || [];
      allObjects.push(...objects);
      continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
    } while (continuationToken);

    if (allObjects.length <= MAX_BACKUPS) {
      console.log(`✅ Total backups: ${allObjects.length}. No cleanup needed.`);
      return;
    }

    // Sort by last modified (oldest first)
    allObjects.sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified));

    const toDelete = allObjects.slice(0, allObjects.length - MAX_BACKUPS);
    console.log(`🗑️ Deleting ${toDelete.length} old backup(s)...`);

    for (const obj of toDelete) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      console.log(`🗑️ Deleted: ${obj.Key}`);
    }

    console.log(`✅ Cleanup complete. Retained latest ${MAX_BACKUPS} backups.`);
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
  }
}

// --- CRON SCHEDULER ---
function scheduleBackup() {
  // Every day at 8:00 PM India time
  const cronExp = "0 20 * * *";

  nodeCron.schedule(
    cronExp,
    async () => {
      console.log("\n🕗 Scheduled Backup Started (8:00 PM IST) -", new Date().toISOString());
      await backupMongoDB();
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log(`⏰ Cron job scheduled: Daily at 8:00 PM IST (cron: "${cronExp}")`);
}

// Start the scheduler
scheduleBackup();
