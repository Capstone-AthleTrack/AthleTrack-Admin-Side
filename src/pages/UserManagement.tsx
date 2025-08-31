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
} from "antd";
import {
  UserOutlined,
  SearchOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
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

/* ---------------- mock data (users only shown by filter) ---------------- */
const mockData: RequestItem[] = [
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
  {
    id: "u-102",
    kind: "Users",
    name: "User Account",
    email: "user2@athletrack.ph",
    deviceName: "Macbook Pro • Chrome",
    issuedAt: dayjs().subtract(1, "day").toISOString(),
    status: "Denied",
    reason: "Suspicious device",
    extra: { role: "Admin" },
  },
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
export default function UserManagement() {
  const [data, setData] = useState<RequestItem[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Add User modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => setData(mockData), []);

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
      .sort((a, b) => dayjs(b.issuedAt).valueOf() - dayjs(a.issuedAt).valueOf());
  }, [data, filter, query]);

  const selected = useMemo(
    () => list.find((d) => d.id === selectedId) ?? null,
    [list, selectedId]
  );

  useEffect(() => {
    if (selectedId && !list.some((d) => d.id === selectedId)) setSelectedId(null);
  }, [filter, query, list, selectedId]);

  // Handlers for Add User
  const openAdd = () => setIsAddOpen(true);
  const closeAdd = () => {
    setIsAddOpen(false);
    form.resetFields();
  };

  const handleAddSubmit = async () => {
    try {
      const values = await form.validateFields();
      const newUser: RequestItem = {
        id: "u-" + Date.now(),
        kind: "Users",
        name: values.name,
        email: values.email,
        deviceName: values.deviceName || undefined,
        issuedAt: new Date().toISOString(),
        status: "Pending",
        extra: {
          role: values.role,
          phone: values.phone || undefined,
          pupId: values.pupId || undefined,
          sport: values.sport || undefined,
        },
      };
      setData((prev) => [newUser, ...prev]); // add to top
      message.success("User added.");
      closeAdd();
      setSelectedId(newUser.id); // auto focus on the new entry
    } catch (e) {
      // validation errors are handled by antd
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-white">
      <NavBar />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* LEFT */}
        <aside className="border-r text-white" style={{ background: BRAND.maroon }}>
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

          <div className="space-y-3 px-4 pb-6 overflow-y-auto max-h=[calc(100dvh-248px)]">
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
                  <div className="text-[11px] text-gray-400 whitespace-nowrap">
                    {dayjs(item.issuedAt).fromNow()}
                  </div>
                  <RightOutlined className="text-gray-300" />
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
                <Empty description="Select a user from the left" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-2xl border p-5 flex flex-wrap items-center gap-4">
                  <Avatar size={72} icon={<UserOutlined />} />
                  <div className="min-w-[220px]">
                    <div className="text-lg font-semibold leading-tight">{selected.name}</div>
                    <div className="text-sm text-gray-500">
                      Role: <span className="font-medium text-gray-700">{selected.extra?.role ?? "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Labeled value={selected.extra?.pupId ?? "—"} label="PUP ID Number" />
                  <Labeled value={selected.extra?.sport ?? "—"} label="Sport" />
                  <Labeled value={selected.name} label="Name" />
                  <Labeled value={selected.email ?? "—"} label="Email Address" />
                  <Labeled value={selected.extra?.phone ?? "—"} label="Phone Number" />
                  <Labeled value={selected.extra?.role ?? "—"} label="Role" />
                  <Labeled value={dayjs(selected.issuedAt).format("MMM D, YYYY")} label="Registration Date" />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-end">
                  <Button danger className="!h-10 !rounded-xl px-5">Delete Profile</Button>
                  <Button
                    type="primary"
                    className="!h-10 !rounded-xl px-5"
                    style={{ background: BRAND.maroon, borderColor: BRAND.maroon }}
                  >
                    Edit Profile
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ADD USER MODAL */}
      <Modal
        title="Add User"
        visible={isAddOpen}           // if you're on antd v5, change to: open={isAddOpen}
        onOk={handleAddSubmit}
        onCancel={closeAdd}
        okText="Save"
        cancelText="Cancel"
        centered
        width={560}
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
          </div>
        </Form>
      </Modal>

      <style>{`
        .side-seg { padding: 2px; font-size: 12px; }
        .side-seg .ant-segmented-item { border-radius: 9999px; padding: 2px 8px; }
        .side-seg .ant-segmented-item-label { display:inline-flex; gap:6px; align-items:center; font-size:12px; }
        .side-seg .ant-segmented-item-selected { background:#efe7e7; color:${BRAND.maroon}; font-weight:600; }
      `}</style>
    </div>
  );
}
