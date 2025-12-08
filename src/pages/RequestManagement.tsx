import { useEffect, useMemo, useState, useCallback } from "react";    
import { Input, Select, Button, Empty, Avatar, Tag, message, Popconfirm } from "antd";
import {
  UserOutlined,
  SearchOutlined,
  RightOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import clsx from "clsx";
import NavBar from "@/components/NavBar";

/* 🔌 use ONLY the shared Supabase singleton so apikey/auth headers are present */
import { supabase } from "@/core/supabase";

/* ---------- Offline-enabled services ---------- */
import { fetchRequestsOffline, decideRequestOffline } from "@/services/offline";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/* ---------- Avatars ---------- */
import { bulkSignedByUserIds } from "@/services/avatars";

/* ---------------- types + constants ---------------- */
type ReqStatus = "Pending" | "Accepted" | "Denied";
type ReqKind = "Users" | "AthleteRequests";
type FinalRole = "athlete" | "coach" | "admin";

// Normalize status for display (handles legacy "approved"/"denied" from database)
const normalizeStatus = (s: string): { display: string; isPending: boolean; isAccepted: boolean } => {
  const lower = s.toLowerCase();
  return {
    display: lower === "approved" ? "Accepted" : lower === "denied" ? "Denied" : s,
    isPending: lower === "pending",
    isAccepted: lower === "accepted" || lower === "approved",
  };
};

const getStatusColor = (s: string): "processing" | "success" | "error" => {
  const { isPending, isAccepted } = normalizeStatus(s);
  if (isPending) return "processing";
  if (isAccepted) return "success";
  return "error";
};

// DbReqRow type moved to requests.offline.ts

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
    userId?: string;
    role?: string;
    phone?: string;
    pupId?: string;
    sport?: string;
    decidedById?: string;
    decidedByName?: string;
    decidedAt?: string;
  };
};

// MiniProfile and FallbackProfile types moved to requests.offline.ts

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
// toUiStatus helper moved to requests.offline.ts

/* ---------------- page ---------------- */
export default function RequestManagement() {
  const [data, setData] = useState<RequestItem[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // tie the existing Reason field to state
  const [reasonDraft, setReasonDraft] = useState("");

  /* offline status */
  const { isOnline } = useNetworkStatus();
  const [_fromCache, setFromCache] = useState(false);
  void _fromCache; // Reserved for future offline indicator

  /* avatar URLs by user_id */
  const [avatarById, setAvatarById] = useState<Record<string, string>>({});

  async function refreshAvatars(ids: string[]) {
    const validIds = ids.filter(Boolean);
    if (!validIds.length) return;
    try {
      const urls = await bulkSignedByUserIds(validIds, 60 * 60 * 24);
      if (Object.keys(urls).length) {
        setAvatarById((prev) => ({ ...prev, ...urls }));
      }
    } catch {
      // ignore; avatars fall back to icon
    }
  }

  // ---- load from backend (with offline caching) ----
  const refreshRequests = useCallback(async () => {
    try {
      setLoading(true);

      // Use offline-enabled fetch with caching
      const result = await fetchRequestsOffline();
      setFromCache(result.fromCache);

      // Map to the existing UI format (add 'kind' field)
      const mapped: RequestItem[] = result.data.map((r) => ({
        id: r.id,
        kind: "Users" as ReqKind,
        name: r.name,
        email: r.email,
        deviceName: r.deviceName,
        issuedAt: r.issuedAt,
        status: r.status as ReqStatus,
        reason: r.reason,
        extra: r.extra,
      }));

      setData(mapped);

      // Refresh avatars for users that have a userId
      const userIds = mapped
        .map((m) => m.extra?.userId)
        .filter((id): id is string => !!id);
      await refreshAvatars(userIds);

      // clear selection safely without capturing selectedId
      setSelectedId((prev) => (prev && !mapped.find((m) => m.id === prev) ? null : prev));

      if (result.fromCache && result.isStale && !isOnline) {
        message.info("Showing cached data (offline)");
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
  }, [isOnline]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    const sel = data.find((d) => d.id === selectedId);
    setReasonDraft(sel?.reason ?? "");
  }, [selectedId, data]);

  const list = useMemo(() => {
    return data
      .filter((d) => d.kind === "Users")
      .filter((d) => (filter === "All" ? true : d.status === (filter as ReqStatus)))
      .filter((d) =>
        query.trim()
          ? [
              d.name,
              d.email,
              d.deviceName,
              d.extra?.sport,
              d.extra?.role,
              d.extra?.pupId, // ← add PUP ID to searchable fields
            ]
              .filter(Boolean)
              .some((f) => String(f).toLowerCase().includes(query.toLowerCase()))
          : true
      )
      .sort((a, b) => dayjs(b.issuedAt).valueOf() - dayjs(a.issuedAt).valueOf());
  }, [data, filter, query]);

  const selected = useMemo(
    () => data.find((d) => d.id === selectedId) ?? null,
    [data, selectedId]
  );

  // ---- accept/deny wiring (with offline queuing) ----
  const setStatus = async (id: string, status: ReqStatus, reason: string) => {
    const item = data.find((d) => d.id === id);
    if (!item) return;

    const cleanReason = (reason ?? "").trim();
    if (!cleanReason) {
      message.error("Reason is required.");
      return;
    }

    try {
      // Determine the real account_requests row id (fallback if we built the list from profiles)
      let requestId = id;
      
      if (isOnline) {
        const { data: reqById } = await supabase
          .from("account_requests")
          .select("id,status")
          .eq("id", id)
          .maybeSingle();

        if (!reqById) {
          const { data: reqByUser, error: rbuErr } = await supabase
            .from("account_requests")
            .select("id,status")
            .eq("user_id", item.extra?.userId ?? "")
            .order("created_at", { ascending: false })
            .maybeSingle();

          if (rbuErr) throw rbuErr;
          if (!reqByUser) {
            message.error("No pending request record found for this user.");
            return;
          }
          requestId = reqByUser.id;
        }
      }

      const finalRole: FinalRole =
        (item.extra?.role?.toLowerCase() as FinalRole) || "athlete";

      // Use offline-enabled decision service
      const { queued } = await decideRequestOffline({
        requestId,
        userId: item.extra?.userId,
        decision: status === "Accepted" ? "approve" : "deny",
        finalRole,
        reason: cleanReason,
      });

      await refreshRequests();
      setFilter((curr) => (curr !== "All" && curr !== status ? "All" : curr));

      if (queued) {
        message.info(`You're offline. Request will be ${status === "Accepted" ? "accepted" : "denied"} when you're back online.`);
      } else {
        message.success(status === "Accepted" ? "Request accepted." : "Request denied.");
      }
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
        <aside
          className="border-r text-white"
          style={{ background: BRAND.maroon }}
        >
          {/* search + filter */}
          <div className="px-4 pt-6 pb-3">
            <div className="flex items-center gap-2">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search user requests..."
                onChange={(e) => setQuery(e.target.value)}
                className="bg-white rounded-lg"
              />
              <Select
                className="min-w[150px] min-w-[150px]"
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
            List of User Requests
          </div>

          <div className="space-y-3 px-4 pb-6 overflow-y-auto overflow-x-hidden max-h[calc(100dvh-248px)] max-h-[calc(100dvh-248px)]">
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
                <div className="flex items-center gap-3 text-left min-w-0">
                  <Avatar 
                    src={item.extra?.userId ? avatarById[item.extra.userId] : undefined}
                    icon={!avatarById[item.extra?.userId ?? ""] ? <UserOutlined /> : undefined}
                  />
                  <div className="leading-tight truncate">
                    <div className="font-semibold text-gray-900 truncate">{item.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {item.email ?? "—"} · {item.deviceName ?? "—"}
                    </div>
                    {item.extra?.pupId && (
                      <div className="text-xs text-gray-400 truncate">
                        PUP ID: {item.extra.pupId}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2 shrink-0 items-center">
                    <Tag
                      bordered={false}
                      className="!rounded-full !m-0"
                      color={getStatusColor(item.status)}
                    >
                      {normalizeStatus(item.status).display}
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
                <Empty description="Select a user request from the left" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <Avatar 
                      size={72} 
                      src={selected.extra?.userId ? avatarById[selected.extra.userId] : undefined}
                      icon={!avatarById[selected.extra?.userId ?? ""] ? <UserOutlined /> : undefined}
                    />
                    <div className="min-w-[220px]">
                      <div className="text-lg font-semibold leading-tight">{selected.name}</div>
                      <div className="text-sm text-gray-500 space-x-2">
                        <span>
                          PUP ID: <b className="text-gray-700">{selected.extra?.pupId || "None"}</b>
                        </span>
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
                        color={getStatusColor(selected.status)}
                      >
                        {normalizeStatus(selected.status).display}
                      </Tag>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Labeled value={selected.name} label="User Name" />
                  <Labeled value={selected.email ?? "—"} label="Email" />
                  <Labeled
                    value={dayjs(selected.issuedAt).format("MMM D, YYYY • h:mm A")}
                    label="Issued Date & Time"
                  />
                  <Labeled value={normalizeStatus(selected.status).display} label="Status" />

                  {/* Show only if not pending */}
                  {!normalizeStatus(selected.status).isPending && (
                    <>
                      <Labeled
                        value={selected.extra?.decidedByName || selected.extra?.decidedById || "—"}
                        label="Decided By"
                      />
                      <Labeled
                        value={
                          selected.extra?.decidedAt
                            ? dayjs(selected.extra.decidedAt).format("MMM D, YYYY • h:mm A")
                            : "—"
                        }
                        label="Decided At"
                      />
                    </>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <div className="text-sm text-gray-600 mb-1">Reason</div>
                  <div className="rounded-xl border p-3 min-h-[120px] bg-white">
                    <Input.TextArea
                      rows={4}
                      value={reasonDraft}
                      onChange={(e) => setReasonDraft(e.target.value)}
                      placeholder="Enter reason (required to accept/deny)"
                      className="!resize-none !border-0 !shadow-none !bg-white"
                      style={{ padding: 0 }}
                      disabled={!normalizeStatus(selected.status).isPending}
                    />
                  </div>
                </div>

                {/* Buttons only when Pending */}
                {normalizeStatus(selected.status).isPending && (
                  <div className="flex flex-col sm:flex-row gap-3 justify-end">
                    <Popconfirm
                      title="Deny this request?"
                      icon={<CloseCircleOutlined style={{ color: "red" }} />}
                      okText="Yes"
                      cancelText="No"
                      onConfirm={() => selected && setStatus(selected.id, "Denied", reasonDraft)}
                    >
                      <Button className="!h-10 !rounded-xl px-5">Deny Request</Button>
                    </Popconfirm>

                    <Popconfirm
                      title="Accept this request?"
                      icon={<CheckCircleOutlined style={{ color: "green" }} />}
                      okText="Yes"
                      cancelText="No"
                      onConfirm={() => selected && setStatus(selected.id, "Accepted", reasonDraft)}
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
                )}
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
