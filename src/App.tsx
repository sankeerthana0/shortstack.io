import React, { useState, useEffect, useCallback } from "react";
import { 
  Link as LinkIcon, 
  Settings, 
  Activity, 
  Trash2, 
  Cpu, 
  Zap, 
  Clock, 
  Database, 
  AlertTriangle, 
  Globe, 
  MousePointerClick, 
  Sparkles, 
  RefreshCw, 
  ShieldCheck, 
  ArrowRight,
  ExternalLink,
  Flame,
  CheckCircle2,
  Terminal,
  Layers,
  ChevronDown,
  Info
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell, 
  PieChart, 
  Pie 
} from "recharts";
import { 
  Link, 
  SystemLog, 
  ServiceConfig, 
  AnalyticsSummary, 
  RateLimiterStatus 
} from "./types";

export default function App() {
  // Lists and stats states
  const [links, setLinks] = useState<Link[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [config, setConfig] = useState<ServiceConfig>({
    redisEnabled: true,
    dbIndexingEnabled: true,
    rateLimitCapacity: 15,
    rateLimitRefillRate: 3,
    unindexedDbLatency: 68.0,
    indexedDbLatency: 11.5,
    redisLatency: 0.45,
  });
  const [analytics, setAnalytics] = useState<AnalyticsSummary>({
    totalClicks: 0,
    linksCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheRatio: 0,
    browsers: [],
    devices: [],
    referrers: [],
    countries: [],
    timeline: [],
  });
  const [limiter, setLimiter] = useState<RateLimiterStatus>({
    ip: "127.0.0.1",
    tokens: 15,
    capacity: 15,
    refillRate: 3,
  });

  // Creation forms states
  const [newUrl, setNewUrl] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newExpiration, setNewExpiration] = useState("");
  
  // Interaction/Demo states
  const [selectedSimReferrer, setSelectedSimReferrer] = useState("Direct");
  const [selectedSimBrowser, setSelectedSimBrowser] = useState("Chrome");
  const [selectedSimDevice, setSelectedSimDevice] = useState("Desktop");
  const [selectedSimCountry, setSelectedSimCountry] = useState("United States");
  
  const [lastTrace, setLastTrace] = useState<{
    code: string;
    originalUrl: string;
    latencyMs: number;
    cacheHit: boolean;
    rateLimited?: boolean;
    error?: string;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStressTesting, setIsStressTesting] = useState(false);

  // Fetch full data refresh
  const fetchData = useCallback(async () => {
    try {
      const linksRes = await fetch("/api/links");
      if (linksRes.ok) {
        const data = await linksRes.json();
        setLinks(data);
      }

      const logsRes = await fetch("/api/system-logs");
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data);
      }

      const configRes = await fetch("/api/config");
      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
      }

      const summaryRes = await fetch("/api/analytics-summary");
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setAnalytics(data);
      }

      const limiterRes = await fetch("/api/rate-limiter-status");
      if (limiterRes.ok) {
        const data = await limiterRes.json();
        setLimiter(data);
      }
    } catch (e) {
      console.error("Failed to load server data:", e);
    }
  }, []);

  // Set up recurring state check to keep rate limiter replenishing visible & keep database in sync
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 1500);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Create customized link
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    if (!newUrl) return;

    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl,
          customAlias: newAlias || undefined,
          expiresAt: newExpiration || undefined,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setErrorMessage(body.error || "Failed to create short URL.");
      } else {
        setSuccessMessage(`Shortened code '${body.code}' created successfully.`);
        setNewUrl("");
        setNewAlias("");
        setNewExpiration("");
        fetchData();
      }
    } catch (err) {
      setErrorMessage("Network error occurred. Please try again.");
    }
  };

  // Perform Simulated link click with analytical trace
  const handleSimulateVisit = async (code: string) => {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const res = await fetch("/api/simulate-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          customReferrer: selectedSimReferrer,
          customBrowser: selectedSimBrowser,
          customDevice: selectedSimDevice,
          customCountry: selectedSimCountry,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Rate limited or expired
        setLastTrace({
          code,
          originalUrl: "",
          latencyMs: data.latencyMs || 1.0,
          cacheHit: false,
          rateLimited: res.status === 429,
          error: data.error || "Simulation hit failed."
        });
        if (res.status === 429) {
          setErrorMessage("Rate Limit Blocked! 429 Too Many Requests.");
        } else {
          setErrorMessage(data.error || "Visit simulation failed.");
        }
      } else {
        setLastTrace({
          code,
          originalUrl: data.originalUrl,
          latencyMs: data.latencyMs,
          cacheHit: data.cacheHit,
        });
        setSuccessMessage(`Simulated redirect for /r/${code}`);
      }
      fetchData();
    } catch (e) {
      setErrorMessage("Network simulation call failed.");
    }
  };

  // Run full Stress-Test (rapid requests to drain Token Bucket capacity)
  const triggerStressTest = async (code: string) => {
    if (isStressTesting) return;
    setIsStressTesting(true);
    setErrorMessage("");
    setSuccessMessage("");
    setLastTrace(null);

    // Blast 18 requests rapidly
    const promoRequests = Array.from({ length: 18 }).map(() => {
      return fetch("/api/simulate-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          customReferrer: "Twitter/X",
          customBrowser: "Safari",
          customDevice: "Mobile",
          customCountry: "Germany",
        }),
      });
    });

    try {
      const responses = await Promise.all(promoRequests);
      const successful = responses.filter((r) => r.status === 200).length;
      const rateLimited = responses.filter((r) => r.status === 429).length;

      setSuccessMessage(`Fired 18 parallel hits successfully. Clicks: ${successful} OK, ${rateLimited} Rate-Limited (429)!`);
      fetchData();
    } catch (e) {
      setErrorMessage("Traffic run failed.");
    } finally {
      setIsStressTesting(false);
    }
  };

  // Delete Link
  const handleDeleteLink = async (id: string) => {
    try {
      const res = await fetch(`/api/links/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle or amend config properties
  const handleConfigChange = async (update: Partial<ServiceConfig>) => {
    const updatedConfig = { ...config, ...update };
    setConfig(updatedConfig);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  // Clear system simulator logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/system-logs", { method: "DELETE" });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Colors mapping for charts configured to use the high contrast neon format
  const CHART_COLORS = {
    primary: "#00F0FF",     // Neon Cyan
    accent: "#00F0FF",      // Cyan
    warning: "#eab308",     // Yellow
    danger: "#f43f5e",      // Rose
    info: "#00F0FF"         // Cyan
  };

  const getSystemLogsStats = () => {
    const redisCount = logs.filter(l => l.cacheHit).length;
    return {
      redisCount,
      postgresCount: logs.length - redisCount
    };
  };

  const logStats = getSystemLogsStats();

  return (
    <div className="min-h-screen bg-[#050505] text-[#F0F0F0] font-sans selection:bg-[#00F0FF]/30 selection:text-white flex flex-col">
      
      {/* HEADER SECTION */}
      <header className="sticky top-0 z-50 bg-[#050505]/95 backdrop-blur-md border-b-2 border-zinc-90 w-full" id="header-container" style={{ borderBottomColor: "#18181b" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-900 border border-zinc-700 text-[#00F0FF] rounded-none" id="brand-logo-container">
              <Zap className="h-6 w-6 animate-pulse" id="logo-icon" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display font-black text-xl sm:text-2xl tracking-tighter uppercase italic underline decoration-[#00F0FF] decoration-4 underline-offset-4" id="brand-title">
                  ShortStack.IO
                </h1>
                <span className="text-[10px] uppercase font-mono tracking-widest font-black px-2 py-0.5 border border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF]">
                  PERF-LAB
                </span>
              </div>
              <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mt-1.5" id="brand-subtitle">
                Java Spring Boot • Redis Cluster Cache Cache • PostgreSQL Indexing Layer
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {/* Server Health Status Indicators */}
            <div className="flex items-center gap-4 text-xs font-mono bg-zinc-950 border border-zinc-800 px-3 py-2" id="server-stats-badge">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-[#00F0FF] animate-pulse"></span>
                <span className="text-zinc-500 text-[10px] uppercase">SPRING:</span>
                <span className="font-bold text-white text-[10px]">OK</span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-4">
                <span className={`h-2.5 w-2.5 ${config.redisEnabled ? 'bg-[#00F0FF] animate-pulse' : 'bg-zinc-700'}`}></span>
                <span className="text-zinc-500 text-[10px] uppercase">REDIS:</span>
                <span className={`font-black text-[10px] ${config.redisEnabled ? 'text-[#00F0FF]' : 'text-zinc-500'}`}>
                  {config.redisEnabled ? 'CACHED' : 'BYPASSED'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-4">
                <span className={`h-2.5 w-2.5 ${config.dbIndexingEnabled ? 'bg-[#00F0FF] animate-pulse' : 'bg-yellow-500'}`}></span>
                <span className="text-zinc-500 text-[10px] uppercase">POSTGRES:</span>
                <span className={`font-black text-[10px] ${config.dbIndexingEnabled ? 'text-white' : 'text-yellow-500'}`}>
                  {config.dbIndexingEnabled ? 'INDEX_SCAN' : 'SEQUENTIAL_SCAN'}
                </span>
              </div>
            </div>
            
            <button 
              onClick={fetchData}
              className="p-2.5 text-zinc-400 hover:text-[#00F0FF] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all rounded-none cursor-pointer"
              title="Refresh Data"
              id="refresh-server-data-btn"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* CORE WORKSPACE */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-8" id="main-content">
        
        {/* BRUTALIST HERO PRESENTATION BLOCK */}
        <div className="relative flex flex-col lg:flex-row justify-between items-start gap-6 border-b border-zinc-800 pb-10">
          <div>
            <h2 className="text-5xl sm:text-7xl font-display font-black tracking-tighter uppercase leading-none text-white">
              Scale <span className="text-zinc-800">Every</span><br />
              <span className="text-[#00F0FF]">Link</span>.
            </h2>
            <p className="text-zinc-500 font-mono text-xs mt-5 uppercase tracking-widest max-w-2xl leading-relaxed">
              // DISK I/O LATENCY IS THE ENEMY. SIMULATE REAL-TIME REDIS CACHE LOOKUPS, SPRING RATE-LIMITING BUCKETS AND UNINDEXED POSTGRES SEQUENTIAL SCAN DYNAMICS AT WORKPLACE SCALE.
            </p>
          </div>
          <div className="text-left lg:text-right font-mono text-xs text-zinc-500 space-y-1 bg-zinc-900/40 border border-zinc-850 p-4 w-full lg:w-auto shrink-0" style={{ borderColor: "#1f1f23" }}>
            <div className="text-white font-bold tracking-wider">// LOCAL ENGINES STATUS: READY</div>
            <div>SPRING INGESTION LATENCY: MINIMAL</div>
            <div>POSTGRES TABLE DEPTH: 100,000 PSEUDO-ROWS</div>
            <div>TOKEN-BUCKET RATE-LIMITER: SHIELDING ACTIVE</div>
          </div>
        </div>

        {/* MESSAGES BAR */}
        {errorMessage && (
          <div className="p-4 bg-zinc-950 border-l-4 border-red-500 text-white text-sm flex items-start gap-3 animate-fade-in" id="error-message-bar">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-500" />
            <div>
              <strong className="font-mono px-1.5 py-0.5 bg-red-950 text-red-400 text-[10px] uppercase font-bold tracking-widest mr-2">BLOCK_ERR</strong>
              <span className="font-mono text-zinc-300">{errorMessage}</span>
            </div>
          </div>
        )}
        {successMessage && (
          <div className="p-4 bg-zinc-950 border-l-4 border-[#00F0FF] text-white text-sm flex items-start gap-3 animate-fade-in" id="success-message-bar">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-[#00F0FF]" />
            <div>
              <strong className="font-mono px-1.5 py-0.5 bg-zinc-900 text-[#00F0FF] text-[10px] uppercase font-bold tracking-widest mr-2">SYS_OK</strong>
              <span className="font-mono text-zinc-300">{successMessage}</span>
            </div>
          </div>
        )}

        {/* HIGH-LEVEL PERFORMANCE METRICS SECTION */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6" id="stats-summary-grid">
          
          {/* CARD 1: TOTAL CLICK ANALYTICS */}
          <div className="bg-zinc-900/60 p-6 border-2 border-zinc-800 rounded-none flex flex-col justify-between" id="clicks-stat-card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs uppercase font-mono tracking-widest font-bold text-zinc-500">// TOTAL THROUGHPUT</p>
                <h3 className="font-display font-black text-5xl text-white mt-3" id="total-clicks-count">
                  {analytics.totalClicks}
                </h3>
              </div>
              <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-[#00F0FF]">
                <MousePointerClick className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6 border-t border-zinc-800 pt-4 flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>ACTIVE CODES: <strong>{analytics.linksCount}</strong></span>
              <span className="flex items-center gap-1.5 text-[#00F0FF] font-black">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" /> LIVE STREAM
              </span>
            </div>
          </div>

          {/* CARD 2: REDIS CACHE hit ratio */}
          <div className="bg-zinc-900/60 p-6 border-2 border-zinc-800 rounded-none flex flex-col justify-between" id="cache-rate-card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs uppercase font-mono tracking-widest font-bold text-zinc-500">// CACHE OFFLOAD RATIO</p>
                <h3 className="font-display font-black text-5xl text-[#00F0FF] mt-3" id="redis-hit-ratio">
                  {analytics.cacheRatio}%
                </h3>
              </div>
              <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-[#00F0FF]">
                <Cpu className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6">
              <div className="w-full bg-zinc-950 h-2.5 rounded-none overflow-hidden border border-zinc-800">
                <div 
                  className="bg-[#00F0FF] h-full transition-all duration-500" 
                  style={{ width: `${analytics.cacheRatio}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono mt-3">
                <span>CACHE_HITS: {analytics.cacheHits}</span>
                <span>CACHE_MISSES: {analytics.cacheMisses}</span>
              </div>
            </div>
          </div>

          {/* CARD 3: PERFORMANCE SPEEDUP LATENCY MEASURES */}
          <div className="bg-zinc-900/60 p-6 border-2 border-zinc-800 rounded-none flex flex-col justify-between" id="latency-speedup-card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs uppercase font-mono tracking-widest font-bold text-zinc-500">// READ_QUERY_LATENCY</p>
                <h3 className="font-mono text-white mt-3" id="current-service-latency">
                  {config.redisEnabled ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display font-black text-5xl text-[#00F0FF]">{config.redisLatency}</span>
                      <span className="text-[11px] text-zinc-400 font-mono">ms (Redis)</span>
                    </div>
                  ) : config.dbIndexingEnabled ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display font-black text-5xl text-white">{config.indexedDbLatency}</span>
                      <span className="text-[11px] text-zinc-400 font-mono">ms (Index)</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display font-black text-5xl text-yellow-500">{config.unindexedDbLatency}</span>
                      <span className="text-[11px] text-zinc-400 font-mono">ms (Scan)</span>
                    </div>
                  )}
                </h3>
              </div>
              <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-zinc-400">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6 border-t border-zinc-800 pt-4 flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-1">
                LUK_MS: <strong>{config.redisLatency}ms</strong>
              </span>
              <span className="text-[#00F0FF] font-black uppercase tracking-wider">
                {config.redisEnabled ? "🚀 speed ~15x" : "⚠️ Caching OFF"}
              </span>
            </div>
          </div>

          {/* CARD 4: RATE LIMITER TOKEN-BUCKET REPLENISH LEVEL */}
          <div className="bg-zinc-900/60 p-6 border-2 border-zinc-800 rounded-none flex flex-col justify-between" id="rate-limiter-status-card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs uppercase font-mono tracking-widest font-bold text-zinc-500">// TOKEN_BUCKET_IP_POOL</p>
                <h3 className="font-display font-black text-5xl text-white mt-3" id="bucket-token-size">
                  {limiter.tokens} <span className="text-sm font-normal text-zinc-500 font-mono">/ {limiter.capacity}</span>
                </h3>
              </div>
              <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-[#00F0FF]" id="rate-limiter-badge">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6">
              <div className="w-full bg-zinc-950 h-2.5 rounded-none overflow-hidden border border-zinc-800">
                <div 
                  className="bg-[#00F0FF] h-full transition-all" 
                  style={{ width: `${(limiter.tokens / limiter.capacity) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono mt-3">
                <span>REFILL_RATE: +{limiter.refillRate}/s</span>
                <span className="text-zinc-500 text-[9px] font-mono">{limiter.ip}</span>
              </div>
            </div>
          </div>

        </section>

        {/* CONTROLS & REDIS SIMULATION LAB */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="dashboard-main-columns">
          
          {/* COLUMN 1: INTERACTIVE LABORATORY CONTROLLERS */}
          <div className="lg:col-span-1 flex flex-col gap-8" id="simulators-and-configs">
            
            {/* SERVICE OPTIMIZATION LABORATORY CONFIG */}
            <div className="bg-zinc-950/60 p-6 border-2 border-zinc-800 rounded-none flex flex-col gap-6">
              <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4">
                <Settings className="w-5 h-5 text-[#00F0FF]" />
                <h2 className="font-display font-black text-base uppercase tracking-wider text-white">System Optimizers Matrix</h2>
              </div>

              {/* TOGGLERS */}
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4 p-4 bg-zinc-900/60 border border-zinc-800 rounded-none hover:bg-zinc-900 transition-colors">
                  <div className="flex flex-col">
                    <label className="text-xs font-mono font-black text-white flex items-center gap-1.5 cursor-pointer uppercase" htmlFor="redis-toggle">
                      // REDIS MEMORY STORAGE
                    </label>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-normal font-mono">
                      Bypass heavy disk I/O constraints by locking shortened alias values directly inside in-memory compiler memory blocks.
                    </p>
                  </div>
                  <input 
                    type="checkbox"
                    id="redis-toggle"
                    checked={config.redisEnabled}
                    onChange={(e) => handleConfigChange({ redisEnabled: e.target.checked })}
                    className="h-6 w-12 bg-zinc-950 border border-zinc-700 checked:bg-[#00F0FF] relative cursor-pointer appearance-none rounded-none transition-colors before:content-[''] before:absolute before:h-4 before:w-4 before:bg-zinc-500 checked:before:bg-black before:top-1 before:left-1 before:transition-transform checked:before:translate-x-6"
                  />
                </div>

                <div className="flex items-start justify-between gap-4 p-4 bg-zinc-900/60 border border-zinc-800 rounded-none hover:bg-zinc-900 transition-colors">
                  <div className="flex flex-col">
                    <label className="text-xs font-mono font-black text-white flex items-center gap-1.5 cursor-pointer uppercase" htmlFor="db-index-toggle">
                      // POSTGRESQL B-TREE INDEX
                    </label>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-normal font-mono">
                      Equip alias key lookups with logarithmic search paths in PostgreSQL, avoiding sequential file table scans.
                    </p>
                  </div>
                  <input 
                    type="checkbox"
                    id="db-index-toggle"
                    checked={config.dbIndexingEnabled}
                    onChange={(e) => handleConfigChange({ dbIndexingEnabled: e.target.checked })}
                    disabled={config.redisEnabled} 
                    className="h-6 w-12 bg-zinc-950 border border-zinc-700 checked:bg-[#00F0FF] relative cursor-pointer appearance-none rounded-none transition-colors before:content-[''] before:absolute before:h-4 before:w-4 before:bg-zinc-500 checked:before:bg-black before:top-1 before:left-1 before:transition-transform checked:before:translate-x-6 disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
                {config.redisEnabled && (
                  <p className="text-[10px] text-[#00F0FF] bg-[#00F0FF]/5 p-3 rounded-none border border-[#00F0FF]/30 flex items-start gap-2 font-mono leading-relaxed">
                    <Info className="w-4 h-4 shrink-0 text-[#00F0FF]" /> 
                    <span>// INFO: Redis cache layer is fully active. Turn OFF Redis to view Postgres unindexed sequential-scan latency difference.</span>
                  </p>
                )}
              </div>

              {/* LATENCY SIMULATORS SLIDERS */}
              <div className="flex flex-col gap-4 mt-2 border-t border-zinc-850 pt-4" style={{ borderTopColor: "#1f1f23" }}>
                <h3 className="text-xs uppercase tracking-widest font-mono font-black text-zinc-400">
                  // DISK READ LATENCY ADJUST
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center text-[11px] font-mono text-zinc-300 mb-1.5">
                      <span>Redis cache in-memory read</span>
                      <strong className="text-[#00F0FF]">{config.redisLatency} ms</strong>
                    </div>
                    <input 
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.05"
                      value={config.redisLatency}
                      onChange={(e) => handleConfigChange({ redisLatency: parseFloat(e.target.value) })}
                      className="w-full accent-[#00F0FF] h-1 bg-zinc-900 rounded-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-[11px] font-mono text-zinc-300 mb-1.5">
                      <span>PostgreSQL indexed seek</span>
                      <strong className="text-white">{config.indexedDbLatency} ms</strong>
                    </div>
                    <input 
                      type="range"
                      min="2.0"
                      max="25.0"
                      step="0.5"
                      value={config.indexedDbLatency}
                      onChange={(e) => handleConfigChange({ indexedDbLatency: parseFloat(e.target.value) })}
                      className="w-full accent-white h-1 bg-zinc-900 rounded-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-[11px] font-mono text-zinc-300 mb-1.5">
                      <span>PostgreSQL full sequential scan</span>
                      <strong className="text-yellow-500">{config.unindexedDbLatency} ms</strong>
                    </div>
                    <input 
                      type="range"
                      min="30.0"
                      max="180.0"
                      step="1.0"
                      value={config.unindexedDbLatency}
                      onChange={(e) => handleConfigChange({ unindexedDbLatency: parseFloat(e.target.value) })}
                      className="w-full accent-yellow-500 h-1 bg-zinc-900 rounded-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* RATE LIMIT CONTROLS */}
              <div className="flex flex-col gap-4 border-t border-zinc-850 pt-4" style={{ borderTopColor: "#1f1f23" }}>
                <h3 className="text-xs uppercase tracking-widest font-mono font-black text-zinc-400">
                  // SECURITY SHIELD THROTTLING
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase" htmlFor="rate-capacity-input">BUCKET CAPACITY</label>
                    <input 
                      type="number"
                      id="rate-capacity-input"
                      min="1"
                      max="100"
                      value={config.rateLimitCapacity}
                      onChange={(e) => handleConfigChange({ rateLimitCapacity: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-sm text-[#00F0FF] font-mono text-center rounded-none focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase" htmlFor="rate-refill-input">REFILL TOKEN/S</label>
                    <input 
                      type="number"
                      id="rate-refill-input"
                      min="1"
                      max="50"
                      value={config.rateLimitRefillRate}
                      onChange={(e) => handleConfigChange({ rateLimitRefillRate: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-sm text-[#00F0FF] font-mono text-center rounded-none focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* QUICK LINK SIMULATOR SUITE */}
            <div className="bg-zinc-950/60 p-6 border-2 border-zinc-800 rounded-none flex flex-col gap-4">
              <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4">
                <Activity className="w-5 h-5 text-white" />
                <h2 className="font-display font-black text-base uppercase tracking-wider text-white">Ingestion Payload Mock</h2>
              </div>
              <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">
                Tune the geolocation & network headers of simulated virtual traffic to stress test metrics routing and geo-distribution analytics.
              </p>

              <div className="flex flex-col gap-4 text-xs font-mono">
                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase tracking-widest text-[10px]" htmlFor="referrer-select">Simulated Referrer Header</label>
                  <select 
                    id="referrer-select"
                    value={selectedSimReferrer}
                    onChange={(e) => setSelectedSimReferrer(e.target.value)}
                    className="w-full p-2.5 bg-zinc-900 border border-zinc-800 text-[#F0F0F0] rounded-none focus:outline-none focus:border-[#00F0FF] cursor-pointer"
                  >
                    <option value="Direct">Direct (No Referrer header)</option>
                    <option value="Twitter/X">Twitter/X (Social Campaign)</option>
                    <option value="GitHub">GitHub (Repository Readme)</option>
                    <option value="LinkedIn">LinkedIn (Professional network)</option>
                    <option value="Hacker News">Hacker News (Tech community)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 mb-1.5 uppercase tracking-widest text-[10px]" htmlFor="browser-select">User-Agent Engine</label>
                    <select 
                      id="browser-select"
                      value={selectedSimBrowser}
                      onChange={(e) => setSelectedSimBrowser(e.target.value)}
                      className="w-full p-2.5 bg-zinc-900 border border-zinc-800 text-[#F0F0F0] rounded-none focus:outline-none focus:border-[#00F0FF] cursor-pointer"
                    >
                      <option value="Chrome">Google Chrome</option>
                      <option value="Safari">Safari (macOS/iOS)</option>
                      <option value="Firefox">Mozilla Firefox</option>
                      <option value="Edge">Microsoft Edge</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1.5 uppercase tracking-widest text-[10px]" htmlFor="device-select">Device Mock</label>
                    <select 
                      id="device-select"
                      value={selectedSimDevice}
                      onChange={(e) => setSelectedSimDevice(e.target.value)}
                      className="w-full p-2.5 bg-zinc-900 border border-zinc-800 text-[#F0F0F0] rounded-none focus:outline-none focus:border-[#00F0FF] cursor-pointer"
                    >
                      <option value="Desktop">Desktop</option>
                      <option value="Mobile">Mobile Smartphone</option>
                      <option value="Tablet">iPad / Tablet</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1.5 uppercase tracking-widest text-[10px]" htmlFor="country-select">Origin Geolocation</label>
                  <select 
                    id="country-select"
                    value={selectedSimCountry}
                    onChange={(e) => setSelectedSimCountry(e.target.value)}
                    className="w-full p-2.5 bg-zinc-900 border border-zinc-800 text-[#F0F0F0] rounded-none focus:outline-none focus:border-[#00F0FF] cursor-pointer"
                  >
                    <option value="United States">United States</option>
                    <option value="India">India</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Germany">Germany</option>
                    <option value="Japan">Japan</option>
                    <option value="Canada">Canada</option>
                    <option value="Singapore">Singapore</option>
                  </select>
                </div>
              </div>
            </div>

          </div>

          {/* COLUMN 2: WORKSPACE, URLS & LINK SHORTENER PLATFORM */}
          <div className="lg:col-span-2 flex flex-col gap-8" id="workspace-column">
            
            {/* CREATE SHORTEN FORM CARD */}
            <div className="bg-zinc-900/40 p-6 border-2 border-zinc-800 rounded-none">
              <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4 mb-6">
                <LinkIcon className="w-5 h-5 text-[#00F0FF]" />
                <h2 className="font-display font-black text-base uppercase tracking-wider text-white">Create Scalable Path Address</h2>
              </div>

              <form onSubmit={handleCreateLink} className="flex flex-col gap-6 font-mono">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider" htmlFor="long-url-input">Original High-Traffic URL</label>
                  <div className="relative">
                    <input 
                      type="url"
                      id="long-url-input"
                      required
                      placeholder="https://example.com/very-long-url-path-with-parameters?query=123"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="w-full pl-3 pr-12 py-3 bg-zinc-950 border border-zinc-800 text-sm text-[#00F0FF] focus:outline-none focus:border-[#00F0FF] rounded-none placeholder-zinc-700 font-mono"
                    />
                    <div className="absolute right-4 top-3.5 text-zinc-600">
                      <Globe className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider" htmlFor="custom-alias-input">Custom Alias (Optional)</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3.5 bg-zinc-950 border border-r-0 border-zinc-800 text-zinc-500 text-xs font-mono rounded-none">
                        /r/
                      </span>
                      <input 
                        type="text"
                        id="custom-alias-input"
                        placeholder="my-portfolio"
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        className="flex-1 px-3 py-3 bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-[#00F0FF] rounded-none placeholder-zinc-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider" htmlFor="expiration-input">Expiration Limit (Optional)</label>
                    <div className="relative">
                      <input 
                        type="datetime-local"
                        id="expiration-input"
                        value={newExpiration}
                        onChange={(e) => setNewExpiration(e.target.value)}
                        className="w-full px-3 py-3 bg-zinc-950 border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-[#00F0FF] rounded-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end mt-2">
                  <button 
                    type="submit"
                    className="w-full md:w-auto px-6 py-3.5 bg-[#00F0FF] hover:bg-white text-black font-black uppercase tracking-widest text-xs transition-colors rounded-none flex items-center justify-center gap-2 cursor-pointer"
                    id="submit-shorten-btn"
                  >
                    <Sparkles className="w-4 h-4" /> GENERATE SHORTCODE
                  </button>
                </div>
              </form>
            </div>

            {/* LAST TRANSACTION VISIT TRACE POPUP DISPLAY */}
            {lastTrace && (
              <div className="bg-zinc-950 border-2 border-[#00F0FF] p-6 rounded-none relative overflow-hidden text-white animate-fade-in" id="system-visit-trace">
                {/* Visual grid accent */}
                <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
                  <Cpu className="w-40 h-40 text-[#00F0FF]" />
                </div>

                <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4 font-mono">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-[#00F0FF]" />
                    <h3 className="font-display font-black text-xs uppercase tracking-wider text-white">REDIRECTION ROUTING WIRE-TRACE</h3>
                  </div>
                  <button 
                    onClick={() => setLastTrace(null)}
                    className="text-xs text-zinc-500 hover:text-white font-black uppercase tracking-widest"
                    id="close-trace-btn"
                  >
                    DISMISS
                  </button>
                </div>

                {lastTrace.rateLimited ? (
                  <div className="flex flex-col gap-2 font-mono">
                    <div className="flex items-center gap-2 text-red-500 font-bold text-sm uppercase">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      429 RATELIMIT DRAINED: SIMULATOR BLOCKED
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-normal">
                      High-throughput throttle filter triggered successfully. Lookups into Redis or Postgres indexes were bypassed entirely to shield underlying worker databases from overload attacks. Total lookups avoided latency: <strong>{lastTrace.latencyMs}ms</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="font-mono">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase tracking-widest">GATEWAY CODE</span>
                        <strong className="text-zinc-100 font-bold">/r/{lastTrace.code}</strong>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase tracking-widest">OFFLOAD TARGET</span>
                        <strong className={lastTrace.cacheHit ? "text-[#00F0FF] font-black uppercase" : "text-yellow-500 font-black uppercase"}>
                          {lastTrace.cacheHit ? "REDIS_HIT" : "PG_DATABASE"}
                        </strong>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase tracking-widest">GATEWAY TIME</span>
                        <strong className={lastTrace.cacheHit ? "text-[#00F0FF] font-black" : "text-white font-black"}>
                          {lastTrace.latencyMs} ms
                        </strong>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase tracking-widest">CPU TIME SAVED</span>
                        <strong className="text-zinc-400">
                          {lastTrace.cacheHit ? `${(config.unindexedDbLatency - lastTrace.latencyMs).toFixed(2)}ms` : "0.00ms"}
                        </strong>
                      </div>
                    </div>

                    <div className="mt-5 p-3 bg-zinc-900 border border-zinc-800 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-zinc-400 font-mono">
                      <span className="truncate">DEST_RDR: <span className="text-white select-all">{lastTrace.originalUrl}</span></span>
                      <a href={`/r/${lastTrace.code}`} target="_blank" rel="noopener noreferrer" className="text-[#00F0FF] hover:underline inline-flex items-center gap-1 font-black uppercase text-[10px] tracking-wider shrink-0">
                        DIRECT ROUTER LINK <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* URL MANAGEMENT LIST METRICS */}
            <div className="bg-zinc-900/60 border-2 border-zinc-800 rounded-none overflow-hidden" id="links-management-section">
              <div className="px-6 py-5 border-b border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-black text-white uppercase tracking-wider text-base">Ingestion Points Directory</h3>
                  <p className="text-[10px] font-mono text-zinc-400 mt-1 uppercase">Activate simulation routing pulses to record visitor statistics.</p>
                </div>
                <span className="px-2.5 py-1 text-[10px] font-bold bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#00F0FF] font-mono uppercase tracking-widest shrink-0">
                  {links.length} TARGET CODES LOADED
                </span>
              </div>

              {links.length === 0 ? (
                <div className="p-12 text-center" id="empty-links-billboard">
                  <div className="p-4 bg-zinc-950/80 border border-zinc-800 text-zinc-600 inline-block">
                    <LinkIcon className="w-8 h-8" />
                  </div>
                  <h4 className="font-mono text-xs font-black text-white mt-4 uppercase tracking-widest">ROOT REGISTRATION BLANK</h4>
                  <p className="text-[11px] font-mono text-zinc-500 mt-1 max-w-sm mx-auto uppercase">
                    Initialize your first short redirect config above to unlock lab controls.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800 overflow-x-auto text-zinc-300 font-mono" id="links-rows-container">
                  {links.map((lnk) => {
                    const isExpired = lnk.expiresAt && new Date(lnk.expiresAt).getTime() < Date.now();
                    return (
                      <div key={lnk.id} className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-90 w-full hover:bg-zinc-900/30 transition-colors" id={`link-row-${lnk.code}`}>
                        
                        {/* URL CODE AND SOURCE */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center flex-wrap gap-2.5">
                            <span className="font-mono text-xs font-black text-[#00F0FF] bg-[#00F0FF]/10 px-2.5 py-1 border border-[#00F0FF]/30">
                              /r/{lnk.code}
                            </span>
                            <span className="text-zinc-600">→</span>
                            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2 py-1 border border-zinc-800 truncate max-w-[200px]" title={lnk.url}>
                              {lnk.url}
                            </span>
                            
                            {/* Check Expiration Status */}
                            {lnk.expiresAt ? (
                              <span className={`text-[9px] px-2 py-0.5 font-bold uppercase flex items-center gap-1 border ${
                                isExpired 
                                  ? 'bg-rose-950 border-rose-800 text-rose-400' 
                                  : 'bg-emerald-950 border-emerald-800 text-emerald-400'
                              }`}>
                                <Clock className="w-3 h-3" />
                                {isExpired ? 'EXPIRED' : `EXP: ${new Date(lnk.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                              </span>
                            ) : (
                              <span className="text-[9px] bg-zinc-950 border border-zinc-850 text-zinc-400 px-2 py-0.5 font-bold uppercase tracking-wide" style={{ borderColor: "#1f1f23" }}>
                                PERMANENT_STABLE
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-zinc-500 mt-2.5 font-mono uppercase tracking-widest">
                            CREATED: {new Date(lnk.createdAt).toLocaleString()}
                          </p>
                        </div>

                        {/* ENGAGEMENT CLICKS & TIMINGS STAT */}
                        <div className="flex items-center gap-6 shrink-0 self-end md:self-auto w-full md:w-auto justify-between md:justify-end">
                          <div className="text-right flex flex-col">
                            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">TOTAL_HITS</span>
                            <span className="font-display font-black text-lg text-white">{lnk.clicks} hits</span>
                          </div>

                          {/* ACTION BUTTONS */}
                          <div className="flex items-center gap-2">
                            {/* Simulate Analytical Visit */}
                            <button 
                              onClick={() => handleSimulateVisit(lnk.code)}
                              disabled={isExpired}
                              className="px-3.5 py-2 text-[10px] font-bold text-[#00F0FF] bg-[#00F0FF]/10 hover:bg-[#00F0FF]/25 border border-[#00F0FF]/30 transition-all font-mono uppercase tracking-wider cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                              title="Simulate Single Click Visitor Ingestion"
                              id={`sim-click-btn-${lnk.code}`}
                            >
                              <MousePointerClick className="w-3.5 h-3.5 inline mr-1" /> Visit
                            </button>

                            {/* Trigger 429 rate limit testing */}
                            <button 
                              onClick={() => triggerStressTest(lnk.code)}
                              disabled={isExpired || isStressTesting}
                              className="px-3.5 py-2 text-[10px] font-bold text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-550 transition-all font-mono uppercase tracking-wider cursor-pointer disabled:opacity-20"
                              style={{ borderColor: "#854d0e" }}
                              title="Engage Token Bucket Rate Limiter stress test (paralls hits)"
                              id={`stress-test-btn-${lnk.code}`}
                            >
                              <Flame className="w-3.5 h-3.5 inline mr-1 animate-pulse" /> Stress
                            </button>

                            {/* Delete code */}
                            <button 
                              onClick={() => handleDeleteLink(lnk.id)}
                              className="p-2 text-zinc-500 hover:text-red-500 bg-zinc-950 border border-zinc-800 hover:border-red-900 transition-colors cursor-pointer"
                              title="Remove Link"
                              id={`delete-btn-${lnk.code}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </section>

        {/* ANALYTICS CHARTS SUITE (VISUAL DATABASE INSIGHTS) */}
        <section className="bg-zinc-950/40 p-6 border-2 border-zinc-800 rounded-none" id="analytical-insight-charts">
          <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4 mb-6">
            <Activity className="w-5 h-5 text-[#00F0FF]" />
            <h2 className="font-display font-black text-base uppercase tracking-wider text-white">Visual Traffic Geolocation & Timings Node</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* TIMELINE AREA CHART */}
            <div className="lg:col-span-2">
              <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-black mb-4">// TIME INTERVAL TRAFFIC DELAY (ACTIVE 24-HOUR BUFFER)</h3>
              <div className="h-[250px] w-full bg-zinc-950 border border-zinc-800 p-3 font-mono" id="timeline-chart-root">
                {analytics.totalClicks === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-650 uppercase tracking-widest italic" style={{ color: "#3f3f46" }}>
                    Console buffer clean. Engage traffic to draw graphs.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.timeline}>
                      <defs>
                        <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} />
                      <YAxis stroke="#52525b" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: "0px", color: "#f4f4f5", fontSize: "11px" }} />
                      <Area type="monotone" dataKey="clicks" stroke={CHART_COLORS.primary} strokeWidth={2.5} fillOpacity={1} fill="url(#colorClicks)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* BAR BREAKDOWNS (REFERRERS) */}
            <div className="lg:col-span-1">
              <h3 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-black mb-4">// TRAFFIC ROUTING AGENTS REVENUE</h3>
              <div className="h-[250px] w-full bg-zinc-950 border border-zinc-800 p-3 font-mono" id="referrers-chart-root">
                {analytics.totalClicks === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-650 uppercase tracking-widest italic" style={{ color: "#3f3f46" }}>
                    No referrer records found.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.referrers} layout="vertical">
                      <XAxis type="number" stroke="#52525b" fontSize={9} hide />
                      <YAxis type="category" dataKey="name" stroke="#a1a1aa" fontSize={10} width={90} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: "0px", color: "#f4f4f5", fontSize: "11px" }} />
                      <Bar dataKey="value" radius={[0, 0, 0, 0]} height={12}>
                        {analytics.referrers.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={idx % 2 === 0 ? "#00F0FF" : "#ffffff"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

          </div>

          {/* EXTRA BENTO BREAKDOWNS (DEVICES, BROWSERS, COUNTRIES) */}
          {analytics.totalClicks > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 pt-8 border-t border-zinc-800/80" id="bento-pie-breakdowns">
              
              <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-none font-mono">
                <h4 className="text-[11px] font-black text-white block mb-4 uppercase tracking-widest">// USER_AGENT_METRICS</h4>
                <div className="flex flex-col gap-3">
                  {analytics.browsers.map((b) => (
                    <div key={b.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">{b.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-[80px] bg-zinc-900 border border-zinc-800 h-2 rounded-none overflow-hidden">
                          <div 
                            className="bg-[#00F0FF] h-full animate-pulse" 
                            style={{ width: `${(b.value / analytics.totalClicks) * 100}%` }}
                          />
                        </div>
                        <span className="font-bold text-white text-[10px] w-12 text-right">{b.value} reqs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-none font-mono">
                <h4 className="text-[11px] font-black text-white block mb-4 uppercase tracking-widest">// TARGET_HARDWARE_METRICS</h4>
                <div className="flex flex-col gap-3">
                  {analytics.devices.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">{d.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-[80px] bg-zinc-900 border border-zinc-800 h-2 rounded-none overflow-hidden">
                          <div 
                            className="bg-white h-full" 
                            style={{ width: `${(d.value / analytics.totalClicks) * 100}%` }}
                          />
                        </div>
                        <span className="font-bold text-white text-[10px] w-12 text-right">{d.value} reqs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-none font-mono">
                <h4 className="text-[11px] font-black text-white block mb-4 uppercase tracking-widest">// REGIONAL_TRAFFIC_METRICS</h4>
                <div className="flex flex-col gap-3">
                  {analytics.countries.slice(0, 4).map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400 truncate max-w-[110px]">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-[80px] bg-zinc-900 border border-zinc-800 h-2 rounded-none overflow-hidden">
                          <div 
                            className="bg-[#00F0FF] h-full" 
                            style={{ width: `${(c.value / analytics.totalClicks) * 100}%` }}
                          />
                        </div>
                        <span className="font-bold text-white text-[10px] w-12 text-right">{c.value} reqs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </section>

        {/* LOGS AND METERS DEEP INGESTION TELEMETRY (REALTIME CONSOLE) */}
        <section className="bg-zinc-950 border-2 border-zinc-800 p-6 rounded-none shadow-2xl" id="logs-and-telemetry-console">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5 mb-5 font-mono">
            <div className="flex items-center gap-2.5 text-zinc-100">
              <Terminal className="w-5 h-5 text-[#00F0FF]" />
              <div>
                <h2 className="font-display font-black text-sm uppercase tracking-wider text-white">System Operations & Ingestion Telemetry</h2>
                <p className="text-[10px] text-zinc-400 mt-1 uppercase">Live trace logs of in-memory caching blocks & relational table seeking time scales.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 bg-zinc-900 text-zinc-400 px-3 py-1 text-[10px] border border-zinc-800 font-mono font-bold">
                REDIS: {logStats.redisCount} | POSTGRES: {logStats.postgresCount}
              </span>
              <button 
                onClick={handleClearLogs}
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 hover:text-white text-zinc-400 font-black text-[10px] border border-zinc-800 rounded-none transition-all uppercase tracking-widest cursor-pointer"
                id="clear-logs-btn"
              >
                Clear Console
              </button>
            </div>
          </div>

          <div className="h-[200px] overflow-y-auto space-y-2.5 font-mono text-xs pr-2 border border-zinc-900/60 p-4 bg-[#050505]/95 rounded-none" id="console-logs-scroller">
            {logs.length === 0 ? (
              <div className="text-zinc-600 text-center py-12 italic uppercase tracking-wider text-[10px]" id="empty-logs-message">
                Console buffer idle. Trigger routing events or load-simulations to stream live telemetry.
              </div>
            ) : (
              logs.map((log) => {
                return (
                  <div key={log.id} className="flex flex-col sm:flex-row sm:items-start gap-1 py-2 border-b border-zinc-900 shrink-0 text-[11px] hover:bg-zinc-900/20 px-1 transition-colors">
                    
                    {/* Timestamp badge */}
                    <span className="text-zinc-600 shrink-0 select-none font-bold mr-1.5">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>

                    {/* Operation Type */}
                    <span className={`shrink-0 font-black uppercase text-[9px] tracking-widest px-1.5 py-0.5 mr-2 select-none border ${
                      log.type === "success" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900" :
                      log.type === "warning" ? "bg-yellow-950/40 text-yellow-500 border-yellow-905" :
                      log.type === "error" ? "bg-rose-950/40 text-rose-400 border-rose-900" :
                      "bg-zinc-900 text-zinc-400 border-zinc-800"
                    }`} style={log.type === "warning" ? { borderColor: "#854d0e" } : {}}>
                      {log.type}
                    </span>

                    {/* Operational message */}
                    <span className="text-zinc-300 break-words flex-1">
                      {log.message}
                    </span>

                    {/* Operational Latency */}
                    <span className={`shrink-0 font-bold ml-auto pl-4 font-mono ${
                      log.type === "success" ? "text-[#00F0FF]" :
                      log.type === "warning" ? "text-yellow-500" :
                      log.type === "error" ? "text-rose-500" :
                      "text-zinc-400"
                    }`}>
                      {log.latencyMs} ms
                    </span>

                  </div>
                );
              })
            )}
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="bg-zinc-950 border-t border-zinc-900 py-10 mt-16 text-center text-xs font-mono" id="footer-container">
        <div className="max-w-4xl mx-auto px-4 space-y-3">
          <p className="text-zinc-400 leading-relaxed uppercase tracking-wider text-[10px]">
            The ShortStack performance lab simulates an enterprise application architecture featuring a Java Spring routing layer, asynchronous non-blocking Redis in-memory lookup maps, and indexed B-Tree database entities. 
          </p>
          <p className="text-zinc-500 uppercase tracking-widest text-[9px]">
            Created under Antigravity high-performance simulation guidelines • Project year 2026 Sandbox Environment
          </p>
        </div>
      </footer>
      
    </div>
  );
}
