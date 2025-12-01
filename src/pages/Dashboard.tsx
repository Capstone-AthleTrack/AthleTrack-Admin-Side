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
  Legend,
} from "recharts";
import Navbar from "@/components/NavBar";
import { BRAND } from "@/brand";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/core/supabase";
import { exportReportsCSV, exportLoginCSV } from "@/services/metrics";
/* Avatars: get a signed URL for the logged-in admin (no UI changes) */
import { bulkSignedByUserIds } from "@/services/avatars";

/* Augment window to carry the optional navbar avatar URL without `any` */
declare global {
  interface Window {
    __NAVBAR_AVATAR_URL__?: string;
  }
}

/* ----------------------------- Local types ------------------------------ */

type UsagePoint = { time: string; active: number; visits: number };
type LoginPoint = { date: string; coaches: number; athletes: number };

type SummaryRow = {
  total_users: number;
  app_visits: number;
  new_users: number;
  active_users: number;
};

/* ----------------------------- Helpers ---------------------------------- */

// PH timezone helpers (UTC+8, no DST)
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayBoundsPH(d: Date): { fromIso: string; toIso: string; day: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const dd = d.getDate();
  const fromUtc = new Date(Date.UTC(y, m, dd, -8, 0, 0, 0));
  const toUtc = new Date(Date.UTC(y, m, dd + 1, -8, 0, 0, 0));
  return { fromIso: fromUtc.toISOString(), toIso: toUtc.toISOString(), day: ymd(d) };
}

function toPH(utcIso: string): Date {
  const t = new Date(utcIso).getTime();
  return new Date(t + PH_OFFSET_MS);
}

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

type PostgrestErrorLike = { code?: string; message?: string };
function relationMissing(error: PostgrestErrorLike | null | undefined): boolean {
  return !!error && (error.code === "42P01" || /relation .* does not exist/i.test(error.message || ""));
}

/* ----------------------------- Component -------------------------------- */

export default function Dashboard() {
  const tabItems: TabsProps["items"] = [
    { key: "Daily", label: <span className="text-base">Daily</span> },
    { key: "Weekly", label: <span className="text-base">Weekly</span> },
    { key: "Monthly", label: <span className="text-base">Monthly</span> },
  ];

  // ---- live data state (UI preserved) ----
  const [kpi, setKpi] = useState<SummaryRow | null>(null);
  const [usageSeries, setUsageSeries] = useState<UsagePoint[]>([]);
  const [loginSeries, setLoginSeries] = useState<LoginPoint[]>([]);
  const [loading, setLoading] = useState(false);

  // Logged-in admin avatar (signed URL)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  // Small helper CSS to keep horizontal scrolling but hide the scrollbar UI
  const HIDE_SCROLL_CSS = `
    .scroll-x-clean { overflow-x: auto; -ms-overflow-style: none; scrollbar-width: none; }
    .scroll-x-clean::-webkit-scrollbar { display: none; }
  `;

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

        // 1) KPI cards
        const today = new Date();
        const { fromIso: phStartIso, toIso: phEndIso } = dayBoundsPH(today);

        // Total users (exact count)
        let totalUsers = 0;
        {
          const { count, error } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true });
          if (!error && typeof count === "number") totalUsers = count;
        }

        // New users today (created_at or inserted_at)
        let newUsers = 0;
        {
          let counted = false;
          const r1 = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gte("created_at", phStartIso)
            .lt("created_at", phEndIso);
          if (!r1.error && typeof r1.count === "number") {
            newUsers = r1.count;
            counted = true;
          }
          if (!counted) {
            const r2 = await supabase
              .from("profiles")
              .select("*", { count: "exact", head: true })
              .gte("inserted_at", phStartIso)
              .lt("inserted_at", phEndIso);
            if (!r2.error && typeof r2.count === "number") newUsers = r2.count;
          }
        }

        // Usage + KPI (app visits / active users) from public view v_daily_activity_24h
        let appVisits = 0;
        let activeUsers = 0;
        {
          try {
            const { data, error } = await supabase
              .from("v_daily_activity_24h")
              .select("bucket, active_users, session_starts")
              .order("bucket", { ascending: true });

            if (!error && Array.isArray(data)) {
              const mapped: UsagePoint[] = (data as Array<{
                bucket: string;
                active_users: number | null;
                session_starts: number | null;
              }>).map((r) => {
                // use toPH once to satisfy TS/ESLint and keep PH hours
                const ph = toPH(r.bucket);
                return {
                  time: fmtHourLabelFromDate(
                    new Date(ph.getFullYear(), ph.getMonth(), ph.getDate(), ph.getHours())
                  ),
                  active: Number(r.active_users ?? 0),
                  visits: Number(r.session_starts ?? 0),
                };
              });

              if (alive) setUsageSeries(mapped);
              appVisits = mapped.reduce((s, v) => s + (v.visits || 0), 0);
              // max active in any hour (or sum—choose max to mirror "concurrent-ish")
              activeUsers = mapped.reduce((m, v) => (v.active > m ? v.active : m), 0);
            } else {
              // fallback: empty 24h baseline
              const now = new Date();
              const buckets: UsagePoint[] = [];
              for (let i = 23; i >= 0; i--) {
                const h = new Date(now.getTime() - i * 60 * 60 * 1000);
                buckets.push({ time: fmtHourLabelFromDate(h), active: 0, visits: 0 });
              }
              if (alive) setUsageSeries(buckets);
            }
          } catch {
            // fallback: empty 24h baseline
            const now = new Date();
            const buckets: UsagePoint[] = [];
            for (let i = 23; i >= 0; i--) {
              const h = new Date(now.getTime() - i * 60 * 60 * 1000);
              buckets.push({ time: fmtHourLabelFromDate(h), active: 0, visits: 0 });
            }
            if (alive) setUsageSeries(buckets);
          }
        }

        if (alive) {
          setKpi({
            total_users: totalUsers,
            app_visits: appVisits,
            new_users: newUsers,
            active_users: activeUsers,
          });
        }

        // 2) Login frequency (last 30 days) — prefer public view; fallback to zeros
        try {
          const end = new Date();
          const start = new Date(end.getTime() - 29 * 86400000);

          const { data, error } = await supabase
            .from("vw_daily_login_frequency")
            .select("day, athlete, coach")
            .gte("day", ymd(start))
            .lte("day", ymd(end))
            .order("day", { ascending: true });

          if (!error && Array.isArray(data)) {
            const rows = data as Array<{ day: string; athlete?: number | null; coach?: number | null }>;
            if (alive) {
              setLoginSeries(
                rows.map((r) => ({
                  date: fmtDayLabel(r.day),
                  athletes: Number(r.athlete ?? 0),
                  coaches: Number(r.coach ?? 0),
                }))
              );
            }
          } else if (relationMissing(error)) {
            // view not present → zeros baseline
            const zeros: LoginPoint[] = [];
            for (let i = 29; i >= 0; i--) {
              const d = new Date(Date.now() - i * 86400000);
              zeros.push({ date: fmtDayLabel(d.toISOString()), athletes: 0, coaches: 0 });
            }
            if (alive) setLoginSeries(zeros);
          }
        } catch {
          const zeros: LoginPoint[] = [];
          for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            zeros.push({ date: fmtDayLabel(d.toISOString()), athletes: 0, coaches: 0 });
          }
          if (alive) setLoginSeries(zeros);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // CSV handlers (admin-only RPCs under the hood or direct-table)
  const exportUsageCsv = () => exportReportsCSV();
  const exportLoginCsv = () => exportLoginCSV();

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card
              title={<span className="text-2xl font-semibold">Reports</span>}
              className="rounded-2xl shadow-lg"
              bodyStyle={{ padding: 24 }}
              extra={
                <div className="flex items-center gap-8">
                  <Tabs size="small" defaultActiveKey="Daily" items={tabItems} />
                  <Button size="large" className="!px-5 !h-8 text-base" onClick={exportUsageCsv} disabled={loading}>
                    Export CSV
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-4 gap-6 mb-6">
                <KPI label="Total Users" value={totalUsers} delta="+0.09%" />
                <KPI label="App Visits" value={appVisits} delta="+0.07%" />
                <KPI label="New Users" value={newUsers} delta="+0.05%" />
                <KPI label="Active Users" value={activeUsers} delta="+0.03%" />
              </div>

              {/* Keep scroll behavior if content gets wider, but hide scrollbar UI */}
              <div className="h-[28rem] scroll-x-clean">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={usageSeries}>
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
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
            </Card>

            <Card
              title={<span className="text-2xl font-semibold">Login Frequency</span>}
              className="rounded-2xl shadow-lg"
              bodyStyle={{ padding: 24 }}
              extra={
                <Button size="large" className="!px-5 !h-8 text-base" onClick={exportLoginCsv} disabled={loading}>
                  Export CSV
                </Button>
              }
            >
              {/* Keep scroll behavior if content gets wider, but hide scrollbar UI */}
              <div className="h-[35rem] scroll-x-clean">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={loginSeries}>
                    <XAxis dataKey="date" tick={{ fontSize: 14 }} />
                    <YAxis tick={{ fontSize: 14 }} />
                    <Tooltip />
                    <Legend formatter={(v) => <span style={{ fontSize: "14px" }}>{v}</span>} />
                    <Line type="monotone" dataKey="coaches" stroke="#ff7aa2" strokeWidth={2} dot name="Coaches" />
                    <Line type="monotone" dataKey="athletes" stroke="#8ad0ff" strokeWidth={2} dot name="Athletes" />
                  </LineChart>
                </ResponsiveContainer>
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
