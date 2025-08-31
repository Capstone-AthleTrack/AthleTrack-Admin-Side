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

type UsagePoint = { time: string; active: number; visits: number };
const usageData: UsagePoint[] = [
  { time: "11 AM", active: 60, visits: 30 },
  { time: "12 PM", active: 80, visits: 38 },
  { time: "1 PM", active: 65, visits: 36 },
  { time: "2 PM", active: 85, visits: 40 },
  { time: "3 PM", active: 70, visits: 33 },
  { time: "4 PM", active: 92, visits: 37 },
  { time: "5 PM", active: 76, visits: 34 },
  { time: "6 PM", active: 88, visits: 36 },
  { time: "7 PM", active: 73, visits: 32 },
  { time: "8 PM", active: 80, visits: 45 },
  { time: "9 PM", active: 72, visits: 30 },
  { time: "10 PM", active: 75, visits: 48 },
];

type LoginPoint = { date: string; coaches: number; athletes: number };
const loginFreq: LoginPoint[] = [
  { date: "JUNE 16", coaches: 10, athletes: 20 },
  { date: "JUNE 17", coaches: 50, athletes: 65 },
  { date: "JUNE 18", coaches: 70, athletes: 90 },
  { date: "JUNE 19", coaches: 65, athletes: 70 },
  { date: "JUNE 20", coaches: 85, athletes: 95 },
  { date: "JUNE 21", coaches: 15, athletes: 85 },
  { date: "JUNE 22", coaches: 12, athletes: 90 },
];


export default function Dashboard() {
  const tabItems: TabsProps["items"] = [
    { key: "Daily", label: <span className="text-base">Daily</span> },
    { key: "Weekly", label: <span className="text-base">Weekly</span> },
    { key: "Monthly", label: <span className="text-base">Monthly</span> },
  ];

  return (
    <div
      className="min-h-screen w-full flex flex-col text-[#111]"
      style={{
        background: BRAND.maroon,
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      }}
    >
      <Navbar/>
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
                  <Button size="large" className="!px-5 !h-8 text-base">
                    Export CSV
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-4 gap-6 mb-6">
                <KPI label="Total Users" value="160" delta="+0.09%" />
                <KPI label="App Visits" value="1,154" delta="+0.07%" />
                <KPI label="New Users" value="56" delta="+0.05%" />
                <KPI label="Active Users" value="17" delta="+0.03%" />
              </div>

              <div className="h-[28rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={usageData}>
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
                <Button size="large" className="!px-5 !h-8 text-base">
                  Export CSV
                </Button>
              }
            >
              <div className="h-[35rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={loginFreq}>
                    <XAxis dataKey="date" tick={{ fontSize: 14 }} />
                    <YAxis tick={{ fontSize: 14 }} />
                    <Tooltip />
                    <Legend formatter={(v) => <span style={{ fontSize: "14px" }}>{v}</span>} />
                    <Line
                      type="monotone"
                      dataKey="coaches"
                      stroke="#ff7aa2"
                      strokeWidth={2}
                      dot
                      name="Coaches"
                    />
                    <Line
                      type="monotone"
                      dataKey="athletes"
                      stroke="#8ad0ff"
                      strokeWidth={2}
                      dot
                      name="Athletes"
                    />
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
