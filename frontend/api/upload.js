/**
 * POST /api/upload — evidence upload proxy (Vercel serverless).
 *
 * Why this exists: some networks/ISPs block anonymous file hosts at the
 * browser level ("Failed to fetch" on every host), while the evidence flow
 * needs a public URL for the on-chain pin. This function re-sends the bytes
 * from Vercel's network (different egress, unblocked) to Catbox.
 *
 * Request:  { "data": "<base64 jpeg>", "name": "evidence.jpg" }
 * Response: { "url": "https://..." } | { "error": "..." } (status 502)
 * Limits mirror the client: JPEG only, <= 400KB after base64 (~300KB raw).
 */
const CATBOX = "https://catbox.moe/user/api.php";
const MAX_RAW = 400 * 1024;

function multipart(field, filename, mime, bytes) {
  const boundary = "----opengavel" + Date.now().toString(36);
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
    "utf8",
  );
  const mid = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n--${boundary}--\r\n`, "utf8");
  return { body: Buffer.concat([head, bytes, mid]), boundary };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { data, name } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof data !== "string" || !data.length) {
      res.status(400).json({ error: "Missing base64 data." });
      return;
    }
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_RAW || bytes.length < 100) {
      res.status(400).json({ error: "Image must be 100B–400KB after compression." });
      return;
    }
    const safeName = String(name || "evidence.jpg").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
    const { body, boundary } = multipart("fileToUpload", safeName, "image/jpeg", bytes);
    const problems = [];
    try {
      const up = await fetch(CATBOX, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "User-Agent": "OpenGavel/1.0" },
        body,
      });
      const text = (await up.text()).trim();
      if (up.ok && text.startsWith("https://")) {
        res.status(200).json({ url: text });
        return;
      }
      problems.push(`Catbox HTTP ${up.status}: ${text.slice(0, 120)}`);
    } catch (e) {
      problems.push(`Catbox: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Server-side fallback: uguu.se (same bytes, JSON answer).
    try {
      const uBoundary = "----opengavel" + Date.now().toString(36) + "u";
      const head = Buffer.from(
        `--${uBoundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${safeName}"\r\nContent-Type: image/jpeg\r\n\r\n`,
        "utf8",
      );
      const tail = Buffer.from(`\r\n--${uBoundary}--\r\n`, "utf8");
      const up2 = await fetch("https://uguu.se/upload.php", {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${uBoundary}`, "User-Agent": "OpenGavel/1.0" },
        body: Buffer.concat([head, bytes, tail]),
      });
      const j = await up2.json().catch(() => null);
      const url = j?.files?.[0]?.url ?? "";
      if (up2.ok && j?.success && url.startsWith("https://")) {
        res.status(200).json({ url });
        return;
      }
      problems.push(`uguu.se HTTP ${up2.status}`);
    } catch (e) {
      problems.push(`uguu.se: ${e instanceof Error ? e.message : String(e)}`);
    }
    res.status(502).json({ error: `Upload rejected (${problems.join(" | ")}).` });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
