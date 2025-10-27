// Minimal URL-safe base64 helpers
export default {
  encode(input) {
    const b64 = Buffer.from(String(input), "utf8").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(input) {
    let str = String(input).replace(/-/g, "+").replace(/_/g, "/");
    // pad
    while (str.length % 4) str += "=";
    return Buffer.from(str, "base64").toString("utf8");
  },
};
