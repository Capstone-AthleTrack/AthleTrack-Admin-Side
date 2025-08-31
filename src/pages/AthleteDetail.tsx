import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { ArrowLeftOutlined } from "@ant-design/icons";
import NavBar from "@/components/NavBar";
import { BRAND } from "@/brand";
import sportDetails from "./SportsDetail";

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

  // sample data per athlete (months)
  const prePostData = useMemo(
    () =>
      months.slice(0, 9).map((m, i) => ({
        month: m,
        pre: [750,520,830,510,600,250,300,800,420][i] ?? 500,
        post: [900,610,880,1000,650,450,560,920,480][i] ?? 600,
      })),
    []
  );

  const performanceData = useMemo(
    () =>
      months.slice(0, 9).map((m, i) => ({
        month: m,
        score: [1000,200,560,260,410,970,260,990,450][i] ?? 300,
      })),
    []
  );

  const key = sportName.replace(/\s+/g, "").replace(/-/g, "");
  const sport = sportDetails[key as keyof typeof sportDetails];
  const [isEditing, setIsEditing] = useState(false);
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
            <p className="text-sm opacity-80 mb-6">{sport ? Object.keys(sportDetails).find(k => k === key) : ""}</p>
          </div>

            {/* Form card */}
            <div className="space-y-4">
            <input
                className="w-full rounded-md px-4 py-2 bg-white text-gray-900"
                placeholder="Name"
                defaultValue={athleteName}
                readOnly={!isEditing}
            />
            <input
                className="w-full rounded-md px-4 py-2 bg-white text-gray-900"
                placeholder="Email Address"
                defaultValue="athlete@email.com"
                readOnly={!isEditing}
            />
            <div className="flex items-center gap-2">
                <span className="px-3 py-2 rounded-md bg-white text-gray-900">+63</span>
                <input
                className="flex-1 rounded-md px-4 py-2 bg-white text-gray-900"
                placeholder="Phone number"
                defaultValue="9123456789"
                readOnly={!isEditing}
                />
            </div>
            <div className="relative">
                <select
                className="w-full rounded-md px-4 py-2 bg-white text-gray-900"
                disabled={!isEditing}
                defaultValue="Athlete"
                >
                <option>Athlete</option>
                <option>Coach</option>
                </select>
            </div>
            <input
                className="w-full rounded-md px-4 py-2 bg-white text-gray-900"
                placeholder="Registration Date"
                defaultValue="2024-08-20"
                readOnly={!isEditing}
            />
            </div>

            <div className="flex flex-col gap-3 mt-6">
            <button
                className="w-full rounded-lg bg-white/10 text-white py-2 border border-white/40 hover:bg-white/20"
                onClick={() => setShowConfirm(true)}
            >
                Delete Profile
            </button>
            <button
                className="w-full rounded-lg bg-white text-[#{BRAND.maroon}] py-2"
                style={{ color: BRAND.maroon }}
                onClick={() => setIsEditing(!isEditing)}
            >
                {isEditing ? "Save Profile" : "Edit Profile"}
            </button>
            </div>

            {/* Confirmation modal */}
            {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop */}
                <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
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
                    Are you sure you want to permanently delete this athlete’s profile?
                    <br />
                    <span className="text-red-500 font-medium">This action cannot be undone.</span>
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
