export interface ClickEvent {
  timestamp: string;
  ip: string;
  referrer: string;
  browser: string;
  device: string;
  country: string;
  latencyMs: number;
  cacheHit: boolean;
}

export interface Link {
  id: string;
  code: string;
  url: string;
  createdAt: string;
  expiresAt: string | null;
  clicks: number;
  clickHistory: ClickEvent[];
}

export interface SystemLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  latencyMs: number;
  cacheHit?: boolean;
}

export interface ServiceConfig {
  redisEnabled: boolean;
  dbIndexingEnabled: boolean;
  rateLimitCapacity: number;
  rateLimitRefillRate: number;
  unindexedDbLatency: number;
  indexedDbLatency: number;
  redisLatency: number;
}

export interface AnalyticsSummary {
  totalClicks: number;
  linksCount: number;
  cacheHits: number;
  cacheMisses: number;
  cacheRatio: number;
  browsers: { name: string; value: number }[];
  devices: { name: string; value: number }[];
  referrers: { name: string; value: number }[];
  countries: { name: string; value: number }[];
  timeline: { time: string; clicks: number }[];
}

export interface RateLimiterStatus {
  ip: string;
  tokens: number;
  capacity: number;
  refillRate: number;
}
