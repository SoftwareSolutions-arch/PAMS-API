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

// AWS S3 setup
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function backupMongoDB() {
  const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
  const backupDir = "./mongo-backups";
  const dumpName = `pams-backup-${timestamp}`;
  const dumpPath = path.join(backupDir, dumpName);
  const archivePath = `${dumpPath}.tar.gz`;
  const bucket = process.env.S3_BUCKET;
  const s3Key = `mongo-backups/${dumpName}.tar.gz`;

  try {
    await fs.promises.mkdir(backupDir, { recursive: true });
    console.log(`\n🗄️  Starting MongoDB backup: ${dumpName} ...`);

    // Run mongodump command
    const dumpCmd = `mongodump --uri="${process.env.MONGO_URI}" --out="${dumpPath}"`;
    await execAsync(dumpCmd);
    console.log("✅ MongoDB dump complete");

    // Compress dump folder
    console.log("📦 Compressing backup folder...");
    await tar.c(
      {
        gzip: true,
        file: archivePath,
        cwd: backupDir
      },
      [dumpName]
    );
    console.log("✅ Compression complete:", archivePath);

    // Upload to S3
    console.log(`☁️  Uploading to s3://${bucket}/${s3Key} ...`);
    const fileStream = fs.createReadStream(archivePath);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileStream
      })
    );
    console.log("✅ Upload successful!");
    console.log(`📂 File stored at: s3://${bucket}/${s3Key}`);

    // Clean up local files
    await fs.promises.rm(dumpPath, { recursive: true, force: true });
    await fs.promises.rm(archivePath, { force: true });
    console.log("🧹 Local backup files cleaned up.");

    // Keep only latest 7 backups in S3
    await cleanupOldBackups(bucket);
  } catch (err) {
    console.error("❌ Backup failed:", err);
  }
}

// Function to clean old backups (keep last 7)
async function cleanupOldBackups(bucket) {
  console.log("🧩 Checking old backups in S3...");
  const listCmd = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: "mongo-backups/"
  });

  const data = await s3.send(listCmd);
  const objects = data.Contents || [];

  if (objects.length > 7) {
    const sorted = objects.sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified));
    const toDelete = sorted.slice(0, objects.length - 7);

    for (const obj of toDelete) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      console.log(`🗑️ Deleted old backup: ${obj.Key}`);
    }
  } else {
    console.log("✅ No old backups to delete.");
  }
}

function scheduleBackup() {
  // Runs every day at 8 PM India time (IST = UTC+5:30)
  // 8 PM IST = 14:30 UTC
  nodeCron.schedule("30 14 * * *", async () => {
    console.log("\n🕗 Scheduled Backup Started (8 PM IST)...");
    await backupMongoDB();
  });

  console.log("⏰ Cron job scheduled: Daily at 8 PM India Time (IST)");
}

// Start schedule
scheduleBackup();
