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
    const up = await fetch(CATBOX, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "User-Agent": "OpenGavel/1.0" },
      body,
    });
    const url = (await up.text()).trim();
    if (!up.ok || !url.startsWith("https://")) {
      res.status(502).json({ error: `Host rejected upload${up.ok ? `: ${url.slice(0, 80)}` : ` (HTTP ${up.status})`}.` });
      return;
    }
    res.status(200).json({ url });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
