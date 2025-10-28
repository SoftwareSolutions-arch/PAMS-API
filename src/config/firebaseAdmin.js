import admin from "firebase-admin";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Resolve service account from env or fallback to local file
const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
let credentialInput;

try {
  if (envPath) {
    // If env contains JSON string, parse; otherwise treat as file path
    if (envPath.trim().startsWith("{")) {
      credentialInput = JSON.parse(envPath);
    } else {
      const absolute = path.isAbsolute(envPath)
        ? envPath
        : path.resolve(process.cwd(), envPath);
      credentialInput = JSON.parse(fs.readFileSync(absolute, "utf-8"));
    }
  } else {
    const fallbackPath = path.resolve(__dirname, "./firebase-service-account.json");
    credentialInput = JSON.parse(fs.readFileSync(fallbackPath, "utf-8"));
  }
} catch (e) {
  console.error("Failed to load Firebase service account:", e?.message || e);
  throw e;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(credentialInput),
  });
  console.log("🔥 Firebase Admin initialized successfully");
}

export default admin;
