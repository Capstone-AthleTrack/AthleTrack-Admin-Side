import { useMemo, useState, useEffect, useRef } from "react";  
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeftOutlined } from "@ant-design/icons";
import NavBar from "@/components/NavBar";
import { BRAND } from "@/brand";
import {
  loadAthleteBundle,
  type ProfileLite,
  type ChartAthletePrePost,
  type ChartAthletePerf,
  shapeAthletePrePost,
  shapeAthletePerf,
  downloadCsv, // same helper used by SportsDetail.tsx
} from "@/services/sports";
import supabase from "@/core/supabase";
/* ── Avatars (signed URLs; no UI changes) ─────────────────────────────────── */
import { bulkSignedByUserIds } from "@/services/avatars";

/* ── Export helpers copied from SportsDetail (adjusted for Athlete) ──────── */
import { toPng } from "html-to-image";
import { saveAs } from "file-saver";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

/* simple slug for filenames */
const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Local shape that tolerates both `id` and `user_id` and optional fields we render. */
type ExtendedProfile = ProfileLite & {
  id?: string;
  user_id?: string;
  email?: string | null;
  pup_webmail?: string | null;
  pup_id?: string | number | null;
  birthdate?: string | null;
  phone?: string | null;
  role?: string | null;
  full_name?: string | null;
};

async function exportChartAsPdf(node: HTMLElement, filename: string) {
  const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: "#FFFFFF" });
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve) => (img.onload = () => resolve()));

  const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (pageWidth - w) / 2;
  const y = (pageHeight - h) / 2;

  doc.addImage(dataUrl, "PNG", x, y, w, h);
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

async function exportPrepostXlsxWithChartForAthlete(
  athleteSlug: string,
  rows: Array<{
    "Athlete Name": string;
    "Email": string;
    "PUP ID": string;
    "Pre Test": number | string;
    "Post Test": number | string;
  }>,
  chartNode: HTMLElement
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pre vs Post");

  ws.columns = [
    { header: "Athlete Name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 36 },
    { header: "PUP ID", key: "pup", width: 18 },
    { header: "Pre Test", key: "pre", width: 12 },
    { header: "Post Test", key: "post", width: 12 },
  ];

  rows.forEach((r) =>
    ws.addRow({
      name: r["Athlete Name"],
      email: r["Email"],
      pup: r["PUP ID"],
      pre: r["Pre Test"],
      post: r["Post Test"],
    })
  );

  const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF" });
  const base64 = dataUrl.split(",")[1];
  const imgId = wb.addImage({ base64, extension: "png" });

  const startRow = rows.length + 3;
  ws.addImage(imgId, {
    tl: { col: 0, row: startRow },
    ext: { width: 900, height: 420 },
    editAs: "oneCell",
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `${athleteSlug}-prepost-with-chart.xlsx`);
}

async function exportPerformanceXlsxWithChartForAthlete(
  athleteSlug: string,
  rows: Array<{
    "Athlete Name": string;
    "Email": string;
    "PUP ID": string;
    "Week": string;
    "Agility": number;
    "Strength": number;
    "Power": number;
    "Flexibility": number;
    "Reaction Time": number;
    "Coordination": number;
  }>,
  chartNode: HTMLElement
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Performance");

  ws.columns = [
    { header: "Athlete Name", key: "athlete", width: 28 },
    { header: "Email", key: "email", width: 36 },
    { header: "PUP ID", key: "pupid", width: 18 },
    { header: "Week", key: "week", width: 14 },
    { header: "Agility", key: "agility", width: 12 },
    { header: "Strength", key: "strength", width: 12 },
    { header: "Power", key: "power", width: 12 },
    { header: "Flexibility", key: "flexibility", width: 12 },
    { header: "Reaction Time", key: "reaction", width: 16 },
    { header: "Coordination", key: "coordination", width: 14 },
  ];

  rows.forEach((r) =>
    ws.addRow({
      athlete: r["Athlete Name"],
      email: r["Email"],
      pupid: r["PUP ID"],
      week: r["Week"],
      agility: r["Agility"],
      strength: r["Strength"],
      power: r["Power"],
      flexibility: r["Flexibility"],
      reaction: r["Reaction Time"],
      coordination: r["Coordination"],
    })
  );

  const dataUrl = await toPng(chartNode, { cacheBust: true, backgroundColor: "#FFFFFF" });
  const base64 = dataUrl.split(",")[1];
  const imgId = wb.addImage({ base64, extension: "png" });

  const startRow = rows.length + 3;
  ws.addImage(imgId, {
    tl: { col: 0, row: startRow },
    ext: { width: 900, height: 420 },
    editAs: "oneCell",
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `${athleteSlug}-performance-with-chart.xlsx`);
}

/* ── View component (UI unchanged; just wired export like SportsDetail) ───── */

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JULY", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default function AthleteDetail() {
  const navigate = useNavigate();
  const { sportName = "", athleteName = "" } = useParams<{ sportName?: string; athleteName?: string }>();

  // Live state
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [prepostRows, setPrepostRows] = useState<ChartAthletePrePost[]>([]);
  const [perfRows, setPerfRows] = useState<ChartAthletePerf[]>([]);

  // Avatar (signed URL)
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(undefined);

  // Refs for chart export (same pattern as SportsDetail)
  const prepostChartRef = useRef<HTMLDivElement>(null);
  const performanceChartRef = useRef<HTMLDivElement>(null);

  // Resolve athlete then load bundle (guards added; no UI changes)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = decodeURIComponent(athleteName || "").replace(/\+/g, " ").trim();
        if (!q) return;

        // Try the view first
        let row: ExtendedProfile | null = null;
        {
          const { data, error } = await supabase
            .from("v_profile_lite")
            .select("*")
            .ilike("full_name", `%${q}%`)
            .limit(1)
            .maybeSingle<ExtendedProfile>();
          if (!error && data) row = data;
        }

        // Fallback to base table if needed
        if (!row) {
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .ilike("full_name", `%${q}%`)
            .limit(1)
            .maybeSingle<ExtendedProfile>();
          if (data) row = data;
        }

        if (!row || !alive) return;

        setProfile(row);

        // Prefer user_id; fall back to id (never pass undefined)
        const athleteKey: string | null = row.user_id ?? row.id ?? null;
        if (!athleteKey) return;

        const bundle = await loadAthleteBundle(athleteKey);
        if (!alive) return;

        // 🔧 Merge to preserve `pup_id`/email coming from the view/base table.
        const merged: ExtendedProfile = {
          ...row,
          ...((bundle as { profile?: ExtendedProfile }).profile ?? {}),
        };
        setProfile(merged);

        setPrepostRows(shapeAthletePrePost(bundle.prepost));
        setPerfRows(shapeAthletePerf(bundle.performance));
      } catch {
        // silent fallback to placeholders
      }
    })();
    return () => {
      alive = false;
    };
  }, [athleteName]);

  // Derive a single stable key for avatar fetching to satisfy exhaustive-deps
  const avatarKey = useMemo<string | null>(() => {
    if (!profile) return null;
    return profile.user_id ?? profile.id ?? null;
  }, [profile]);

  // Fetch a signed avatar URL for the resolved profile (no UI changes)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!avatarKey) return;
        const map = await bulkSignedByUserIds([avatarKey], 60 * 60 * 24);
        if (!alive) return;
        if (map && map[avatarKey]) setAvatarSrc(map[avatarKey]);
      } catch {
        /* ignore; fallback to placeholder */
      }
    })();
    return () => {
      alive = false;
    };
  }, [avatarKey]);

  // Fallback adapters for charts
  const prePostData = useMemo(
    () =>
      (prepostRows.length
        ? prepostRows.map((r, i) => ({
            month: String(r.label ?? i + 1),
            pre: r.preTest ?? 0,
            post: r.postTest ?? 0,
          }))
        : months.slice(0, 9).map((m, i) => ({
            month: m,
            pre: [750, 520, 830, 510, 600, 250, 300, 800, 420][i] ?? 500,
            post: [900, 610, 880, 1000, 650, 450, 560, 920, 480][i] ?? 600,
          })) ),
    [prepostRows]
  );

  const performanceData = useMemo(
    () =>
      (perfRows.length
        ? perfRows.map((r) => {
            let label = r.day;
            try {
              const d = new Date(r.day);
              const mm = months[d.getMonth()] ?? r.day;
              label = mm;
            } catch {
              /* keep ISO */
            }
            return {
              month: label,
              agility: r.agility ?? 0,
              strength: r.strength ?? 0,
              power: r.power ?? 0,
              flexibility: 0,
              reactionTime: 0,
              coordination: 0,
            };
          })
        : months.slice(0, 9).map((m, i) => ({
            month: m,
            agility: [500, 600, 700, 800, 650, 720, 660, 705, 690][i] ?? 500,
            strength: [400, 500, 600, 700, 580, 640, 590, 630, 610][i] ?? 400,
            power: [350, 420, 480, 550, 500, 520, 510, 530, 515][i] ?? 350,
            flexibility: [300, 360, 400, 450, 380, 390, 395, 405, 410][i] ?? 300,
            reactionTime: [450, 500, 550, 600, 520, 530, 540, 560, 570][i] ?? 450,
            coordination: [380, 420, 460, 500, 430, 440, 450, 470, 480][i] ?? 380,
          })) ),
    [perfRows]
  );

  // Build export rows like SportsDetail (with athlete metadata) — now using real email + PUP ID
  const athleteFull = profile?.full_name ?? athleteName;
  const athleteEmail = profile?.email ?? profile?.pup_webmail ?? "";
  const athletePUP = profile?.pup_id != null ? String(profile.pup_id) : "";

  const prepostExportRows = useMemo(
    () =>
      prePostData.map((d) => ({
        "Athlete Name": athleteFull,
        "Email": athleteEmail,
        "PUP ID": athletePUP,
        "Pre Test": d.pre,
        "Post Test": d.post,
      })),
    [prePostData, athleteFull, athleteEmail, athletePUP]
  );

  const performanceExportRows = useMemo(
    () =>
      performanceData.map((w) => ({
        "Athlete Name": athleteFull,
        "Email": athleteEmail,
        "PUP ID": athletePUP,
        "Week": String(w.month),
        "Agility": w.agility,
        "Strength": w.strength,
        "Power": w.power,
        "Flexibility": w.flexibility,
        "Reaction Time": w.reactionTime,
        "Coordination": w.coordination,
      })),
    [performanceData, athleteFull, athleteEmail, athletePUP]
  );

  const [showConfirm, setShowConfirm] = useState(false);
  async function handleConfirmDelete() {
    // TODO hook up deletion
    setShowConfirm(false);
  }

  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      {/* Header with sport ribbon */}
      <header className="sticky top-0 z-30 shadow-md">
        <div
          className="flex items-center w-full py-2 px-4"
          style={{ background: `linear-gradient(90deg, ${BRAND.maroon} 0%, #5a0c0c 100%)`, color: "white" }}
        >
          <button
            onClick={() => navigate(`/sports/${encodeURIComponent(sportName)}`)}
            aria-label="Back to Sport"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow hover:scale-110 transition-transform mr-3"
            style={{ color: BRAND.maroon }}
          >
            <ArrowLeftOutlined className="text-lg" />
          </button>

          <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">{sportName}</span>
        </div>
      </header>

      <div className="flex flex-col md:flex-row w-full">
        {/* Left profile column */}
        <aside className="w-full md:w-1/4 p-8 md:min-h-screen" style={{ backgroundColor: BRAND.maroon }}>
          <div className="flex flex-col items-center text-white">
            <div className="w-40 h-40 rounded-full bg-white/20 grid place-items-center mb-6 overflow-hidden">
              <img src={avatarSrc || "/images/coach_photo.jpg"} alt={athleteName} className="w-full h-full object-cover" />
            </div>
            <h2 className="text-xl font-semibold">{athleteName}</h2>
            <p className="text-sm opacity-80 mb-6">{profile?.pup_id ?? ""}</p>
          </div>

          {/* Form card – view-only */}
          <div className="space-y-4">
            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
              {profile?.full_name ?? athleteName}
            </div>

            {/* Use real email from profiles (fall back to pup_webmail, else empty string) */}
            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
              {profile?.email ?? profile?.pup_webmail ?? ""}
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-2 rounded-md bg-white text-gray-900">+63</span>
              <div className="flex-1 rounded-md bg-white px-4 py-2 text-gray-900">
                {(profile?.phone ?? "9123456789").replace(/^\+?63/, "").replace(/^0/, "")}
              </div>
            </div>

            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">{profile?.role ?? "Athlete"}</div>

            <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
              {profile?.birthdate ?? "2024-08-20"}
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <button
              className="w-full rounded-lg bg-white/10 text-white py-2 border border-white/40 hover:bg-white/20"
              onClick={() => setShowConfirm(true)}
            >
              Delete Profile
            </button>
          </div>

          {/* ───── Delete-confirmation modal ───── */}
          {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />

              {/* Modal card */}
              <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 animate-fadeIn">
                <h3 className="text-xl font-bold mb-2 text-center" style={{ color: BRAND.maroon }}>
                  Confirm Delete
                </h3>
                <p className="text-gray-700 text-sm text-center mb-6">
                  Are you sure you want to permanently delete this profile?
                  <br />
                  <span className="text-red-500 font-medium">This action cannot be undone.</span>
                </p>

                <div className="flex justify-center gap-4">
                  <button
                    className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                    onClick={() => setShowConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-5 py-2 rounded-lg text-white shadow-md hover:scale-105 transition"
                    style={{ backgroundColor: BRAND.maroon }}
                    onClick={handleConfirmDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Right charts column */}
        <main className="w-full md:w-3/4 p-8 space-y-8">
          {/* Bar chart: Pre vs Post */}
          <section className="p-6 rounded-2xl shadow-md bg-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Pre-Test vs. Post Test
              </h3>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={() => downloadCsv("pre-vs-post.csv", prepostExportRows)}
                >
                  Export CSV
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = prepostChartRef.current;
                    if (!node) return;
                    await exportChartAsPdf(node, `${slugify(athleteFull)}-prepost-chart.pdf`);
                  }}
                >
                  Export PDF
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = prepostChartRef.current;
                    if (!node) return;
                    await exportPrepostXlsxWithChartForAthlete(slugify(athleteFull), prepostExportRows, node);
                  }}
                >
                  Export XLSX
                </button>
              </div>
            </div>

            <div ref={prepostChartRef}>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prePostData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pre" name="Pre-Test" fill={BRAND.maroon} barSize={40} />
                  <Bar dataKey="post" name="Post Test" fill={BRAND.yellow} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Line chart: Performance Metrics */}
          <section className="p-6 rounded-2xl shadow-md bg-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Performance Metrics
              </h3>
            <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={() => downloadCsv("performance-metrics.csv", performanceExportRows)}
                >
                  Export CSV
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = performanceChartRef.current;
                    if (!node) return;
                    await exportChartAsPdf(node, `${slugify(athleteFull)}-performance-chart.pdf`);
                  }}
                >
                  Export PDF
                </button>
                <button
                  className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                  style={{ color: BRAND.maroon }}
                  onClick={async () => {
                    const node = performanceChartRef.current;
                    if (!node) return;
                    await exportPerformanceXlsxWithChartForAthlete(
                      slugify(athleteFull),
                      performanceExportRows,
                      node
                    );
                  }}
                >
                  Export XLSX
                </button>
              </div>
            </div>

            <div ref={performanceChartRef}>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="agility" stroke="#008000" />
                  <Line type="monotone" dataKey="strength" stroke={BRAND.maroon} />
                  <Line type="monotone" dataKey="power" stroke="#1E90FF" />
                  <Line type="monotone" dataKey="flexibility" stroke="#FF69B4" />
                  <Line type="monotone" dataKey="reactionTime" stroke="#FFA500" />
                  <Line type="monotone" dataKey="coordination" stroke="#800080" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
