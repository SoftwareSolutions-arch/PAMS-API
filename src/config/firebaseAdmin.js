import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Always resolve absolute path to avoid “file not found” issues
const serviceAccountPath = path.resolve(__dirname, "./firebase-service-account.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
  console.log("🔥 Firebase Admin initialized successfully");
}

export default admin;
