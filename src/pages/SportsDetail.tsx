import { useRef, useEffect, useMemo, useState } from "react";   
import { useParams, useNavigate, Link } from "react-router-dom";
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
import { ArrowLeftOutlined, LeftOutlined, RightOutlined, UserOutlined } from "@ant-design/icons";
import NavBar from "@/components/NavBar";
import { BRAND } from "@/brand";

/* ── Live data helpers (Supabase views) ───────────────────────────────────── */
import {
  loadSportBundle,
  type VCoach,
  type VAthleteLite,
  type ChartPrePostBar,
  type ChartPerfLine,
  shapePrePostBars,
  shapePerfLines,
  downloadCsv,
} from "@/services/sports";

/* ── Team-gender aware services (DB RPCs; NO UI changes) ─────────────────── */
import {
  getAllowedTeamsForSport,
  listProfilesBySportTeam,
  type SportCode,
  type TeamGender,
  type ProfileRow,
} from "@/services/sportsDetail";

/* ── Avatars (signed URLs; NO UI changes) ────────────────────────────────── */
import { bulkSignedByUserIds } from "@/services/avatars";

/* ── New: export helpers for chart → PNG/PDF/XLSX (no styling changes) ───── */
import { toPng } from "html-to-image";
import { saveAs } from "file-saver";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

/* ── Helper: map display name (legacy for local object keys) ─────────────── */
const toSportKey = (name: string) =>
  name.replace(/\s+/g, "").replace(/-/g, "");

/* ── Slugify to match DB view `sport_slug` ───────────────────────────────── */
const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* ── Map route/display to canonical DB sport code (text) ─────────────────── */
const canonicalSport = (name: string): SportCode | null => {
  const sl = slugify(name);
  if (sl === "basketball") return "basketball";
  if (sl === "baseball") return "baseball";
  if (sl === "softball") return "softball";
  if (sl === "volleyball") return "volleyball";
  if (sl === "beach-volleyball") return "beach volleyball";
  if (sl === "football") return "football";
  if (sl === "futsal") return "futsal";
  if (sl === "sepak-takraw" || sl === "sepaktakraw") return "sepak-takraw";
  return null;
};

/* ── Normalize ?team=… from URL without changing routes ──────────────────── */
const parseTeamFromQuery = (): TeamGender | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("team") || "").toLowerCase().trim();
    if (raw === "men" || raw === "mens" || raw === "men's" || raw === "m") return "men's";
    if (raw === "women" || raw === "womens" || raw === "women's" || raw === "w") return "women's";
  } catch {
    /* ignore */
  }
  return null;
};

/* Keep URL query in sync with selected team (no layout changes) */
const setTeamQuery = (navigate: ReturnType<typeof useNavigate>, t: TeamGender | null) => {
  try {
    const url = new URL(window.location.href);
    if (t) url.searchParams.set("team", t);
    else url.searchParams.delete("team");
    navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
  } catch {
    /* ignore */
  }
};

/* ── default placeholder  ────────────────────────────────────────────────── */
const COACH_PLACEHOLDER = "/images/coach_photo.jpg";

/* ── Sports details object (kept as fallback; UI/styling unchanged) ──────── */
const sportDetails = {
  Basketball: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
  Baseball: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
  Volleyball: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
  BeachVolleyball: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
  Football: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
  Softball: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
  Futsal: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
  SepakTakraw: {
    coaches: ["Coach", "Coach", "Coach"],
    athletes: ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5", "Athlete 6"],
    chartData: [
      { name: "Athlete 1", preTest: 750, postTest: 900 },
      { name: "Athlete 2", preTest: 250, postTest: 550 },
      { name: "Athlete 3", preTest: 800, postTest: 600 },
      { name: "Athlete 4", preTest: 500, postTest: 1000 },
      { name: "Athlete 5", preTest: 400, postTest: 850 },
      { name: "Athlete 6", preTest: 900, postTest: 700 },
    ],
    performanceData: [
      { name: "Week 1", agility: 500, strength: 400, power: 350, flexibility: 300, reactionTime: 450, coordination: 380 },
      { name: "Week 2", agility: 600, strength: 500, power: 420, flexibility: 360, reactionTime: 500, coordination: 420 },
      { name: "Week 3", agility: 700, strength: 600, power: 480, flexibility: 400, reactionTime: 550, coordination: 460 },
      { name: "Week 4", agility: 800, strength: 700, power: 550, flexibility: 450, reactionTime: 600, coordination: 500 },
    ],
  },
} as const;

type CoachItem = string | { name: string; image?: string };

/* ── Export helpers (pure functions; no UI changes) ──────────────────────── */
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

async function exportPrepostXlsxWithChart(
  sportSlug: string,
  rows: Array<{
    "Athlete Name": string;
    Email: string;
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
    { header: "Email",        key: "email", width: 36 },
    { header: "PUP ID",       key: "pup",   width: 18 },
    { header: "Pre Test",     key: "pre",   width: 12 },
    { header: "Post Test",    key: "post",  width: 12 },
  ];

  rows.forEach(r =>
    ws.addRow({
      name: r["Athlete Name"],
      email: r.Email,
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
  saveAs(new Blob([buf]), `${sportSlug}-prepost-with-chart.xlsx`);
}

/* Added: XLSX export for Performance Metrics (table + chart) with athlete metadata */
async function exportPerformanceXlsxWithChart(
  sportSlug: string,
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
    { header: "Athlete Name",  key: "athlete",     width: 28 },
    { header: "Email",         key: "email",       width: 36 },
    { header: "PUP ID",        key: "pupid",       width: 18 },
    { header: "Week",          key: "week",        width: 14 },
    { header: "Agility",       key: "agility",     width: 12 },
    { header: "Strength",      key: "strength",    width: 12 },
    { header: "Power",         key: "power",       width: 12 },
    { header: "Flexibility",   key: "flexibility", width: 12 },
    { header: "Reaction Time", key: "reaction",    width: 16 },
    { header: "Coordination",  key: "coordination",width: 14 },
  ];

  rows.forEach(r =>
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
  saveAs(new Blob([buf]), `${sportSlug}-performance-with-chart.xlsx`);
}

export default function SportDetail() {
  const { sportName = "" } = useParams<{ sportName?: string }>();
  const navigate = useNavigate();

  /* Convert display name from URL to object key (for fallback) */
  const key = toSportKey(sportName);
  const sport = sportDetails[key as keyof typeof sportDetails];

  /* coaches scroller ref */
  const coachesScrollRef = useRef<HTMLDivElement>(null);
  const scrollRight = () => coachesScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" });

  /* chart wrapper ref for exporting chart as image/PDF/XLSX */
  const prepostChartRef = useRef<HTMLDivElement>(null);
  /* Added: ref for Performance chart */
  const performanceChartRef = useRef<HTMLDivElement>(null);

  /* ── Live data state ───────────────────────────────────────────────────── */
  const [coaches, setCoaches] = useState<VCoach[]>([]);
  const [athletes, setAthletes] = useState<VAthleteLite[]>([]);
  const [prepost, setPrepost] = useState<ChartPrePostBar[]>([]);
  const [performance, setPerformance] = useState<ChartPerfLine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  /* ── Team-aware state ──────────────────────────────────────────────────── */
  const [teamOptions, setTeamOptions] = useState<TeamGender[]>([]);
  const [team, setTeam] = useState<TeamGender | null>(null);

  /* ── Signed avatar URLs (coaches/athletes) ─────────────────────────────── */
  const [avatarById, setAvatarById] = useState<Record<string, string>>({});
  async function refreshAvatars(ids: string[]) {
    if (!ids?.length) return;
    try {
      const urls = await bulkSignedByUserIds(ids, 60 * 60 * 24);
      if (Object.keys(urls).length) {
        setAvatarById((prev) => ({ ...prev, ...urls })); 
      }
    } catch {
      /* ignore; placeholders stay */
    }
  }

  /* Keep URL synced to team change (so refresh/deep-link works) */
  useEffect(() => {
    setTeamQuery(navigate, team);
  }, [team, navigate]);

  /* Use teamOptions to validate the selected team silently */
  const effectiveTeam = useMemo<TeamGender | null>(() => {
    if (!team) return null;
    if (!teamOptions.length) return team;
    return teamOptions.includes(team) ? team : (teamOptions[0] ?? team);
  }, [team, teamOptions]);

  /* Resolve canonical DB sport & allowed teams */
  useEffect(() => {
    let alive = true;
    (async () => {
      const canon = canonicalSport(sportName);
      if (!canon) {
        setTeamOptions([]);
        setTeam(null);
        return;
      }
      try {
        const opts = await getAllowedTeamsForSport(canon);
        if (!alive) return;

        setTeamOptions(opts);
        const fromUrl = parseTeamFromQuery();
        const initial = (fromUrl && opts.includes(fromUrl)) ? fromUrl : (opts[0] ?? null);
        setTeam(initial ?? null);
      } catch {
        // silently ignore; fallback to default null -> static data
      }
    })();
    return () => {
      alive = false;
    };
  }, [sportName]);

  /* Fetch live bundle for this sport + roster filtered by team (if present) */
  useEffect(() => {
    let alive = true;
    const slug = slugify(sportName);
    const canon = canonicalSport(sportName);

    (async () => {
      try {
        setLoading(true);
        const bundle = await loadSportBundle(slug);

        // Default: use bundle athletes/coaches (legacy)
        let nextCoaches: VCoach[] = bundle.coaches;
        let nextAthletes: VAthleteLite[] = bundle.athletes;

        // If we have a team selected and canonical sport, override roster via RPC
        if (canon && effectiveTeam) {
          const roster = await listProfilesBySportTeam({
            sport: canon,
            team: effectiveTeam,
            search: "",
            page: 1,
            pageSize: 500,
          });

          const coachRows = (roster as ProfileRow[]).filter(r => (r.role || "").toLowerCase() === "coach");
          const athleteRows = (roster as ProfileRow[]).filter(r => (r.role || "").toLowerCase() === "athlete");

          // Try to preserve rich athlete fields by matching roster emails to bundle athletes
          const rosterEmails = new Set(
            athleteRows
              .map(r => (r.email ?? "").toLowerCase())
              .filter((e): e is string => !!e)
          );

          let filteredAthletes = bundle.athletes.filter(a => {
            const em = (a.pup_webmail ?? "").toLowerCase();
            return !!em && rosterEmails.has(em);
          });

          // Fallback: match by full name when email is not available
          if (filteredAthletes.length === 0 && athleteRows.length > 0) {
            const rosterNames = new Set(
              athleteRows.map(r => (r.full_name || "").toLowerCase()).filter(Boolean)
            );
            filteredAthletes = bundle.athletes.filter(a => {
              const nm = (a.full_name || "").toLowerCase();
              return !!nm && rosterNames.has(nm);
            });
          }

          if (filteredAthletes.length > 0) {
            nextAthletes = filteredAthletes;
          } else {
            // Minimal shapes as a last resort (UI-safe)
            nextAthletes = athleteRows.map((r) => ({ id: r.id, full_name: r.full_name || "Athlete" } as unknown as VAthleteLite));
          }

          // Coaches list only needs names for the current UI
          nextCoaches = coachRows.map((r) => ({ id: r.id, full_name: r.full_name || "Coach" } as unknown as VCoach));

          // Sign avatars for visible roster (coaches + athletes)
          const toSign = [
            ...coachRows.map((r) => String(r.id)).filter(Boolean),
            ...athleteRows.map((r) => String(r.id)).filter(Boolean),
          ];
          await refreshAvatars(toSign);
        }

        if (!alive) return;

        setCoaches(nextCoaches);
        setAthletes(nextAthletes);

        // Charts: use team-filtered athlete list for pre/post mapping
        setPrepost(shapePrePostBars(bundle.prepost, nextAthletes));
        setPerformance(shapePerfLines(bundle.performance));
      } catch {
        // fall back to static if live fetch fails
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sportName, effectiveTeam]);

  /* Recharts adapters (keep your original data keys/UI) */
  const prepostDisplay = useMemo(() => {
    const base = prepost.length
      ? prepost.map((p) => ({ name: p.label, preTest: p.preTest, postTest: p.postTest }))
      : [...(sport?.chartData ?? [])];
    return base;
  }, [prepost, sport]);

  // Build enriched CSV rows for Pre vs Post export
  const prepostExportRows = useMemo(() => {
    const indexByLabel = new Map(
      prepost.map((p) => [String(p.label).toLowerCase(), p])
    );

    // If we have athlete objects, include metadata; otherwise fall back to plain series
    if (athletes.length) {
      return athletes.map((a) => {
        const name = (a.full_name || "") as string;
        const key = name.toLowerCase();
        const row = indexByLabel.get(key);
        const email = (a.pup_webmail ?? "");
        const pupId = a.pup_id != null ? String(a.pup_id) : "";
        return {
          "Athlete Name": name,
          "Email": email,
          "PUP ID": pupId,
          "Pre Test": row?.preTest ?? "",
          "Post Test": row?.postTest ?? "",
        };
      });
    }

    // No athlete metadata available (static fallback)
    return prepost.map((p) => ({
      "Athlete Name": p.label,
      "Email": "",
      "PUP ID": "",
      "Pre Test": p.preTest,
      "Post Test": p.postTest,
    }));
  }, [athletes, prepost]);

  // Your existing legend expects agility/strength/power/flexibility/reactionTime/coordination.
  // Live DB provides agility/power/strength (+ optional stamina/average). Keep others as 0 to preserve UI.
  const performanceDisplay = useMemo(() => {
    if (performance.length) {
      return performance.map((r) => ({
        name: r.week,
        agility: r.agility,
        strength: r.strength,
        power: r.power,
        flexibility: 0,
        reactionTime: 0,
        coordination: 0,
      }));
    }
    return [...(sport?.performanceData ?? [])];
  }, [performance, sport]);

  /* Build enriched CSV/XLSX rows for Performance export (athlete metadata first) */
  const performanceExportRows = useMemo(() => {
    if (athletes.length) {
      return athletes.flatMap((a) => {
        const name = (a.full_name || "") as string;
        const email = a.pup_webmail ?? "";
        const pupId = a.pup_id != null ? String(a.pup_id) : "";
        return performanceDisplay.map((w) => ({
          "Athlete Name": name,
          "Email": email,
          "PUP ID": pupId,
          "Week": w.name,
          "Agility": w.agility,
          "Strength": w.strength,
          "Power": w.power,
          "Flexibility": w.flexibility,
          "Reaction Time": w.reactionTime,
          "Coordination": w.coordination,
        }));
      });
    }
    // No athlete metadata available — keep fields but leave them blank
    return performanceDisplay.map((w) => ({
      "Athlete Name": "",
      "Email": "",
      "PUP ID": "",
      "Week": w.name,
      "Agility": w.agility,
      "Strength": w.strength,
      "Power": w.power,
      "Flexibility": w.flexibility,
      "Reaction Time": w.reactionTime,
      "Coordination": w.coordination,
    }));
  }, [athletes, performanceDisplay]);

  /* Fallback lists to preserve UI if live arrays are empty */
  const coachesToRender = useMemo<CoachItem[]>(() => {
    // Build the base list (live > fallback)
    let items: { name: string; image?: string }[] = [];
    if (coaches.length) {
      items = coaches.map((c) => {
        const id = (c as unknown as { id?: string }).id;
        const src = id ? avatarById[id] : undefined;
        return { name: c.full_name || "Coach", image: src || COACH_PLACEHOLDER };
      });
    } else {
      const raw = Array.from((sport?.coaches ?? []) as ReadonlyArray<CoachItem>);
      items = raw.map((x) =>
        typeof x === "string" ? { name: x, image: COACH_PLACEHOLDER } : { name: x.name, image: x.image || COACH_PLACEHOLDER }
      );
    }

    // ✅ Flexible placeholders: ensure a minimum tile count but never hide real coaches
    const minTiles = Math.max(3, (sport?.coaches?.length ?? 0));
    while (items.length < minTiles) {
      items.push({ name: "Coach", image: COACH_PLACEHOLDER });
    }
    return items;
  }, [coaches, sport, avatarById]);

  const athletesToRender = useMemo(() => {
    if (athletes.length) return athletes.map((a) => a.full_name || "Athlete");
    return sport?.athletes ?? [];
  }, [athletes, sport]);

  if (!sport && !prepost.length && !performance.length && !coaches.length && !athletes.length && !loading) {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <div className="max-w-3xl mx-auto p-8">
          <h2 className="text-2xl font-semibold mb-4">Sport not found or unavailable.</h2>
          <Link to="/sports" className="text-blue-600 underline">
            Back to Sports
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      {/* Sport Header */}
      <header className="sticky top-0 z-30 shadow-md">
        <div
          className="flex items-center w-full py-2 px-4"
          style={{
            background: `linear-gradient(90deg, ${BRAND.maroon} 0%, #5a0c0c 100%)`,
            color: "white",
          }}
        >
          {/* Back Button + Sport Name */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/sports")}
              aria-label="Back to Sports"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow hover:scale-110 transition-transform flex-shrink-0"
              style={{ color: BRAND.maroon }}
            >
              <ArrowLeftOutlined className="text-lg" />
            </button>

            <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">
              {sportName}
            </span>
          </div>

          {/* Team dropdown (added; minimal, consistent styling) */}
          {teamOptions.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
                Team
              </span>
              <select
                value={team ?? ""}
                onChange={(e) => setTeam((e.target.value as TeamGender) || null)}
                className="rounded-full"
                style={{
                  backgroundColor: "#FFFFFF",
                  color: BRAND.maroon,
                  border: "1px solid #E5E7EB",
                  padding: "4px 10px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {teamOptions.map((t) => (
                  <option key={t} value={t}>
                    {t === "men's" ? "Men's" : "Women's"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col md:flex-row w-full">
        {/* Sidebar */}
        <div
          className="w-full md:w-1/4 text-white p-6 md:min-h-screen rounded-tr-2xl"
          style={{ backgroundColor: BRAND.maroon }}
        >
          
          {/* Coaches panel */}
          <div className="relative rounded-2xl bg-white p-4 shadow">
            <h4 className="text-black text-lg font-semibold mb-3">Coaches</h4>

            <div
              ref={coachesScrollRef}
              className="flex gap-4 overflow-x-auto pr-10 pb-1"
              style={{ scrollbarWidth: "none" } as React.CSSProperties}
            >
              {coachesToRender.map((c, idx) => {
                const coach = typeof c === "string" ? { name: c, image: COACH_PLACEHOLDER } : { name: c.name, image: c.image || COACH_PLACEHOLDER };
                return (
                  <div
                    key={idx}
                    className="relative w-[150px] h-[180px] rounded-xl overflow-hidden shadow-md flex-shrink-0"
                  >
                    {/* Photo */}
                    <img
                      src={coach.image || COACH_PLACEHOLDER}
                      alt={coach.name}
                      className="w-full h-full object-cover"
                    />

                    {/* Name overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-black/0">
                      <p className="text-white text-sm font-semibold text-center leading-tight">
                        {coach.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* left chevron */}
            <button
              onClick={() =>
                coachesScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })
              }
              aria-label="Scroll left"
              className="absolute left-3 top-1/2 -translate-y-1/2 grid place-items-center w-8 h-8 rounded-full border shadow hover:scale-105 transition"
              style={{ background: "#FFFFFF", color: BRAND.maroon, borderColor: "#E5E7EB" }}
            >
              <LeftOutlined className="text-[12px]" />
            </button>
            
            {/* right chevron */}
            <button
              onClick={scrollRight}
              aria-label="Scroll coaches"
              className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center w-8 h-8 rounded-full border shadow hover:scale-105 transition"
              style={{ background: "#FFFFFF", color: BRAND.maroon, borderColor: "#E5E7EB" }}
            >
              <RightOutlined className="text-[12px]" />
            </button>
          </div>


          {/* Athletes list */}
          <h3 className="text-lg font-semibold mt-6 mb-3" style={{ color: "#FFFFFF" }}>
            List of Athletes
          </h3>
          <div className="space-y-3">
            {athletesToRender.map((athlete, idx) => (
              <button
                key={idx}
                onClick={() =>
                  navigate(`/sports/${encodeURIComponent(sportName)}/athletes/${encodeURIComponent(typeof athlete === "string" ? athlete : String(athlete))}`)
                }
                className="w-full text-left flex justify-between items-center rounded-xl py-3 px-4 shadow cursor-pointer transition hover:scale-[1.02] bg-white text-gray-900"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid place-items-center w-8 h-8 rounded-full border"
                    style={{ borderColor: BRAND.maroon, color: BRAND.maroon }}
                  >
                    <UserOutlined />
                  </span>
                  <span>{typeof athlete === "string" ? athlete : String(athlete)}</span>
                </div>
                <span className="font-bold" style={{ color: BRAND.maroon }}>
                  &gt;
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full md:w-3/4 p-8 space-y-8">
          {/* Pre vs Post Test */}
          <div className="p-6 rounded-2xl shadow-md" style={{ backgroundColor: "#FFFFFF" }}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Pre-Test vs. Post Test
              </h3>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border transition"
                  style={{
                    backgroundColor: "white",
                    borderColor: "#D1D5DB",
                    color: BRAND.maroon,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.maroon;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#D1D5DB";
                  }}
                  onClick={() => downloadCsv("prepost_overview.csv", prepostExportRows)}
                >
                  Export CSV
                </button>
                {/* Added: Export PDF (chart image) */}
                <button
                  className="px-4 py-2 rounded-lg border transition"
                  style={{
                    backgroundColor: "white",
                    borderColor: "#D1D5DB",
                    color: BRAND.maroon,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.maroon;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#D1D5DB";
                  }}
                  onClick={async () => {
                    const node = prepostChartRef.current;
                    if (!node) return;
                    await exportChartAsPdf(node, `${slugify(sportName)}-prepost-chart.pdf`);
                  }}
                >
                  Export PDF
                </button>
                {/* Added: Export XLSX (table + chart) */}
                <button
                  className="px-4 py-2 rounded-lg border transition"
                  style={{
                    backgroundColor: "white",
                    borderColor: "#D1D5DB",
                    color: BRAND.maroon,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.maroon;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#D1D5DB";
                  }}
                  onClick={async () => {
                    const node = prepostChartRef.current;
                    if (!node) return;
                    await exportPrepostXlsxWithChart(
                      slugify(sportName),
                      prepostExportRows,
                      node
                    );
                  }}
                >
                  Export XLSX
                </button>
              </div>
            </div>

            <div ref={prepostChartRef}>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prepostDisplay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="preTest" fill={BRAND.maroon} barSize={40} />
                  <Bar dataKey="postTest" fill={BRAND.yellow} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="p-6 rounded-2xl shadow-md" style={{ backgroundColor: "#FFFFFF" }}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Performance Metrics
              </h3>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border transition"
                  style={{
                    backgroundColor: "white",
                    borderColor: "#D1D5DB",
                    color: BRAND.maroon,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.maroon;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#D1D5DB";
                  }}
                  onClick={() => downloadCsv("performance_overview.csv", performanceExportRows)}
                >
                  Export CSV
                </button>
                {/* Added: Export PDF for Performance chart */}
                <button
                  className="px-4 py-2 rounded-lg border transition"
                  style={{
                    backgroundColor: "white",
                    borderColor: "#D1D5DB",
                    color: BRAND.maroon,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.maroon;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#D1D5DB";
                  }}
                  onClick={async () => {
                    const node = performanceChartRef.current;
                    if (!node) return;
                    await exportChartAsPdf(node, `${slugify(sportName)}-performance-chart.pdf`);
                  }}
                >
                  Export PDF
                </button>
                {/* Added: Export XLSX (table + chart) for Performance */}
                <button
                  className="px-4 py-2 rounded-lg border transition"
                  style={{
                    backgroundColor: "white",
                    borderColor: "#D1D5DB",
                    color: BRAND.maroon,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.maroon;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#D1D5DB";
                  }}
                  onClick={async () => {
                    const node = performanceChartRef.current;
                    if (!node) return;
                    await exportPerformanceXlsxWithChart(
                      slugify(sportName),
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
                <LineChart data={performanceDisplay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />

                  {/* Metrics */}
                  <Line type="monotone" dataKey="agility" stroke="#008000" />        {/* green */}
                  <Line type="monotone" dataKey="strength" stroke={BRAND.maroon} />  {/* maroon */}
                  <Line type="monotone" dataKey="power" stroke="#1E90FF" />          {/* blue */}
                  <Line type="monotone" dataKey="flexibility" stroke="#FF69B4" />    {/* pink */}
                  <Line type="monotone" dataKey="reactionTime" stroke="#FFA500" />   {/* orange */}
                  <Line type="monotone" dataKey="coordination" stroke="#800080" />   {/* purple */}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
