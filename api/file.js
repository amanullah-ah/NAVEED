// Vercel serverless function: /api/file
//   /api/file?ping=1                 -> "ok"  (page uses this to check the server is alive)
//   /api/file?u=<url>&n=<filename>   -> streams the file as a download (attachment)
//   /api/file?inline=1&u=<url>       -> streams for the in-page video player (supports Range)
const { Readable } = require("stream");

const PRIVATE = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = req.query || {};
  if (q.ping) { res.setHeader("Cache-Control", "no-store"); return res.status(200).send("ok"); }

  let target;
  try { target = new URL(String(q.u || "")); } catch (e) { return res.status(400).send("Bad url"); }
  if (!/^https?:$/.test(target.protocol) || PRIVATE.test(target.hostname)) return res.status(400).send("Blocked url");

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
    "Accept": "*/*"
  };
  if (req.headers.range) headers.Range = req.headers.range;
  if (/tiktok/i.test(target.hostname)) headers.Referer = "https://www.tiktok.com/";

  try {
    const up = await fetch(target.href, { headers, redirect: "follow" });
    if (!up.ok && up.status !== 206) return res.status(502).send("Source returned HTTP " + up.status);

    res.status(up.status === 206 ? 206 : 200);
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = up.headers.get(h); if (v) res.setHeader(h, v);
    }
    if (!up.headers.get("content-type")) res.setHeader("Content-Type", "application/octet-stream");
    if (!q.inline) {
      const name = String(q.n || "video").replace(/[^\w.\- ]+/g, "").trim() || "video";
      res.setHeader("Content-Disposition", 'attachment; filename="' + name + '"');
    }
    res.setHeader("Cache-Control", "no-store");
    if (!up.body) return res.end();
    Readable.fromWeb(up.body).on("error", () => res.end()).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(502).send("Fetch failed");
    else res.end();
  }
};
