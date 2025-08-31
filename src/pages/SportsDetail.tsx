import { useRef } from "react";
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

// --- Helper: map display name 
const toSportKey = (name: string) =>
  name.replace(/\s+/g, "").replace(/-/g, "");

// optional: default placeholder if a coach has no image
const COACH_PLACEHOLDER = "/images/coach_photo.jpg";

// --- Sports details object 
const sportDetails = {
  Basketball: {
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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
    coaches: ["Head Coach", "Assistant Coach 1", "Assistant Coach 2"],
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

export default function SportDetail() {
  const { sportName = "" } = useParams<{ sportName?: string }>();
  const navigate = useNavigate();

  // Convert display name from URL to object key
  const key = toSportKey(sportName);
  const sport = sportDetails[key as keyof typeof sportDetails];

  // coaches scroller ref
  const coachesScrollRef = useRef<HTMLDivElement>(null);
  const scrollRight = () => coachesScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" });

  if (!sport) {
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
              {(
                // normalize: accept ["Head Coach", ...] OR [{name, image}, ...]
                (sport.coaches as unknown as Array<string | { name: string; image?: string }>)
              ).map((c, idx) => {
                const coach =
                  typeof c === "string" ? { name: c, image: COACH_PLACEHOLDER } : c;

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
            {sport.athletes.map((athlete, idx) => (
              <button
                key={idx}
                onClick={() =>
                  navigate(`/sports/${encodeURIComponent(sportName)}/athletes/${encodeURIComponent(athlete)}`)
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
                  <span>{athlete}</span>
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
              >
                Export CSV
              </button>
            </div>

            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={[...sport.chartData]}>
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

          {/* Performance Metrics */}
          <div className="p-6 rounded-2xl shadow-md" style={{ backgroundColor: "#FFFFFF" }}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold" style={{ color: BRAND.maroon }}>
                Performance Metrics
              </h3>
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
              >
                Export CSV
              </button>
            </div>

            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={[...sport.performanceData]}>
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
  );
}
