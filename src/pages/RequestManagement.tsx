import { useEffect, useMemo, useState } from "react";
import { Input, Select, Button, Empty, Avatar, Tag, message } from "antd";
import { UserOutlined, SearchOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import clsx from "clsx";
import NavBar from "@/components/NavBar";

/* ---------------- types + constants ---------------- */
type ReqStatus = "Pending" | "Accepted" | "Denied";
type ReqKind = "Users" | "AthleteRequests";

type RequestItem = {
  id: string;
  kind: ReqKind;
  name: string;
  email?: string;
  deviceName?: string;
  issuedAt: string; // ISO
  status: ReqStatus;
  reason?: string;
  extra?: {
    role?: string;
    phone?: string;
    pupId?: string;
    sport?: string;
  };
};

const BRAND = { maroon: "#7b0f0f" };

/* ---------------- mock data (requests shown by filter) ---------------- */
const mockData: RequestItem[] = [
  {
    id: "a-201",
    kind: "AthleteRequests",
    name: "Athlete's Name",
    email: "athlete@athletrack.ph",
    deviceName: "OPPO A96 • Chrome",
    issuedAt: dayjs().subtract(5, "hour").toISOString(),
    status: "Pending",
    reason: "First log-in request",
    extra: { pupId: "PUP-23-001", sport: "Basketball" },
  },
  {
    id: "a-202",
    kind: "AthleteRequests",
    name: "Athlete's Name",
    email: "athlete2@athletrack.ph",
    deviceName: "iPad • Safari",
    issuedAt: dayjs().subtract(3, "day").toISOString(),
    status: "Accepted",
    reason: "Verified by coach",
    extra: { pupId: "PUP-23-007", sport: "Volleyball" },
  },
  {
    id: "u-101",
    kind: "Users",
    name: "User Account",
    email: "user1@athletrack.ph",
    deviceName: "iPhone 13 • Safari",
    issuedAt: dayjs().subtract(2, "hour").toISOString(),
    status: "Pending",
    reason: "New device sign-in",
    extra: { role: "Coach", phone: "+63 912 123 4567" },
  },
];

/* ---------------- small helper ---------------- */
function Labeled({ label, value }: { label: string; value?: string }) {
  return (
    <label className="block">
      <div className="text-[12.5px] text-gray-600 mb-1">{label}</div>
      <div className="rounded-xl border px-3 py-2 bg-white text-gray-900 min-h-[40px] flex items-center">
        {value ?? "—"}
      </div>
    </label>
  );
}

/* ---------------- page ---------------- */
export default function RequestManagement() {
  const [data, setData] = useState<RequestItem[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => setData(mockData), []);

  const list = useMemo(() => {
    return data
      .filter((d) => d.kind === "AthleteRequests")
      .filter((d) => (filter === "All" ? true : d.status === (filter as ReqStatus)))
      .filter((d) =>
        query.trim()
          ? [d.name, d.email, d.deviceName, d.extra?.sport, d.extra?.role]
              .filter(Boolean)
              .some((f) => String(f).toLowerCase().includes(query.toLowerCase()))
          : true
      )
      .sort((a, b) => dayjs(b.issuedAt).valueOf() - dayjs(a.issuedAt).valueOf());
  }, [data, filter, query]);

  const selected = useMemo(
    () => list.find((d) => d.id === selectedId) ?? null,
    [list, selectedId]
  );

  useEffect(() => {
    if (selectedId && !list.some((d) => d.id === selectedId)) setSelectedId(null);
  }, [filter, query, list, selectedId]);

  const setStatus = (id: string, status: ReqStatus) => {
    setData((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    message.success(
      status === "Accepted" ? "Request accepted." :
      status === "Denied" ? "Request denied." : "Updated."
    );
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-white">
      <NavBar />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* LEFT */}
        <aside className="border-r text-white" style={{ background: BRAND.maroon }}>
          {/* search + filter */}
          <div className="px-4 pt-6 pb-3">
            <div className="flex items-center gap-2">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search athlete requests..."
                onChange={(e) => setQuery(e.target.value)}
                className="bg-white rounded-lg"
              />
              <Select
                className="min-w-[150px]"
                value={filter}
                onChange={(v) => setFilter(v)}
                options={[
                  { label: "Status: All", value: "All" },
                  { label: "Pending", value: "Pending" },
                  { label: "Accepted", value: "Accepted" },
                  { label: "Denied", value: "Denied" },
                ]}
              />
            </div>
          </div>

          <div className="px-4 pb-2 text-white/90 text-sm font-medium tracking-wide">
            List of Athlete Requests
          </div>

          <div className="space-y-3 px-4 pb-6 overflow-y-auto max-h-[calc(100dvh-248px)]">
            {list.length === 0 && (
              <div className="rounded-xl bg-white">
                <Empty description="No records" image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-10" />
              </div>
            )}

            {list.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={clsx(
                  "w-full flex items-center justify-between rounded-2xl px-4 py-3 bg-white shadow-sm transition",
                  selectedId === item.id ? "ring-2 ring-offset-2" : "hover:translate-x-[2px] hover:shadow"
                )}
                style={selectedId === item.id ? { boxShadow: `0 0 0 2px ${BRAND.maroon} inset` } : {}}
              >
                <div className="flex items-center gap-3 text-left">
                  <Avatar icon={<UserOutlined />} />
                  <div className="leading-tight">
                    <div className="font-semibold text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">
                      {item.email ?? "—"} · {item.deviceName ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Tag
                    bordered={false}
                    className="!rounded-full"
                    color={
                      item.status === "Pending"
                        ? "processing"
                        : item.status === "Accepted"
                        ? "success"
                        : "error"
                    }
                  >
                    {item.status}
                  </Tag>
                  <RightOutlined className="text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT */}
        <section className="bg-white">
          <div className="max-w-5xl mx-auto p-6">
            {!selected ? (
              <div className="rounded-2xl border bg-gray-50 p-12 text-center">
                <Empty description="Select an athlete request from the left" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <Avatar size={72} icon={<UserOutlined />} />
                    <div className="min-w-[220px]">
                      <div className="text-lg font-semibold leading-tight">{selected.name}</div>
                      <div className="text-sm text-gray-500 space-x-2">
                        {selected.extra?.pupId && (
                          <span>
                            PUP ID: <b className="text-gray-700">{selected.extra.pupId}</b>
                          </span>
                        )}
                        {selected.extra?.sport && (
                          <span>
                            Sport: <b className="text-gray-700">{selected.extra.sport}</b>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-auto">
                      <Tag
                        bordered={false}
                        className="!rounded-full !px-3 !py-1"
                        color={
                          selected.status === "Pending"
                            ? "processing"
                            : selected.status === "Accepted"
                            ? "success"
                            : "error"
                        }
                      >
                        {selected.status}
                      </Tag>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Labeled value={selected.name} label="Athlete Name" />
                  <Labeled value={selected.deviceName ?? "—"} label="Device Name" />
                  <Labeled value={selected.email ?? "—"} label="Email" />
                  <Labeled
                    value={dayjs(selected.issuedAt).format("MMM D, YYYY • h:mm A")}
                    label="Issued Date & Time"
                  />
                  <Labeled value={selected.status} label="Status" />
                  <Labeled value={selected.extra?.phone ?? "—"} label="Phone Number" />
                </div>

                <div>
                  <div className="text-sm text-gray-600 mb-1">Reason</div>
                  <div className="rounded-xl border p-3 min-h-[120px]">{selected.reason ?? "—"}</div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-end">
                  <Button className="!h-10 !rounded-xl px-5" onClick={() => setStatus(selected.id, "Denied")}>
                    Deny Request
                  </Button>
                  <Button
                    type="primary"
                    className="!h-10 !rounded-xl px-5"
                    onClick={() => setStatus(selected.id, "Accepted")}
                    style={{ background: BRAND.maroon, borderColor: BRAND.maroon }}
                  >
                    Accept Request
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <style>{`
        .side-seg { padding: 2px; font-size: 12px; }
        .side-seg .ant-segmented-item { border-radius: 9999px; padding: 2px 8px; }
        .side-seg .ant-segmented-item-label { display:inline-flex; gap:6px; align-items:center; font-size:12px; }
        .side-seg .ant-segmented-item-selected { background:#efe7e7; color:${BRAND.maroon}; font-weight:600; }
      `}</style>
    </div>
  );
}
