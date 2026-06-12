import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface ClickEvent {
  timestamp: string;
  ip: string;
  referrer: string;
  browser: string;
  device: string;
  country: string;
  latencyMs: number;
  cacheHit: boolean;
}

interface Link {
  id: string;
  code: string;
  url: string;
  createdAt: string;
  expiresAt: string | null;
  clicks: number;
  clickHistory: ClickEvent[];
}

interface SystemLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  latencyMs: number;
  cacheHit?: boolean;
}

// Global state
const links: Link[] = [
  {
    id: "link-1",
    code: "google",
    url: "https://www.google.com",
    createdAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(), // 3 days ago
    expiresAt: null,
    clicks: 142,
    clickHistory: generateDummyClicks(142, 3),
  },
  {
    id: "link-2",
    code: "react",
    url: "https://react.dev",
    createdAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString(), // 2 days ago
    expiresAt: new Date(Date.now() + 3600000 * 24 * 5).toISOString(), // expires in 5 days
    clicks: 84,
    clickHistory: generateDummyClicks(84, 2),
  },
  {
    id: "link-3",
    code: "redis-logo",
    url: "https://redis.io",
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    expiresAt: new Date(Date.now() + 60000).toISOString(), // expires in 1 min
    clicks: 12,
    clickHistory: generateDummyClicks(12, 0.04),
  }
];

let systemLogs: SystemLog[] = [];
function addLog(type: SystemLog["type"], message: string, latencyMs: number, cacheHit?: boolean) {
  systemLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    latencyMs,
    cacheHit
  });
  // Keep last 150 logs
  if (systemLogs.length > 150) {
    systemLogs = systemLogs.slice(0, 150);
  }
}

// Dummy statistics helper
function generateDummyClicks(count: number, daysAgo: number): ClickEvent[] {
  const browsers = ["Chrome", "Safari", "Firefox", "Edge"];
  const devices = ["Desktop", "Mobile", "Tablet"];
  const referrers = ["Direct", "Twitter/X", "GitHub", "LinkedIn", "Hacker News"];
  const countries = ["United States", "India", "United Kingdom", "Germany", "Japan", "Canada", "Singapore"];
  const history: ClickEvent[] = [];

  const baseTime = Date.now();
  for (let i = 0; i < count; i++) {
    const timeOffset = Math.random() * daysAgo * 3600 * 24 * 1000;
    const isCached = Math.random() < 0.75;
    const latency = isCached ? parseFloat((Math.random() * 0.8 + 0.1).toFixed(2)) : parseFloat((Math.random() * 8 + 6).toFixed(2));
    
    history.push({
      timestamp: new Date(baseTime - timeOffset).toISOString(),
      ip: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
      referrer: referrers[Math.floor(Math.random() * referrers.length)],
      browser: browsers[Math.floor(Math.random() * browsers.length)],
      device: devices[Math.floor(Math.random() * devices.length)],
      country: countries[Math.floor(Math.random() * countries.length)],
      latencyMs: latency,
      cacheHit: isCached
    });
  }
  // Sort chronically
  return history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// Performance configurations
let config = {
  redisEnabled: true,
  dbIndexingEnabled: true,
  rateLimitCapacity: 15,
  rateLimitRefillRate: 3, // tokens per second
  unindexedDbLatency: 68.0, // ms
  indexedDbLatency: 11.5, // ms
  redisLatency: 0.45, // ms
};

// Token Bucket State per IP
interface TokenBucket {
  tokens: number;
  lastRefilled: number; // timestamp
}
const ipBuckets: Record<string, TokenBucket> = {};

function getRefilledBucket(ip: string): TokenBucket {
  const now = Date.now();
  const capacity = config.rateLimitCapacity;
  const refillRate = config.rateLimitRefillRate;

  if (!ipBuckets[ip]) {
    ipBuckets[ip] = {
      tokens: capacity,
      lastRefilled: now,
    };
    return ipBuckets[ip];
  }

  const bucket = ipBuckets[ip];
  const deltaSeconds = (now - bucket.lastRefilled) / 1000;
  
  // Update token count
  bucket.tokens = Math.min(capacity, bucket.tokens + deltaSeconds * refillRate);
  bucket.lastRefilled = now;
  return bucket;
}

// Add bootstrap logs
addLog("info", "System Boot: URL Shortening Microservice started.", 1.2);
addLog("success", "PostgreSQL connection pool initialized safely.", 45.4);
addLog("success", "Redis cache cluster verified (Status: ONLINE).", 8.9);
addLog("info", "Rate Limiter initialized with Token-Bucket algorithm.", 0.5);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Setup client IP parser helper
  const getClientIp = (req: express.Request) => {
    return (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
  };

  // --- API Routes ---

  // Get current environment config
  app.get("/api/config", (req, res) => {
    res.json(config);
  });

  // Update configuration
  app.post("/api/config", (req, res) => {
    config = { ...config, ...req.body };
    addLog("warning", `Configuration adjusted by administrator.`, 0.8);
    res.json({ success: true, config });
  });

  // Get short links
  app.get("/api/links", (req, res) => {
    res.json(links);
  });

  // Create highly scalable short link
  app.post("/api/links", (req, res) => {
    const { url, customAlias, expiresAt } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Original URL is required" });
    }

    // Check URL validity
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: "Invalid URL string format. Ensure it includes HTTP/HTTPS." });
    }

    let code = customAlias ? customAlias.trim().toLowerCase() : "";
    
    // Pattern validation for alias
    if (code) {
      if (!/^[a-z0-9-_]+$/i.test(code)) {
        return res.status(400).json({ error: "Custom alias can only contain alphanumeric characters, hyphens, and underscores." });
      }
      
      const existing = links.find((l) => l.code === code);
      if (existing) {
        return res.status(400).json({ error: "Custom alias is already in use." });
      }
    } else {
      // Generate a short randomized code
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let isUnique = false;
      while (!isUnique) {
        code = "";
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        isUnique = !links.some((l) => l.code === code);
      }
    }

    const newLink: Link = {
      id: `link-${Date.now()}`,
      code,
      url,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      clicks: 0,
      clickHistory: [],
    };

    links.unshift(newLink);

    addLog("success", `Created shortened URL: /r/${code} representing ${url.substring(0, 30)}...`, 5.2);
    res.status(201).json(newLink);
  });

  // Delete short link
  app.delete("/api/links/:id", (req, res) => {
    const { id } = req.params;
    const index = links.findIndex((l) => l.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Short link not found" });
    }
    
    const removed = links.splice(index, 1)[0];
    addLog("warning", `Deleted link: /r/${removed.code}`, 3.5);
    res.json({ success: true, deleted: removed });
  });

  // Get logs
  app.get("/api/system-logs", (req, res) => {
    res.json(systemLogs);
  });

  // Clear logs
  app.delete("/api/system-logs", (req, res) => {
    systemLogs = [];
    addLog("info", "System logs flushed.", 0.2);
    res.json({ success: true });
  });

  // Get active bucket status (for progress bar & visualization)
  app.get("/api/rate-limiter-status", (req, res) => {
    const ip = getClientIp(req);
    const bucket = getRefilledBucket(ip);
    res.json({
      ip,
      tokens: parseFloat(bucket.tokens.toFixed(3)),
      capacity: config.rateLimitCapacity,
      refillRate: config.rateLimitRefillRate,
    });
  });

  // Get analytics details
  app.get("/api/analytics-summary", (req, res) => {
    let totalClicks = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    
    const browseStats: Record<string, number> = {};
    const deviceStats: Record<string, number> = {};
    const referrerStats: Record<string, number> = {};
    const countryStats: Record<string, number> = {};
    
    // Time hourly aggregated statistics for past 24 hours
    const clicksTimeline: Record<string, number> = {};
    const now = Date.now();
    for (let i = 23; i >= 0; i--) {
      const hourStr = new Date(now - i * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      clicksTimeline[hourStr] = 0;
    }

    links.forEach((l) => {
      totalClicks += l.clicks;
      l.clickHistory.forEach((c) => {
        if (c.cacheHit) cacheHits++;
        else cacheMisses++;

        browseStats[c.browser] = (browseStats[c.browser] || 0) + 1;
        deviceStats[c.device] = (deviceStats[c.device] || 0) + 1;
        referrerStats[c.referrer] = (referrerStats[c.referrer] || 0) + 1;
        countryStats[c.country] = (countryStats[c.country] || 0) + 1;

        // Try to match timeline within last 24h
        const eventTime = new Date(c.timestamp).getTime();
        const diffHours = Math.floor((now - eventTime) / 3600000);
        if (diffHours >= 0 && diffHours < 24) {
          const hourLabel = new Date(eventTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          // Find the closest bucket
          const closestBucket = Object.keys(clicksTimeline).find((key) => {
            const [bHour] = key.split(":");
            const [eHour] = hourLabel.split(":");
            return bHour === eHour;
          });
          if (closestBucket) {
            clicksTimeline[closestBucket]++;
          }
        }
      });
    });

    res.json({
      totalClicks,
      linksCount: links.length,
      cacheHits,
      cacheMisses,
      cacheRatio: totalClicks > 0 ? parseFloat(((cacheHits / totalClicks) * 100).toFixed(1)) : 0,
      browsers: Object.entries(browseStats).map(([name, value]) => ({ name, value })),
      devices: Object.entries(deviceStats).map(([name, value]) => ({ name, value })),
      referrers: Object.entries(referrerStats).map(([name, value]) => ({ name, value })),
      countries: Object.entries(countryStats).map(([name, value]) => ({ name, value })),
      timeline: Object.entries(clicksTimeline).map(([time, value]) => ({ time, clicks: value })),
    });
  });

  // Simulated click/redirect driver for UI demo purposes (so they don't break iframe)
  app.post("/api/simulate-visit", (req, res) => {
    const { code, customReferrer, customBrowser, customDevice, customCountry } = req.body;
    const ip = getClientIp(req);

    // Rate Limiting Check
    const bucket = getRefilledBucket(ip);
    if (bucket.tokens < 1) {
      addLog("error", `RATE LIMIT TRIGGERED: ${ip} blocked with 429 status code`, 1.2);
      return res.status(429).json({
        success: false,
        error: "Rate Limit Exceeded. Per-IP Token-Bucket exhausted.",
        latencyMs: 1.2,
        cacheHit: false,
        rateLimited: true,
      });
    }

    // Decrement rate limit token
    bucket.tokens -= 1;

    // Search link
    const link = links.find((l) => l.code === code);
    if (!link) {
      addLog("error", `Lookup Failed: /r/${code} not found.`, 4.0);
      return res.status(404).json({ success: false, error: "Short link code not found." });
    }

    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      addLog("error", `Expired Access: /r/${code} has expired.`, 3.5);
      return res.status(410).json({ success: false, error: "Short link has expired." });
    }

    // Performance latency simulation
    let latencyMs = 0;
    let isCacheHit = false;

    if (config.redisEnabled) {
      // Simulate highly concurrent Redis Cache Lookup
      // Cache hits 95% of the time for this active code (or 100% since it's cached in demo)
      isCacheHit = true;
      latencyMs = parseFloat((Math.random() * 0.15 + config.redisLatency).toFixed(2));
    } else {
      isCacheHit = false;
      // Database query lookup simulation
      if (config.dbIndexingEnabled) {
        // Query on indexed code field (B-Tree lookup ~O(log N))
        latencyMs = parseFloat((Math.random() * 2.5 + config.indexedDbLatency).toFixed(2));
      } else {
        // Full table scan without Index (~O(N))
        latencyMs = parseFloat((Math.random() * 15.0 + config.unindexedDbLatency).toFixed(2));
      }
    }

    // Update statistics
    link.clicks++;
    
    const clickEvent: ClickEvent = {
      timestamp: new Date().toISOString(),
      ip,
      referrer: customReferrer || "Direct",
      browser: customBrowser || "Chrome",
      device: customDevice || "Desktop",
      country: customCountry || "United States",
      latencyMs,
      cacheHit: isCacheHit,
    };

    link.clickHistory.push(clickEvent);

    // Record system log
    const cachingInfo = isCacheHit 
      ? `CACHE HIT - speed: ${latencyMs}ms (Redis Server)` 
      : `CACHE MISS - DB Indexing: ${config.dbIndexingEnabled ? "ON (Indexed B-Tree)" : "OFF (Table Scan)"} - speed: ${latencyMs}ms (PostgreSQL)`;

    addLog(
      isCacheHit ? "success" : (config.dbIndexingEnabled ? "info" : "warning"),
      `Redirect request (/r/${code}) processed successfully. ${cachingInfo}`,
      latencyMs,
      isCacheHit
    );

    res.json({
      success: true,
      originalUrl: link.url,
      code,
      latencyMs,
      cacheHit: isCacheHit,
      event: clickEvent
    });
  });

  // Direct redirection endpoint
  app.get("/r/:code", (req, res) => {
    const { code } = req.params;
    const ip = getClientIp(req);

    // Rate Limiting Check
    const bucket = getRefilledBucket(ip);
    if (bucket.tokens < 1) {
      addLog("error", `Direct Route - Rate Limit Exhausted: ${ip} trying to hit /r/${code}`, 1.0);
      return res.status(429).send(`
        <html>
          <head>
            <title>429 Too Many Requests</title>
            <style>
              body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; max-width: 450px; text-align: center; border: 1px solid #334155; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); }
              h1 { color: #f43f5e; margin-top: 0; }
              p { color: #94a3b8; line-height: 1.6; }
              .badge { background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.2); color: #f43f5e; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; display: inline-block; margin-bottom: 1rem; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">HTTP 429 Throttled</div>
              <h1>Too Many Requests</h1>
              <p>You have hit the Token-Bucket Rate Limiter. Please wait for the token bucket to replenish from the refill cycle (Current rate: ${config.rateLimitRefillRate} tokens/sec).</p>
            </div>
          </html>
      `);
    }

    // Draining tokens
    bucket.tokens -= 1;

    // Search link
    const link = links.find((l) => l.code === code);
    if (!link) {
      addLog("error", `Direct Route Lookup Failed: /r/${code} not found.`, 1.5);
      return res.status(404).send(`<h1>Short URL not found</h1>`);
    }

    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      addLog("error", `Direct Route Expired: /r/${code} expired access.`, 1.2);
      return res.status(410).send(`<h1>This shortened URL has expired</h1>`);
    }

    // Measure lookup performance
    let latencyMs = 0;
    let isCacheHit = false;

    if (config.redisEnabled) {
      isCacheHit = true;
      latencyMs = parseFloat((Math.random() * 0.15 + config.redisLatency).toFixed(2));
    } else {
      isCacheHit = false;
      if (config.dbIndexingEnabled) {
        latencyMs = parseFloat((Math.random() * 2.5 + config.indexedDbLatency).toFixed(2));
      } else {
        latencyMs = parseFloat((Math.random() * 15.0 + config.unindexedDbLatency).toFixed(2));
      }
    }

    // Update statistics
    link.clicks++;

    // Guess browser details from User-Agent
    const ua = req.headers["user-agent"] || "";
    let browser = "Chrome";
    if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    let device = "Desktop";
    if (ua.includes("Mobile")) device = "Mobile";
    else if (ua.includes("iPad") || ua.includes("Tablet")) device = "Tablet";

    const referrers = ["Direct", "Twitter/X", "GitHub", "LinkedIn", "Hacker News"];
    const countries = ["United States", "India", "United Kingdom", "Germany", "Japan", "Canada"];
    const clickEvent: ClickEvent = {
      timestamp: new Date().toISOString(),
      ip,
      referrer: req.headers["referer"] || referrers[Math.floor(Math.random() * referrers.length)],
      browser,
      device,
      country: countries[Math.floor(Math.random() * countries.length)],
      latencyMs,
      cacheHit: isCacheHit,
    };

    link.clickHistory.push(clickEvent);

    const cachingInfo = isCacheHit 
      ? `CACHE HIT - speed: ${latencyMs}ms (Redis Server)` 
      : `CACHE MISS - DB Indexing: ${config.dbIndexingEnabled ? "ON (Indexed B-Tree)" : "OFF (Table Scan)"} - speed: ${latencyMs}ms (PostgreSQL)`;

    addLog(
      isCacheHit ? "success" : (config.dbIndexingEnabled ? "info" : "warning"),
      `Redirect Route (/r/${code}) hit. ${cachingInfo}`,
      latencyMs,
      isCacheHit
    );

    // Perform the redirect to the target URL!
    // Since inside an iframe a direct 302 can sometimes trigger iframe access restrictions, we'll return a lovely redirect landing page.
    res.send(`
      <html>
        <head>
          <title>Redirecting...</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #111827; padding: 3rem; border-radius: 16px; border: 1px solid #1f2937; text-align: center; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
            h2 { color: #3b82f6; margin-top: 0; font-size: 1.5rem; }
            p { color: #9ca3af; margin-bottom: 2rem; line-height: 1.6; }
            .metric-pill { display: inline-flex; align-items: center; background: #1f2937; border: 1px solid #374151; color: #10b981; padding: 0.5rem 1rem; border-radius: 9999px; font-family: monospace; font-size: 0.9rem; margin-bottom: 1.5rem; }
            .target-btn { background: #3b82f6; color: white; text-decoration: none; padding: 0.75rem 2rem; border-radius: 8px; font-weight: 600; display: inline-block; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(59,130,246,0.3); }
            .target-btn:hover { background: #2563eb; transform: translateY(-1px); }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="metric-pill">🚀 ${isCacheHit ? "Redis Cache Hit" : "PostgreSQL query"} | ${latencyMs}ms</div>
            <h2>Redirecting you safely</h2>
            <p>You are being redirected to:<br/><strong style="color: #e5e7eb; word-break: break-all;">${link.url}</strong></p>
            <a href="${link.url}" class="target-btn">Click here if not redirected</a>
          </div>
          <script>
            setTimeout(() => {
              window.location.href = "${link.url}";
            }, 800);
          </script>
        </body>
      </html>
    `);
  });

  // --- Vite Dev Server Middleware & Production Static files serving ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
