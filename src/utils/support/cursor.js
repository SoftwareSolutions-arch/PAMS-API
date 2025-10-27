import base64url from "../safeBase64.js";

// Cursor encoding/decoding helper for { createdAt, _id }
// Uses Base64 URL-safe encoding to avoid '+' and '/' issues in URLs.
export function encodeCursor(doc) {
  if (!doc || !doc.createdAt || !doc._id) return null;
  const payload = { createdAt: new Date(doc.createdAt).toISOString(), _id: String(doc._id) };
  return base64url.encode(JSON.stringify(payload));
}

export function decodeCursor(cursorStr) {
  if (!cursorStr) return null;
  try {
    const json = base64url.decode(cursorStr);
    const obj = JSON.parse(json);
    if (!obj.createdAt || !obj._id) return null;
    const createdAt = new Date(obj.createdAt);
    if (isNaN(createdAt.getTime())) return null;
    return { createdAt, _id: obj._id };
  } catch (e) {
    return null; // invalid cursor
  }
}
