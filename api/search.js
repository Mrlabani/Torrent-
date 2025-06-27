import axios from 'axios';
import cheerio from 'cheerio';

const cache = new Map();
const TTL = 60 * 1000; // 1 minute
const RATE_LIMITS = new Map();
const MAX_REQ = 10;
const WINDOW = 60 * 1000;

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "Mozilla/5.0 (X11; Linux x86_64)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
];

export default async function handler(req, res) {
  const q = req.query.q;
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  if (!q) return res.status(400).json({ error: "Missing ?q= query param" });

  // Rate limit
  const now = Date.now();
  const user = RATE_LIMITS.get(ip) || { count: 0, time: now };
  if (now - user.time < WINDOW) {
    if (user.count >= MAX_REQ) {
      return res.status(429).json({ error: "Too many requests, slow down!" });
    }
    user.count += 1;
  } else {
    user.count = 1;
    user.time = now;
  }
  RATE_LIMITS.set(ip, user);

  // Cache
  const key = q.toLowerCase();
  if (cache.has(key) && now - cache.get(key).time < TTL) {
    return res.json(cache.get(key).data);
  }

  try {
    const headers = { "User-Agent": UAS[Math.floor(Math.random() * UAS.length)] };
    const html = await axios.get(`https://1337x.to/search/${encodeURIComponent(q)}/1/`, { headers });

    const $ = cheerio.load(html.data);
    const rows = $("table.table-list tr").slice(1, 6);
    const results = [];

    rows.each((_, el) => {
      const title = $(el).find("td.coll-1 a:nth-child(2)").text();
      const href = $(el).find("td.coll-1 a:nth-child(2)").attr("href");
      const seeders = $(el).find("td.coll-2").text();
      const leechers = $(el).find("td.coll-3").text();

      if (title && href) {
        results.push({
          title,
          link: "https://1337x.to" + href,
          seeders,
          leechers,
        });
      }
    });

    cache.set(key, { time: now, data: results });
    res.json(results);
  } catch (e) {
    console.error("Scraping error:", e.message);
    res.status(500).json({ error: "Scraping failed" });
  }
}
