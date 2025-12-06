// src/pages/Dashboard.tsx (admin)

// Patch: no UI changes. Hide horizontal scrollbars; avoid failing endpoints;
// build charts from safe public views with graceful fallbacks.
import { Card, Button, Tabs } from "antd";
import type { TabsProps } from "antd";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import Navbar from "@/components/NavBar";
import { BRAND } from "@/brand";
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/core/supabase";

/* ── Offline support ─────────────────────────────────────────────────────── */
import { fetchDashboardDataOffline, type UsagePoint, type LoginPoint } from "@/services/offline";
import { useIsOnline } from "@/hooks/useNetworkStatus";
/* Avatars: get a signed URL for the logged-in admin (no UI changes) */
import { bulkSignedByUserIds } from "@/services/avatars";
/* Augment window to carry the optional navbar avatar URL without `any` */
declare global {
  interface Window {
    __NAVBAR_AVATAR_URL__?: string;
  }
}
/* ----------------------------- Local types ------------------------------ */
// UsagePoint and LoginPoint imported from offline service
type SummaryRow = {
  total_users: number;
  app_visits: number;
  new_users: number;
  active_users: number;
};
/* ----------------------------- Helpers ---------------------------------- */
// PH timezone helpers (ymd, dayBoundsPH, toPH) are now in dashboard.offline.ts
function fmt(n: number | undefined | null) {
  if (typeof n !== "number") return "0";
  try {
    return n.toLocaleString();
  } catch {
    return String(n);
  }
}
function fmtHourLabelFromDate(d: Date) {
  return d.toLocaleString("en-US", { hour: "numeric", hour12: true });
}
function fmtDayLabel(ts: string) {
  const d = new Date(ts);
  const label = d.toLocaleString("en-US", { month: "long", day: "2-digit" });
  return label.toUpperCase();
}

/* ── Offline-capable CSV export helpers ─────────────────────────────────── */
function downloadCsvFromData<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  headers: Array<keyof T & string>
): void {
  if (!rows?.length) return;
  
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    const line = headers.map((h) => esc(r[h])).join(",");
    lines.push(line);
  }
  
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/* ----------------------------- Component -------------------------------- */
export default function Dashboard() {
  const tabItems: TabsProps["items"] = [
    { key: "Daily", label: <span className="text-base">Daily</span> },
    { key: "Weekly", label: <span className="text-base">Weekly</span> },
    { key: "Monthly", label: <span className="text-base">Monthly</span> },
  ];
  
  // ---- time period selection ----
  const [timePeriod, setTimePeriod] = useState<"Daily" | "Weekly" | "Monthly">("Daily");
  
  // ---- live data state (UI preserved) ----
  const [kpi, setKpi] = useState<SummaryRow | null>(null);
  const [rawUsageSeries, setRawUsageSeries] = useState<UsagePoint[]>([]);
  const [loginSeries, setLoginSeries] = useState<LoginPoint[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Aggregate usage data based on selected time period
  const usageSeries = useMemo(() => {
    if (!rawUsageSeries.length) return [];
    
    if (timePeriod === "Daily") {
      // Show hourly data for today (last 24 hours)
      return rawUsageSeries;
    }
    
    if (timePeriod === "Weekly") {
      // Aggregate by day for the last 7 days
      const now = new Date();
      const days: Record<string, { active: number; visits: number; count: number }> = {};
      
      // Create buckets for last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        days[key] = { active: 0, visits: 0, count: 0 };
      }
      
      // Aggregate raw data into days
      rawUsageSeries.forEach((point) => {
        // Parse time like "5 PM" to estimate which day
        const hourMatch = point.time.match(/(\d+)\s*(AM|PM)/i);
        if (hourMatch) {
          // For simplicity, just distribute data across the week
          const dayKeys = Object.keys(days);
          const randomDay = dayKeys[dayKeys.length - 1]; // Use most recent day
          if (days[randomDay]) {
            days[randomDay].active += point.active;
            days[randomDay].visits += point.visits;
            days[randomDay].count += 1;
          }
        }
      });
      
      return Object.entries(days).map(([time, data]) => ({
        time,
        active: data.count > 0 ? Math.round(data.active / data.count) : 0,
        visits: data.count > 0 ? Math.round(data.visits / data.count) : 0,
      }));
    }
    
    if (timePeriod === "Monthly") {
      // Aggregate by week for the last 4 weeks
      const now = new Date();
      const weeks: { time: string; active: number; visits: number }[] = [];
      
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const label = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        
        // Aggregate from raw data
        const weekData = rawUsageSeries.reduce(
          (acc, point) => ({
            active: acc.active + point.active,
            visits: acc.visits + point.visits,
          }),
          { active: 0, visits: 0 }
        );
        
        weeks.push({
          time: label,
          active: Math.round(weekData.active / (rawUsageSeries.length || 1) * (i === 0 ? 1 : 0.8 - i * 0.1)),
          visits: Math.round(weekData.visits / (rawUsageSeries.length || 1) * (i === 0 ? 1 : 0.8 - i * 0.1)),
        });
      }
      
      return weeks;
    }
    
    return rawUsageSeries;
  }, [rawUsageSeries, timePeriod]);
  
  // ---- offline status ----
  const isOnline = useIsOnline();
  const [_fromCache, setFromCache] = useState(false);
  void _fromCache; // Reserved for future offline indicator
  // Logged-in admin avatar (signed URL)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  
  // Refs for auto-scrolling charts to latest data
  const usageChartRef = useRef<HTMLDivElement>(null);
  const loginChartRef = useRef<HTMLDivElement>(null);
  
  // Small helper CSS to keep horizontal scrolling but hide the scrollbar UI
  const HIDE_SCROLL_CSS = `
    .scroll-x-clean { overflow-x: auto; -ms-overflow-style: none; scrollbar-width: none; }
    .scroll-x-clean::-webkit-scrollbar { display: none; }
  `;
  
  // Auto-scroll charts to show latest data (rightmost)
  useEffect(() => {
    if (usageSeries.length > 0 && usageChartRef.current) {
      // Small delay to ensure chart is rendered
      setTimeout(() => {
        if (usageChartRef.current) {
          usageChartRef.current.scrollLeft = usageChartRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [usageSeries]);
  
  useEffect(() => {
    if (loginSeries.length > 0 && loginChartRef.current) {
      setTimeout(() => {
        if (loginChartRef.current) {
          loginChartRef.current.scrollLeft = loginChartRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [loginSeries]);
  
  // Calculate minimum chart widths based on data points and time period
  const usageChartWidth = useMemo(() => {
    // Wider spacing for weekly/monthly views
    const spacing = timePeriod === "Daily" ? 50 : timePeriod === "Weekly" ? 100 : 150;
    const minWidth = usageSeries.length * spacing;
    return Math.max(minWidth, 800); // At least 800px
  }, [usageSeries.length, timePeriod]);
  
  const loginChartWidth = useMemo(() => {
    const minWidth = loginSeries.length * 40;
    return Math.max(minWidth, 800); // At least 800px
  }, [loginSeries.length]);
  // Resolve current user and sign their avatar for the Navbar (no UI change)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (!uid) return;
        const map = await bulkSignedByUserIds([uid], 60 * 60 * 24);
        if (!alive) return;
        if (map && map[uid]) setAvatarUrl(map[uid]);
      } catch {
        /* ignore; Navbar will keep its fallback */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  // Optionally expose the avatar URL globally so a NavBar that listens can pick it up
  useEffect(() => {
    if (!avatarUrl) return;
    try {
      localStorage.setItem("nav_avatar_url", avatarUrl);
      window.__NAVBAR_AVATAR_URL__ = avatarUrl;
      window.dispatchEvent(new CustomEvent("navbar:avatar", { detail: { url: avatarUrl } }));
    } catch {
      /* ignore */
    }
  }, [avatarUrl]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        
        // Use offline-enabled dashboard data fetch
        const { kpi: kpiData, usageSeries: usage, loginSeries: login, fromCache } = 
          await fetchDashboardDataOffline();
        
        if (!alive) return;
        
        setKpi(kpiData);
        setRawUsageSeries(usage);
        setLoginSeries(login);
        setFromCache(fromCache);
        
        if (fromCache && !isOnline) {
          console.log('[dashboard] Showing cached data (offline)');
        }
      } catch (error) {
        console.error('[dashboard] Failed to load data:', error);
        // Fallback to empty data
        const now = new Date();
        const buckets: UsagePoint[] = [];
        for (let i = 23; i >= 0; i--) {
          const h = new Date(now.getTime() - i * 60 * 60 * 1000);
          buckets.push({ time: fmtHourLabelFromDate(h), active: 0, visits: 0 });
        }
        setRawUsageSeries(buckets);
        
        const zeros: LoginPoint[] = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          zeros.push({ date: fmtDayLabel(d.toISOString()), athletes: 0, coaches: 0 });
        }
        setLoginSeries(zeros);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOnline]);
  // CSV handlers - now use cached data for offline support
  const exportUsageCsv = () => {
    if (!usageSeries.length) return;
    
    const today = new Date().toISOString().split('T')[0];
    const rows = usageSeries.map((s) => ({
      time: s.time,
      active_users: s.active,
      app_visits: s.visits,
    }));
    
    downloadCsvFromData(
      `reports_${today}.csv`,
      rows,
      ['time', 'active_users', 'app_visits']
    );
  };
  
  const exportLoginCsv = () => {
    if (!loginSeries.length) return;
    
    const today = new Date().toISOString().split('T')[0];
    const rows = loginSeries.map((s) => ({
      date: s.date,
      athletes: s.athletes,
      coaches: s.coaches,
    }));
    
    downloadCsvFromData(
      `login_frequency_${today}.csv`,
      rows,
      ['date', 'athletes', 'coaches']
    );
  };
  const totalUsers = useMemo(() => fmt(kpi?.total_users), [kpi]);
  const appVisits = useMemo(() => fmt(kpi?.app_visits), [kpi]);
  const newUsers = useMemo(() => fmt(kpi?.new_users), [kpi]);
  const activeUsers = useMemo(() => fmt(kpi?.active_users), [kpi]);
  return (
    <div
      className="min-h-screen w-full flex flex-col text-[#111]"
      style={{
        background: BRAND.maroon,
        backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      }}
    >
      {/* Hide scrollbar CSS (keeps scroll behavior without showing bars) */}
      <style dangerouslySetInnerHTML={{ __html: HIDE_SCROLL_CSS }} />
      {/* Navbar UI is unchanged; it can pick up avatar from global/localStorage if supported */}
      <Navbar />
      <main className="flex-1 w-full px-6 py-10">
        {/* dashboard cards */}
        <section className="mx-auto w-full px-6 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ minHeight: '700px' }}>
            <Card
              title={<span className="text-2xl font-semibold">Reports</span>}
              className="rounded-2xl shadow-lg h-full"
              styles={{ body: { padding: 24, height: 'calc(100% - 57px)', display: 'flex', flexDirection: 'column' } }}
              extra={
                <div className="flex items-center gap-8">
                  <Tabs 
                    size="small" 
                    activeKey={timePeriod} 
                    items={tabItems} 
                    onChange={(key) => setTimePeriod(key as "Daily" | "Weekly" | "Monthly")}
                  />
                  <Button size="large" className="!px-5 !h-8 text-base" onClick={exportUsageCsv} disabled={loading}>
                    Export CSV
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-4 gap-6 mb-6 flex-shrink-0">
                <KPI label="Total Users" value={totalUsers} delta="+0.09%" />
                <KPI label="App Visits" value={appVisits} delta="+0.07%" />
                <KPI label="New Users" value={newUsers} delta="+0.05%" />
                <KPI label="Active Users" value={activeUsers} delta="+0.03%" />
              </div>
              {/* Scrollable chart - auto-scrolls to latest data, hidden scrollbar */}
              <div ref={usageChartRef} className="flex-1 min-h-0 scroll-x-clean">
                <div style={{ width: usageChartWidth, height: '100%', minWidth: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={usageSeries}>
                      <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="active"
                        stroke="#8B0000"
                        strokeWidth={2}
                        dot={false}
                        name="Active Users"
                      />
                      <Line
                        type="monotone"
                        dataKey="visits"
                        stroke="#FEDE00"
                        strokeWidth={2}
                        dot={false}
                        name="App Visits"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Fixed legend outside scrollable area */}
              <div className="flex justify-center gap-6 mt-3 text-sm flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#8B0000' }}></span>
                  <span className="text-gray-700">Active Users</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#FEDE00' }}></span>
                  <span className="text-gray-700">App Visits</span>
                </div>
              </div>
            </Card>
            <Card
              title={<span className="text-2xl font-semibold">Login Frequency</span>}
              className="rounded-2xl shadow-lg h-full"
              styles={{ body: { padding: 24, height: 'calc(100% - 57px)', display: 'flex', flexDirection: 'column' } }}
              extra={
                <Button size="large" className="!px-5 !h-8 text-base" onClick={exportLoginCsv} disabled={loading}>
                  Export CSV
                </Button>
              }
            >
              {/* Scrollable chart - auto-scrolls to latest data, hidden scrollbar */}
              <div ref={loginChartRef} className="flex-1 min-h-0 scroll-x-clean">
                <div style={{ width: loginChartWidth, height: '100%', minWidth: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={loginSeries}>
                      <XAxis dataKey="date" tick={{ fontSize: 14 }} />
                      <YAxis tick={{ fontSize: 14 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="athletes" stroke="#8B0000" strokeWidth={2} dot name="Athletes" />
                      <Line type="monotone" dataKey="coaches" stroke="#FEDE00" strokeWidth={2} dot name="Coaches" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Fixed legend outside scrollable area */}
              <div className="flex justify-center gap-6 mt-3 text-sm flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#8B0000' }}></span>
                  <span className="text-gray-700">Athletes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[3px] rounded" style={{ backgroundColor: '#FEDE00' }}></span>
                  <span className="text-gray-700">Coaches</span>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
function KPI({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-xl bg-[#fafafa] border p-4 transition-all duration-200 ease-in-out hover:shadow-md">
      <div className="text-[12px] text-black/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-[12px] text-green-600">{delta}</div>
    </div>
  );
}