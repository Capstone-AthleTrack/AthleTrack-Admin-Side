import { useMemo, useState, useEffect } from "react"; 
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
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
} from "@/services/sports";
import supabase from "@/core/supabase";

const months = ["JAN","FEB","MAR","APR","MAY","JUNE","JULY","AUG","SEP","OCT","NOV","DEC"];

interface Row {
  [key: string]: string | number; 
}

function csvDownload(filename: string, rows: Row[]) {
  const header = Object.keys(rows[0] ?? {}).join(",");
  const body = rows.map(r => Object.values(r).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AthleteDetail() {
  const navigate = useNavigate();
  const { sportName = "", athleteName = "" } = useParams<{ sportName?: string; athleteName?: string }>();

  // ── Live data state
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [prepostRows, setPrepostRows] = useState<ChartAthletePrePost[]>([]);
  const [perfRows, setPerfRows] = useState<ChartAthletePerf[]>([]);

  // Resolve athlete by name, then load bundle by user_id
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resolved = await supabase
          .from("v_profile_lite")
          .select("*")
          .ilike("full_name", athleteName)
          .limit(1)
          .returns<ProfileLite[]>();

        const row = resolved.data?.[0] ?? null;
        if (!row) return;

        if (!alive) return;
        setProfile(row);

        const bundle = await loadAthleteBundle(row.user_id);
        if (!alive) return;

        setProfile(bundle.profile ?? row);
        setPrepostRows(shapeAthletePrePost(bundle.prepost));
        setPerfRows(shapeAthletePerf(bundle.performance));
      } catch {
        // keep placeholders if lookup fails
      }
    })();
    return () => { alive = false; };
  }, [athleteName]);

  // sample data per athlete (months) — fallback if live data empty
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
            pre: [750,520,830,510,600,250,300,800,420][i] ?? 500,
            post: [900,610,880,1000,650,450,560,920,480][i] ?? 600,
          }))),
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
              // keep ISO if parsing fails
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
            agility: [500,600,700,800,650,720,660,705,690][i] ?? 500,
            strength: [400,500,600,700,580,640,590,630,610][i] ?? 400,
            power: [350,420,480,550,500,520,510,530,515][i] ?? 350,
            flexibility: [300,360,400,450,380,390,395,405,410][i] ?? 300,
            reactionTime: [450,500,550,600,520,530,540,560,570][i] ?? 450,
            coordination: [380,420,460,500,430,440,450,470,480][i] ?? 380,
          }))),
    [perfRows]
  );

  const [showConfirm, setShowConfirm] = useState(false);
  async function handleConfirmDelete() {
  // TODO: call your API to delete the athlete here

  setShowConfirm(false);
  // navigate(`/sports/${encodeURIComponent(sportName)}`);
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

          <span className="text-lg sm:text-xl font-bold tracking-wide uppercase">
            {sportName}
          </span>
        </div>
      </header>

      <div className="flex flex-col md:flex-row w-full">
        {/* Left profile column */}
        <aside
          className="w-full md:w-1/4 p-8 md:min-h-screen"
          style={{ backgroundColor: BRAND.maroon }}
        >
          <div className="flex flex-col items-center text-white">
            <div className="w-40 h-40 rounded-full bg-white/20 grid place-items-center mb-6 overflow-hidden">
                <img
                    src="/images/coach_photo.jpg" 
                    alt={athleteName}
                    className="w-full h-full object-cover"
                />
            </div>
            <h2 className="text-xl font-semibold">{athleteName}</h2>
            <p className="text-sm opacity-80">PUP ID Number</p>
            <p className="text-sm opacity-80 mb-6">{profile?.pup_id ?? ""}</p>
          </div>

            {/* Form card – view-only */}
            <div className="space-y-4">

              <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
                {profile?.full_name ?? athleteName}
                {/* <input type="hidden" name="name" value={athleteName} /> */}
              </div>

              <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
                {profile?.pup_webmail ?? "athlete@email.com"}
                {/* <input type="hidden" name="email" value="athlete@email.com" /> */}
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-2 rounded-md bg-white text-gray-900">+63</span>
                <div className="flex-1 rounded-md bg-white px-4 py-2 text-gray-900">
                  {(profile?.phone ?? "9123456789").replace(/^\+?63/, "").replace(/^0/, "")}
                  {/* <input type="hidden" name="phone" value="9123456789" /> */}
                </div>
              </div>

              <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
                {profile?.role ?? "Athlete"}
                {/* <input type="hidden" name="role" value="Athlete" /> */}
              </div>

              <div className="w-full rounded-md bg-white px-4 py-2 text-gray-900">
                {profile?.birthdate ?? "2024-08-20"}
                {/* <input type="hidden" name="registered_at" value="2024-08-20" /> */}
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
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={() => setShowConfirm(false)}
                />

                {/* Modal card */}
                <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 animate-fadeIn">
                  {/* Header */}
                  <h3
                    className="text-xl font-bold mb-2 text-center"
                    style={{ color: BRAND.maroon }}
                  >
                    Confirm Delete
                  </h3>
                  <p className="text-gray-700 text-sm text-center mb-6">
                    Are you sure you want to permanently delete this profile?
                    <br />
                    <span className="text-red-500 font-medium">
                      This action cannot be undone.
                    </span>
                  </p>

                  {/* Actions */}
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
              <button
                className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                style={{ color: BRAND.maroon }}
                onClick={() => csvDownload("pre-vs-post.csv", prePostData)}
              >
                Export CSV
              </button>
            </div>

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
          </section>

          {/* Line chart: Performance Metrics */}
          <section className="p-6 rounded-2xl shadow-md bg-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Performance Metrics
              </h3>
              <button
                className="px-4 py-2 rounded-lg border bg-white border-gray-300"
                style={{ color: BRAND.maroon }}
                onClick={() => csvDownload("performance-metrics.csv", performanceData)}
              >
                Export CSV
              </button>
            </div>

            <ResponsiveContainer width="100%" height={400}>
            <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
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
          </section>
        </main>
      </div>
    </div>
  );
}
