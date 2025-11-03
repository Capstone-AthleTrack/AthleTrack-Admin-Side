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

/* ---------------- types + constants ---------------- */
type ReqStatus = "Pending" | "Accepted" | "Denied";
type ReqKind = "Users" | "AthleteRequests";
type FinalRole = "athlete" | "coach" | "admin";

/** Raw row shape from public.account_requests (safe minimal superset) */
type DbReqRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  device_name: string | null;
  desired_role: string | null;
  status: string | null;
  reason: string | null;
  created_at: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  // optional extras if present
  phone?: string | null;
  pup_id?: string | null;
  sport?: string | null;
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

/** Minimal profile shape for name lookup (avoids `any`) */
type MiniProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/** Fallback profile shape when reading pending profiles */
type FallbackProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  updated_at: string | null;
  role: string | null;
  status: string | null;
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

  // tie the existing Reason field to state
  const [reasonDraft, setReasonDraft] = useState("");

  // ---- load from backend ----
  const refreshRequests = useCallback(async () => {
    try {
      setLoading(true);

      // Try full column set first, then gracefully narrow if the table/view is missing some columns (prevents 400 Bad Request)
      const selectFull = [
        "id",
        "user_id",
        "email",
        "full_name",
        "device_name",
        "desired_role",
        "status",
        "reason",
        "created_at",
        "decided_by",
        "decided_at",
        "phone",
        "pup_id",
        "sport",
      ].join(",");

      const selectBase = [
        "id",
        "user_id",
        "email",
        "full_name",
        "device_name",
        "desired_role",
        "status",
        "reason",
        "created_at",
      ].join(",");

      let rowsRaw: unknown[] | null = null;

      // attempt 1 — full superset
      const resp = await supabase
        .from("account_requests")
        .select(selectFull)
        .order("created_at", { ascending: false })
        .range(0, 199); // <-- FIXED: single dot before range

      if (resp.error) {
        // attempt 2 — minimal base columns (handles schema drift)
        const resp2 = await supabase
          .from("account_requests")
          .select(selectBase)
          .order("created_at", { ascending: false })
          .range(0, 199);

        if (resp2.error) {
          // attempt 3 — fallback to profiles pending (so the list never goes blank)
          const fb = await supabase
            .from("profiles")
            .select("id,full_name,email,updated_at,role,status")
            .eq("status", "pending")
            .order("updated_at", { ascending: false })
            .range(0, 199);

          if (fb.error) throw fb.error;

          const fallbackRows = (fb.data ?? []) as FallbackProfile[];
          const mappedFromProfiles: RequestItem[] = fallbackRows.map((p) => ({
            id: p.id,
            kind: "Users",
            name: p.full_name || "",
            email: p.email || undefined,
            deviceName: undefined,
            issuedAt: p.updated_at || new Date().toISOString(),
            status: "Pending",
            reason: "",
            extra: {
              userId: p.id,
              role: p.role
                ? `${String(p.role).charAt(0).toUpperCase()}${String(p.role).slice(1)}`
                : "Athlete",
            },
          }));
          setData(mappedFromProfiles);
          // clear selection safely without capturing selectedId
          setSelectedId((prev) =>
            prev && !mappedFromProfiles.find((m) => m.id === prev) ? null : prev
          );
          return;
        } else {
          rowsRaw = resp2.data ?? [];
        }
      } else {
        rowsRaw = resp.data ?? [];
      }

      const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as unknown as DbReqRow[];

      // 🔁 Soft fallback if table exists but has 0 rows (show pending profiles)
      if (!rows.length) {
        const fb2 = await supabase
          .from("profiles")
          .select("id,full_name,email,updated_at,role,status")
          .eq("status", "pending")
          .order("updated_at", { ascending: false })
          .range(0, 199);

        if (!fb2.error) {
          const pendingProfiles = (fb2.data ?? []) as FallbackProfile[];
          const mappedFromProfiles: RequestItem[] = pendingProfiles.map((p) => ({
            id: p.id,
            kind: "Users",
            name: p.full_name || "",
            email: p.email || undefined,
            deviceName: undefined,
            issuedAt: p.updated_at || new Date().toISOString(),
            status: "Pending",
            reason: "",
            extra: {
              userId: p.id,
              role: p.role
                ? `${String(p.role).charAt(0).toUpperCase()}${String(p.role).slice(1)}`
                : "Athlete",
            },
          }));
          setData(mappedFromProfiles);
          setSelectedId((prev) =>
            prev && !mappedFromProfiles.find((m) => m.id === prev) ? null : prev
          );
          return;
        }
      }

      // fetch names of deciding admins (if any)
      const adminIds = Array.from(
        new Set(rows.map((r) => r.decided_by).filter((v): v is string => !!v))
      );

      let decidedNameById: Record<string, string> = {};
      if (adminIds.length) {
        const { data: admins, error: adminErr } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", adminIds);

        if (adminErr) throw adminErr;

        const adminsTyped = (admins ?? []) as unknown as MiniProfile[];

        decidedNameById = adminsTyped.reduce<Record<string, string>>((acc, p) => {
          acc[p.id] = p.full_name || p.email || p.id;
          return acc;
        }, {});
      }

      const mapped: RequestItem[] = rows.map((r) => ({
        id: r.id,
        kind: "Users",
        name: r.full_name || "",
        email: r.email || undefined,
        deviceName: r.device_name || undefined,
        issuedAt: r.created_at || new Date().toISOString(),
        status: toUiStatus(r.status),
        reason: r.reason || "",
        extra: {
          userId: r.user_id || undefined,
          role: r.desired_role
            ? `${String(r.desired_role).charAt(0).toUpperCase()}${String(r.desired_role).slice(1)}`
            : "Athlete",
          pupId: r.pup_id || undefined,
          sport: r.sport || undefined,
          phone: r.phone || undefined,
          decidedById: r.decided_by || undefined,
          decidedByName: r.decided_by ? decidedNameById[r.decided_by] : undefined,
          decidedAt: r.decided_at || undefined,
        },
      }));

      setData(mapped);

      // clear selection safely without capturing selectedId
      setSelectedId((prev) => (prev && !mapped.find((m) => m.id === prev) ? null : prev));
    } catch (e) {
      if (e instanceof Error) {
        message.error(e.message);
      } else {
        message.error("Failed to load requests");
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
          ? [d.name, d.email, d.deviceName, d.extra?.sport, d.extra?.role]
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

  // ---- accept/deny wiring ----
  const setStatus = async (id: string, status: ReqStatus, reason: string) => {
    const item = data.find((d) => d.id === id);
    if (!item) return;

    const cleanReason = (reason ?? "").trim();
    if (!cleanReason) {
      message.error("Reason is required.");
      return;
    }

    try {
      const { data: auth } = await supabase.auth.getUser();
      const decidedBy = auth?.user?.id ?? null;
      const decidedAt = new Date().toISOString();

      // 🔎 Determine the real account_requests row id (fallback if we built the list from profiles)
      let requestId = id;
      {
        const { data: reqById, error: ridErr } = await supabase
          .from("account_requests")
          .select("id,status")
          .eq("id", id)
          .maybeSingle();

        if (ridErr) throw ridErr;

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

      if (status === "Accepted") {
        // First, mark the request approved (if the table lacks some columns, retry with a minimal update)
        const tryApprove = async () => {
          const { error: e1 } = await supabase
            .from("account_requests")
            .update({
              status: "approved",
              reason: cleanReason,
              decided_by: decidedBy,
              decided_at: decidedAt,
            })
            .eq("id", requestId)
            .eq("status", "pending");
          if (e1) {
            // minimal update fallback (for schemas without decided_by/decided_at)
            const { error: eMin } = await supabase
              .from("account_requests")
              .update({
                status: "approved",
                reason: cleanReason,
              })
              .eq("id", requestId)
              .eq("status", "pending");
            if (eMin) throw eMin;
          }
        };
        await tryApprove();

        const finalRole: FinalRole =
          (item.extra?.role?.toLowerCase() as FinalRole) || "athlete";
        if (item.extra?.userId) {
          // IMPORTANT: use existing enum label 'accepted' (NOT 'active')
          const { error: e2 } = await supabase
            .from("profiles")
            .update({ role: finalRole, status: "accepted", is_active: true, updated_at: decidedAt })
            .eq("id", item.extra.userId);
          if (e2) throw e2;
        }
      } else if (status === "Denied") {
        const { error: e3 } = await supabase
          .from("account_requests")
          .update({
            status: "denied",
            reason: cleanReason,
            decided_by: decidedBy,
            decided_at: decidedAt,
          })
          .eq("id", requestId)
          .eq("status", "pending");
        if (e3) {
          // minimal fallback if columns are missing
          const { error: eMin2 } = await supabase
            .from("account_requests")
            .update({
              status: "denied",
              reason: cleanReason,
            })
            .eq("id", requestId)
            .eq("status", "pending");
          if (eMin2) throw eMin2;
        }
      }

      await refreshRequests();

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
            List of User Requests
          </div>

          <div className="space-y-3 px-4 pb-6 overflow-y-auto overflow-x-hidden max-h-[calc(100dvh-248px)]">
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
                  <Avatar icon={<UserOutlined />} />
                  <div className="leading-tight truncate">
                    <div className="font-semibold text-gray-900 truncate">{item.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {item.email ?? "—"} · {item.deviceName ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2 shrink-0 items-center">
                  <Tag
                    bordered={false}
                    className="!rounded-full !m-0"
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
                <Empty description="Select a user request from the left" />
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
                  <Labeled value={selected.name} label="User Name" />
                  <Labeled value={selected.deviceName ?? "—"} label="Device Name" />
                  <Labeled value={selected.email ?? "—"} label="Email" />
                  <Labeled
                    value={dayjs(selected.issuedAt).format("MMM D, YYYY • h:mm A")}
                    label="Issued Date & Time"
                  />
                  <Labeled value={selected.status} label="Status" />
                  <Labeled value={selected.extra?.phone ?? "—"} label="Phone Number" />

                  {/* Show only if not pending */}
                  {selected.status !== "Pending" && (
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
                      disabled={selected.status !== "Pending"}
                    />
                  </div>
                </div>

                {/* Buttons only when Pending */}
                {selected.status === "Pending" && (
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
