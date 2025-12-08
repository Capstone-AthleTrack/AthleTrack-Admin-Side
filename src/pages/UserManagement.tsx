import { useEffect, useMemo, useState } from "react";           
import {
  Input,
  Select,
  Button,
  Empty,
  Avatar,
  message,
  Modal,
  Form,
  Switch,
  Tooltip,
} from "antd";
import {
  UserOutlined,
  SearchOutlined,
  PlusOutlined,
  RightOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
import clsx from "clsx";
import NavBar from "@/components/NavBar";

/* ---------- Supabase client (reads/writes public.profiles) ---------- */
import { supabase } from "@/core/supabase";

/* ---------- Offline-enabled services ---------- */
import {
  fetchUsersOffline,
  addUserOffline,
  updateUserOffline,
  deleteUserOffline,
} from "@/services/offline";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/* ---------- Avatars (signed URLs; no UI changes) ---------- */
import { bulkSignedByUserIds } from "@/services/avatars";
import { subscribeProfilesAvatar } from "@/hooks/useAvatarRealtime";

/* ---------------- types + constants ---------------- */
type ReqStatus = "Pending" | "Accepted" | "Denied";
type ReqKind = "Users" | "AthleteRequests";

interface RequestItem {
  id: string;
  kind: ReqKind;
  name: string;
  email?: string;
  deviceName?: string;
  issuedAt: string; // ISO
  status: ReqStatus;
  reason?: string;
  isAdminPanelAllowed?: boolean;
  extra?: {
    role?: string;
    phone?: string;
    pupId?: string;
    sport?: string;
    team?: string;
  };
}

const BRAND = { maroon: "#7b0f0f" };

/* ---------- DB types (mirror of public.profiles minimal fields) ---------- */
type DBRole = "admin" | "coach" | "athlete" | "user" | null;
type DBStatus = "pending" | "accepted" | "decline" | "disabled" | null;

interface ProfileRow {
  id: string;
  email: string | null;
  role: DBRole;
  status: DBStatus;
  full_name: string | null;
  phone: string | null;
  pup_id: string | null;
  sport: string | null;
  team: string | null;
  created_at: string | null;
  is_admin_panel_allowed?: boolean;
}

// ProfileInsert and AdminListUsersRow types moved to users.offline.ts

/* ---------- role label helpers (UI <-> DB) ---------- */
const roleDbToUi = (r: DBRole): string | undefined =>
  r ? r.charAt(0).toUpperCase() + r.slice(1) : undefined;

const roleUiToDb = (r?: string): DBRole =>
  (r ? r.toLowerCase() : "") as DBRole;

/* ---------- Request status from profile.status (for the existing UI) ---------- */
const statusToReq: Record<Exclude<DBStatus, null>, ReqStatus> = {
  pending: "Pending",
  accepted: "Accepted",
  decline: "Denied",
  disabled: "Denied",
};

// normalizeStatus moved to users.offline.ts

/* ---------- small safe-pickers moved to users.offline.ts ---------- */

/* ---------- team utils ---------- */
function toUiTeam(val?: string | null): string | undefined {
  const n = normTeam(val);
  if (!n) return val ?? undefined;
  // normTeam now returns "men's" or "women's" directly
  return n;
}

/* ---------- map DB row -> existing UI item shape ---------- */
function toItem(p: ProfileRow): RequestItem {
  return {
    id: p.id,
    kind: "Users",
    name: p.full_name || "User Account",
    email: p.email ?? undefined,
    deviceName: undefined, // not stored; keep placeholder
    issuedAt: p.created_at || new Date().toISOString(),
    status: statusToReq[(p.status ?? "pending") as Exclude<DBStatus, null>],
    isAdminPanelAllowed: p.is_admin_panel_allowed ?? false,
    extra: {
      role: roleDbToUi(p.role),
      phone: p.phone ?? undefined,
      pupId: p.pup_id ?? undefined,
      sport: p.sport ?? undefined,
      team: toUiTeam(p.team), // pretty "men's"/"women's" for the details panel
    },
  };
}

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

/* ---------- CANONICALIZATION HELPERS (no UI changes) ---------- */
/* normSport moved to users.offline.ts */

function normTeam(input?: string | null): string | null {
  if (!input) return null;
  // accept "men", "women", "men's", "women's", smart quotes, etc.
  // Returns database enum values: "men's" or "women's"
  const t = input.normalize("NFKC").toLowerCase().replace(/[''`]/g, "").trim();
  if (t === "men" || t === "mens" || t === "men's") return "men's";
  if (t === "women" || t === "womens" || t === "women's") return "women's";
  if (t.includes("women")) return "women's";
  if (t.includes("men")) return "men's";
  return null;
}

/* ---------- sport→team helper (keeps UI unchanged; just to populate options) ---------- */
function allowedTeamsForSport(s?: string | null): Array<"men's" | "women's"> {
  const v = (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (v === "baseball") return ["men's"];
  if (v === "softball") return ["women's"];
  if (
    v === "basketball" ||
    v === "beach volleyball" ||
    v === "futsal" ||
    v === "volleyball" ||
    v === "sepak-takraw"
  ) {
    return ["men's", "women's"];
  }
  if (v === "football") return ["men's"];
  return ["men's", "women's"];
}

/* ---------------- page ---------------- */
export default function UserManagement() {
  const [data, setData] = useState<RequestItem[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Add User modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form] = Form.useForm();
  const addSportValue = Form.useWatch('sport', form);

  // Edit User modal (opens when you double-click the details panel on the right)
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const editSportValue = Form.useWatch('sport', editForm);

  /* delete-confirm modal */
  const [showConfirm, setShowConfirm] = useState(false);

  /* offline status */
  const { isOnline } = useNetworkStatus();
  const [_fromCache, setFromCache] = useState(false);
  void _fromCache; // Reserved for future offline indicator

  /* ---------- signed avatar URLs (read-only) ---------- */
  const [avatarSrcById, setAvatarSrcById] = useState<Record<string, string>>({});

  async function refreshAvatars(ids: string[]) {
    if (!ids.length) return;
    try {
      const signedMap = await bulkSignedByUserIds(ids, 60 * 60 * 24);
      if (Object.keys(signedMap).length) {
        setAvatarSrcById((prev) => ({ ...prev, ...signedMap }));
      }
    } catch {
      // ignore; avatars fall back to initials/icon
    }
  }

  /* ---------- load from Supabase (with offline caching) ---------- */
  async function loadProfiles() {
    try {
      // Use offline-enabled fetch with caching
      const result = await fetchUsersOffline();
      setFromCache(result.fromCache);

      const items = result.data.map((p) => toItem({
        id: p.id,
        email: p.email,
        role: p.role,
        status: p.status,
        full_name: p.full_name,
        phone: p.phone,
        pup_id: p.pup_id,
        sport: p.sport,
        team: p.team,
        created_at: p.created_at,
        is_admin_panel_allowed: p.is_admin_panel_allowed,
      }));

      setData(items);
      await refreshAvatars(items.map((i) => i.id));
      
      if (selectedId && !items.some((d) => d.id === selectedId)) {
        setSelectedId(null);
      }

      if (result.fromCache && result.isStale && !isOnline) {
        message.info("Showing cached data (offline)");
      }
    } catch (error) {
      console.error(error);
      message.error("Failed to load profiles.");
    }
  }

  useEffect(() => {
    loadProfiles();
    const sub = supabase.auth.onAuthStateChange(() => loadProfiles());
    return () => sub.data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Realtime: subscribe only to the currently listed users; refresh the changed one */
  useEffect(() => {
    if (!data.length) return;

    const ids = data.map((d) => d.id);
    const unsubscribe = subscribeProfilesAvatar(ids, async ({ id }) => {
      const single = await bulkSignedByUserIds([id], 60 * 60 * 24);
      if (single[id]) {
        setAvatarSrcById((prev) => ({ ...prev, [id]: single[id] }));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [data]);

  /* ---------- derived lists ---------- */
  const list = useMemo(() => {
    return data
      .filter((d) => d.kind === "Users")
      .filter((d) => (filter === "All" ? true : d.extra?.role === filter))
      .filter((d) =>
        query.trim()
          ? [d.name, d.email, d.deviceName, d.extra?.sport, d.extra?.role]
              .filter(Boolean)
              .some((f) => String(f).toLowerCase().includes(query.toLowerCase()))
          : true
      )
      .sort(
        (a, b) => dayjs(b.issuedAt).valueOf() - dayjs(a.issuedAt).valueOf()
      );
  }, [data, filter, query]);

  const selected = useMemo(
    () => list.find((d) => d.id === selectedId) ?? null,
    [list, selectedId]
  );

  /* Keep selection valid when filters change */
  useEffect(() => {
    if (selectedId && !list.some((d) => d.id === selectedId)) setSelectedId(null);
  }, [filter, query, list, selectedId]);

  /* ---------- Add user ---------- */
  const openAdd   = () => setIsAddOpen(true);
  const closeAdd  = () => { setIsAddOpen(false); form.resetFields(); };

  const handleAddSubmit = async () => {
    try {
      const values = await form.validateFields();

      // Use offline-enabled add
      const { queued } = await addUserOffline({
        email: values.email,
        role: roleUiToDb(values.role),
        full_name: values.name ?? null,
        phone: values.phone ?? null,
        pup_id: values.pupId ?? null,
        sport: values.sport,
        team: values.team,
      });

      if (queued) {
        message.info("You're offline. User will be added when you're back online.");
      } else {
        message.success("User added.");
      }
      
      closeAdd();
      await loadProfiles();
    } catch (e) {
      console.error(e);
      message.error("Failed to add user.");
    }
  };

  /* ---------- Edit user (open by double-click on details card) ---------- */
  const openEdit = () => {
    if (!selected) return;
    setIsEditOpen(true);
    // Normalize the incoming team so it matches the Select option values ("men's" or "women's")
    const initialTeam = normTeam(selected.extra?.team) || "";
    editForm.setFieldsValue({
      name: selected.name || "",
      email: selected.email || "",
      role: selected.extra?.role || "User",
      phone: selected.extra?.phone || "",
      pupId: selected.extra?.pupId || "",
      sport: selected.extra?.sport || "",
      team: initialTeam, // "men's" or "women's" - matches database enum
      isAdminPanelAllowed: selected.isAdminPanelAllowed ?? false,
    });
  };
  const closeEdit = () => {
    setIsEditOpen(false);
    editForm.resetFields();
  };

  // Only update Sport, Team, Role, is_admin_panel_allowed (others are read-only)
  const handleEditSubmit = async () => {
    if (!selected) return;
    try {
      const values = await editForm.validateFields();

      const roleDb = roleUiToDb(values.role);
      const supportedRoles = new Set(["admin", "coach", "athlete", "user"]);

      // Debug: Log the form values being submitted
      console.log('[UserManagement] handleEditSubmit values:', {
        sport: values.sport,
        team: values.team,
        role: values.role,
        roleDb,
        isAdminPanelAllowed: values.isAdminPanelAllowed,
      });

      // Use offline-enabled update for all fields (including is_admin_panel_allowed)
      const { queued } = await updateUserOffline(selected.id, {
        sport: values.sport,
        team: values.team, // This will be normalized to "men's" or "women's" in updateUserOffline
        role: roleDb && supportedRoles.has(roleDb) ? roleDb : undefined,
        is_admin_panel_allowed: values.isAdminPanelAllowed ?? false,
      });

      if (queued) {
        message.info("You're offline. Changes will sync when you're back online.");
      } else {
        message.success("Profile updated.");
      }

      closeEdit();
      await loadProfiles();
      setSelectedId(selected.id); // keep focus
    } catch (err) {
      console.error('[UserManagement] handleEditSubmit error:', err);
      message.error("Failed to update profile.");
    }
  };

  /* ---------- Delete user ---------- */
  const handleDelete = async () => {
    if (!selected) return;
    try {
      // Use offline-enabled delete
      const { queued } = await deleteUserOffline(selected.id);

      setSelectedId(null);
      setShowConfirm(false);
      
      if (queued) {
        message.info("You're offline. User will be deleted when you're back online.");
      } else {
        message.success("User deleted.");
      }
      
      await loadProfiles();
    } catch {
      message.error("Failed to delete profile.");
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-white">
      <NavBar />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* LEFT PANE */}
        <aside
          className="border-r text-white"
          style={{ background: BRAND.maroon }}
        >
          {/* search + filter + add */}
          <div className="px-4 pt-6 pb-3">
            <div className="flex items-center gap-2">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search users..."
                onChange={(e) => setQuery(e.target.value)}
                className="bg-white rounded-lg"
              />
              <Select
                className="min-w-[150px]"
                value={filter}
                onChange={(v) => setFilter(v)}
                options={[
                  { label: "Role: All", value: "All" },
                  { label: "Coach", value: "Coach" },
                  { label: "Athlete", value: "Athlete" },
                ]}
              />
            </div>

            <Button
              block
              className="mt-3 !h-9 rounded-xl font-medium"
              icon={<PlusOutlined />}
              style={{ background: "#ffffff", color: BRAND.maroon }}
              onClick={openAdd}
            >
              Add User
            </Button>
          </div>

          <div className="px-4 pb-2 text-white/90 text-sm font-medium tracking-wide">
            List of Users
          </div>

          <div className="space-y-3 px-4 pb-6 overflow-y-auto max-h-[calc(100dvh-248px)]">
            {list.length === 0 && (
              <div className="rounded-xl bg-white">
                <Empty
                  description="No records"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  className="py-10"
                />
              </div>
            )}

            {list.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={clsx(
                  "w-full flex items-center justify-between rounded-2xl px-4 py-3 bg-white shadow-sm transition",
                  selectedId === item.id
                    ? "ring-2 ring-offset-2"
                    : "hover:translate-x-[2px] hover:shadow"
                )}
                style={
                  selectedId === item.id
                    ? { boxShadow: `0 0 0 2px ${BRAND.maroon} inset` }
                    : {}
                }
              >
                <div className="flex items-center gap-3 text-left min-w-0">
                  <Avatar icon={<UserOutlined />} src={avatarSrcById[item.id]} />
                  <div className="leading-tight truncate max-w-[220px]">
                    <div className="font-semibold text-gray-900 truncate">
                      {item.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {item.email ?? "—"} · {item.deviceName ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text:[11px] text-gray-400 whitespace-nowrap">
                    {dayjs(item.issuedAt).fromNow()}
                  </span>
                  <RightOutlined className="text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT PANE */}
        <section className="bg-white">
          <div className="w-full p-10">
            {!selected ? (
              <div className="rounded-2xl border bg-gray-50 p-12 text-center">
                <Empty description="Select a user from the left" />
              </div>
            ) : (
              <div className="space-y-5" onDoubleClick={openEdit}>
                <div className="rounded-2xl border p-5 flex flex-wrap items-center gap-4">
                  <Avatar size={72} icon={<UserOutlined />} src={avatarSrcById[selected.id]} />
                  <div className="min-w-[220px]">
                    <div className="text-lg font-semibold leading-tight">
                      {selected.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      Role:{" "}
                      <span className="font-medium text-gray-700">
                        {selected.extra?.role ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Labeled
                    value={selected.extra?.pupId}
                    label="PUP ID Number"
                  />
                  <Labeled value={selected.extra?.sport} label="Sport" />
                  <Labeled value={selected.extra?.team} label="Team" />
                  <Labeled value={selected.email} label="Email Address" />
                  <Labeled value={selected.extra?.phone} label="Phone Number" />
                  <Labeled value={selected.extra?.role} label="Role" />
                  <Labeled
                    value={dayjs(selected.issuedAt).format("MMM D, YYYY")}
                    label="Registration Date"
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-end">
                  <Button
                    danger
                    className="!h-10 !rounded-xl px-5"
                    onClick={() => setShowConfirm(true)}
                  >
                    Delete Profile
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ---------- ADD USER MODAL ---------- */}
      <Modal
        title="Add User"
        open={isAddOpen}        
        onOk={handleAddSubmit}
        onCancel={closeAdd}
        okText="Save"
        cancelText="Cancel"
        centered
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Full Name"
            name="name"
            rules={[{ required: true, message: "Please enter full name" }]}
          >
            <Input placeholder="e.g. Juan Dela Cruz" />
          </Form.Item>

          <Form.Item
            label="Email Address"
            name="email"
            rules={[
              { required: true, message: "Please enter email" },
              { type: "email", message: "Invalid email" },
            ]}
          >
            <Input placeholder="name@athletrack.ph" />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item
              label="Role"
              name="role"
              rules={[{ required: true, message: "Select a role" }]}
            >
              <Select
                placeholder="Select role"
                options={[
                  { label: "Coach", value: "Coach" },
                  { label: "Athlete", value: "Athlete" },
                ]}
              />
            </Form.Item>

            <Form.Item label="Phone" name="phone">
              <Input placeholder="+63 9XX XXX XXXX" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item label="PUP ID" name="pupId">
              <Input placeholder="e.g. PUP-23-001" />
            </Form.Item>

            <Form.Item label="Sport" name="sport">
              <Input placeholder="e.g. Basketball" />
            </Form.Item>

            <Form.Item
              label="Team"
              name="team"
              dependencies={['sport']}
              rules={[{ required: false }]}
            >
              <Select
                placeholder="Select team"
                /* Send database enum values directly: "men's" or "women's" */
                options={allowedTeamsForSport(addSportValue).map((t) => ({
                  label: t === "men's" ? "Men's" : "Women's",
                  value: t, // "men's" or "women's" - matches database enum
                }))}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ---------- EDIT USER MODAL (opens on double-click) ---------- */}
      <Modal
        title="Edit User"
        open={isEditOpen}
        onOk={handleEditSubmit}
        onCancel={closeEdit}
        okText="Save"
        cancelText="Cancel"
        centered
        width={560}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="Full Name"
            name="name"
            rules={[{ required: true, message: "Please enter full name" }]}
          >
            <Input placeholder="e.g. Juan Dela Cruz" disabled />
          </Form.Item>

          <Form.Item
            label="Email Address"
            name="email"
            rules={[
              { required: true, message: "Please enter email" },
              { type: "email", message: "Invalid email" },
            ]}
          >
            <Input placeholder="name@athletrack.ph" disabled />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item
              label="Role"
              name="role"
              rules={[{ required: true, message: "Select a role" }]}
            >
              <Select
                placeholder="Select role"
                options={[
                  { label: "Coach", value: "Coach" },
                  { label: "Athlete", value: "Athlete" },
                  { label: "Admin", value: "Admin" },
                  { label: "User", value: "User" },
                ]}
              />
            </Form.Item>

            <Form.Item label="Phone" name="phone">
              <Input placeholder="+63 9XX XXX XXXX" disabled />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item label="PUP ID" name="pupId">
              <Input placeholder="e.g. PUP-23-001" disabled />
            </Form.Item>

            <Form.Item label="Sport" name="sport">
              <Input placeholder="e.g. Basketball" />
            </Form.Item>

            <Form.Item
              label="Team"
              name="team"
              dependencies={['sport']}
              rules={[{ required: false }]}
            >
              <Select
                placeholder="Select team"
                /* Send database enum values directly: "men's" or "women's" */
                options={allowedTeamsForSport(editSportValue).map((t) => ({
                  label: t === "men's" ? "Men's" : "Women's",
                  value: t, // "men's" or "women's" - matches database enum
                }))}
              />
            </Form.Item>
          </div>

          {/* Admin Panel Access Toggle - Only show for coaches */}
          <Form.Item
            name="isAdminPanelAllowed"
            valuePropName="checked"
            label={
              <span className="flex items-center gap-2">
                Allow Admin Panel Access
                <Tooltip title="When enabled, this user can access the admin web dashboard. Useful for coaches who need to view reports and manage athletes.">
                  <QuestionCircleOutlined className="text-gray-400 cursor-help" />
                </Tooltip>
              </span>
            }
          >
            <Switch
              checkedChildren="Yes"
              unCheckedChildren="No"
              style={{ backgroundColor: editForm.getFieldValue('isAdminPanelAllowed') ? BRAND.maroon : undefined }}
            />
          </Form.Item>
          
          {/* Show Admin Coach badge if applicable */}
          {editForm.getFieldValue('role') === 'Coach' && editForm.getFieldValue('isAdminPanelAllowed') && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-amber-800 text-sm font-medium">
                🏅 This user is an <strong>Admin Coach</strong> - they can access both the mobile app and admin panel.
              </span>
            </div>
          )}
        </Form>
      </Modal>

      {/* ---------- DELETE CONFIRM MODAL (custom) ---------- */}
      {showConfirm && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />

          {/* Modal card */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 animate-fadeIn">
            <h3
              className="text-xl font-bold mb-2 text-center"
              style={{ color: BRAND.maroon }}
            >
              Confirm Delete
            </h3>

            <p className="text-gray-700 text-sm text-center mb-6">
              Are you sure you want to permanently delete this user’s profile?
              <br />
              <span className="text-red-500 font-medium">
                This action cannot be undone.
              </span>
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
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* minor custom styles */}
      <style>{`
        .side-seg { padding: 2px; font-size: 12px; }
        .side-seg .ant-segmented-item { border-radius: 9999px; padding: 2px 8px; }
        .side-seg .ant-segmented-item-label { display:inline-flex; gap:6px; align-items:center; font-size:12px; }
        .side-seg .ant-segmented-item-selected { background:#efe7e7; color:${BRAND.maroon}; font-weight:600; }
      `}</style>
    </div>
  );
}
