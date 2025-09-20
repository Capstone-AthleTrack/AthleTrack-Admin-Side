import { useEffect, useMemo, useState } from "react";
import { Input, Select, Button, Empty, Avatar, Tag, message, Popconfirm } from "antd";
import { UserOutlined, SearchOutlined, RightOutlined, CloseCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import clsx from "clsx";
import NavBar from "@/components/NavBar";

/* 🔌 services only (NO UI CHANGES) */
import {
  listAccountRequests,
  approveAccount,
  denyAccount,
  type AccountRequest as DbReq,
} from "@/services/accountRequests";

/* ---------------- types + constants ---------------- */
type ReqStatus = "Pending" | "Accepted" | "Denied";
type ReqKind = "Users" | "AthleteRequests";
type FinalRole = "athlete" | "coach" | "admin";

/** Extend DB row with optional fields we may or may not have */
type AccountRequestRow = DbReq & {
  device_name?: string | null;
  pup_id?: string | null;
  sport?: string | null;
  phone?: string | null;
};

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

/* ---------------- small helpers ---------------- */
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
const toUiStatus = (s: string | null | undefined): ReqStatus =>
  (s ?? "").toLowerCase() === "approved"
    ? "Accepted"
    : (s ?? "").toLowerCase() === "denied"
    ? "Denied"
    : "Pending";

/* ---------------- page ---------------- */
export default function RequestManagement() {
  const [data, setData] = useState<RequestItem[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- load from backend (replaces old mockData) ----
  const refreshRequests = async () => {
    try {
      setLoading(true);
      const rows = (await listAccountRequests()) as AccountRequestRow[];

      // map backend rows → current UI shape (no JSX changes)
      const mapped: RequestItem[] = rows.map((r) => ({
        id: r.id,
        kind: "AthleteRequests",
        name: r.full_name || "",
        email: r.email || undefined,
        deviceName: r.device_name || undefined,
        issuedAt: r.created_at || new Date().toISOString(),
        status: toUiStatus(r.status),
        reason: r.reason || "",
        extra: {
          role: r.desired_role
            ? `${String(r.desired_role).charAt(0).toUpperCase()}${String(r.desired_role).slice(1)}`
            : "Athlete",
          pupId: r.pup_id || undefined,
          sport: r.sport || undefined,
          phone: r.phone || undefined,
        },
      }));

      setData(mapped);

      // keep selection stable if still present
      if (selectedId && !mapped.find((m) => m.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e) {
      if (e instanceof Error) {
        message.error(e.message);
      } else {
        message.error("Failed to load requests");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshRequests();
    // (Realtime subscription omitted for now; add once your core client export is confirmed.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // FIX: always derive selected from raw data, not filtered list
  const selected = useMemo(
    () => data.find((d) => d.id === selectedId) ?? null,
    [data, selectedId]
  );

  // ---- accept/deny wiring (NO UI CHANGES) ----
  const setStatus = async (id: string, status: ReqStatus) => {
    const item = data.find((d) => d.id === id);
    if (!item) return;

    // REQUIRE reason before calling backend (per spec)
    const reason = (item.reason ?? "").trim();
    if (!reason) {
      message.error("Reason is required before approving/denying.");
      return;
    }

    try {
      if (status === "Accepted") {
        const finalRole: FinalRole =
          (item.extra?.role?.toLowerCase() as FinalRole) || "athlete";
        await approveAccount({ id: item.id, finalRole, reason });
      } else if (status === "Denied") {
        await denyAccount({ id: item.id, reason });
      }
      await refreshRequests();

      // optional: reset filter if item disappears from current view
      setFilter((curr) => (curr !== "All" && curr !== status ? "All" : curr));

      message.success(status === "Accepted" ? "Request accepted." : "Request denied.");
    } catch (e) {
      if (e instanceof Error) {
        message.error(e.message);
      } else {
        message.error("Action failed.");
      }
    }
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
                loading={loading}
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
          <div className="w-full p-10">
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
                  <Popconfirm
                    title="Deny this request?"
                    icon={<CloseCircleOutlined style={{ color: "red" }} />}
                    okText="Yes"
                    cancelText="No"
                    onConfirm={() => setStatus(selected.id, "Denied")}
                  >
                    <Button className="!h-10 !rounded-xl px-5">Deny Request</Button>
                  </Popconfirm>

                  <Popconfirm
                    title="Accept this request?"
                    icon={<CheckCircleOutlined style={{ color: "green" }} />}
                    okText="Yes"
                    cancelText="No"
                    onConfirm={() => setStatus(selected.id, "Accepted")}
                  >
                    <Button
                      type="primary"
                      className="!h-10 !rounded-xl px-5"
                      style={{ background: BRAND.maroon, borderColor: BRAND.maroon }}
                    >
                      Accept Request
                    </Button>
                  </Popconfirm>
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
