import { useState } from "react";   
import { Card, Form, Input, Button, Typography, Divider, App as AntdApp } from "antd";
import { MailOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { BRAND } from "@/brand";

/* shared supabase singleton */
import supabase from "@/core/supabase";

import {
  postSignUpBootstrap,
  submitAdminRequest,
  getMyProfile,
} from "@/services/admin-approval";

interface SignInFormValues {
  email: string;
  password: string;
}

/* Types to avoid `any` while staying compatible with both schemas */
type DBRole = "admin" | "coach" | "athlete" | "user" | null;
type DBStatus =
  | "pending"
  | "accepted"
  | "decline"
  | "disabled"
  | "active"
  | "suspended"
  | null;
type ProfileCompat = {
  role: DBRole;
  status?: DBStatus;
  is_active?: boolean | null; // legacy boolean column
};

// Normalize mixed/legacy status values into the new set
function normalizeStatus(
  s: DBStatus | string | null | undefined
): "pending" | "accepted" | "decline" | "disabled" {
  const v = String(s ?? "").toLowerCase();
  if (v === "accepted" || v === "active") return "accepted";
  if (v === "decline" || v === "denied" || v === "suspended") return "decline";
  if (v === "disabled") return "disabled";
  return "pending";
}

// Gmail-only helper (client-side validation)
const isGmail = (e?: string | null) =>
  !!e && e.toLowerCase().trim().endsWith("@gmail.com");

export default function SignIn() {
  const [form] = Form.useForm<SignInFormValues>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  // AntD v5 context-bound message API (so toasts actually render)
  const { message } = AntdApp.useApp();

  async function handleSignIn(values: SignInFormValues) {
    setLoading(true);
    try {
      // 0) Basic Gmail-only guard (nice UX; DB also enforces this)
      const email = (values.email ?? "").trim().toLowerCase();
      if (!isGmail(email)) {
        message.error("Please use a @gmail.com address.");
        return;
      }

      // 1) Sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: values.password,
      });
      if (error) {
        message.error(error.message || "Sign-in failed");
        return;
      }

      const user = data.user;
      if (!user) {
        message.error("Unauthorized");
        return;
      }

      // Extra defense: if somehow not gmail, end session gracefully
      if (!isGmail(user.email ?? "")) {
        await supabase.auth.signOut();
        message.error("Only @gmail.com addresses are allowed.");
        return;
      }

      // 3) Load current profile FIRST so we never upsert a wrong role
      const profRaw = await getMyProfile();
      const prof = (profRaw ?? null) as ProfileCompat | null;

      // Pull possible metadata we can mirror into profiles on first login
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const metaFullName =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.fullName === "string" && meta.fullName) ||
        "";
      const metaPupId =
        (typeof meta.pup_id === "string" && meta.pup_id) ||
        (typeof meta.pupId === "string" && meta.pupId) ||
        "";

      // 3a) Record device without touching role/status (avoid on_conflict errors).
      //     If profile doesn't exist yet, also persist email, full_name, pup_id from metadata.
      try {
        if (prof) {
          // Safe UPDATE path – DO NOT set role/status here
          const patch: Record<string, unknown> = { last_signup_device: "web" };
          if (metaFullName) patch.full_name = metaFullName;
          if (metaPupId) patch.pup_id = metaPupId;
          await supabase.from("profiles").update(patch).eq("id", user.id);
        } else {
          // Profile missing (rare for admins) → do a minimal upsert with NO role
          const row: Record<string, unknown> = {
            id: user.id,
            email: (user.email ?? "").toLowerCase(),
            last_signup_device: "web",
          };
          if (metaFullName) row.full_name = metaFullName;
          if (metaPupId) row.pup_id = metaPupId;
          await supabase.from("profiles").upsert(row, { onConflict: "id" });
          // If your bootstrap flow is required elsewhere, keep it behind the guard:
          try {
            await postSignUpBootstrap();
          } catch {
            /* no-op */
          }
        }
      } catch {
        // Never block sign-in on this bookkeeping write
      }

      // 4) Check profile role/status (supports both `status` and legacy `is_active`)
      const role: DBRole = prof?.role ?? "user";
      const statusNormalized = normalizeStatus(
        prof?.status ?? (prof?.is_active ? "accepted" : "pending")
      );

      // Debug info (console only, no UI changes)
      console.info("[SignIn] gate check:", { role, status: statusNormalized });

      // Enforce web = admin-only. If not admin, sign out and block here.
      if (role !== "admin") {
        try {
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
        message.error("This web app is for admins only. Please use the mobile app.");
        return;
      }

      // If admin but not yet approved, keep prior approval flow.
      if (statusNormalized !== "accepted") {
        try {
          await submitAdminRequest();
        } catch {
          /* no-op */
        }
        message.info("Your admin account is pending approval.");
        // Stay on sign-in page; do not navigate to dashboard.
        return;
      }

      // 4a) Tiny stabilization step: wait until session is fully hydrated before navigating,
      // to avoid any race with components that read the session immediately.
      try {
        let tries = 0;
        for (; tries < 5; tries++) {
          const { data: s } = await supabase.auth.getSession();
          if (s.session?.user?.id) break;
          await new Promise((r) => setTimeout(r, 150));
        }
      } catch {
        /* ignore */
      }

      // 5) Admin & accepted → proceed
      navigate("/dashboard");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const onFinish = (values: SignInFormValues) => {
    // route all logic through handleSignIn
    return handleSignIn(values);
  };

  return (
    <div className="min-h-screen w-screen grid grid-cols-1 lg:grid-cols-[60%_40%] font-sans overflow-hidden">
      {/* left side */}
      <div className="relative hidden lg:flex items-center justify-center bg-[#800000]">
        {/* dotted pattern */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(#ffffff66 1px, transparent 1px), radial-gradient(#ffffff33 1px, transparent 1px)",
            backgroundSize: "24px 24px, 24px 24px",
            backgroundPosition: "0 0, 12px 12px",
          }}
        />
        {/* glow blobs */}
        <div
          aria-hidden
          className="absolute -top-10 -left-10 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: BRAND.yellow }}
        />
        <div
          aria-hidden
          className="absolute bottom-16 right-10 w-48 h-48 rounded-full blur-3xl opacity-10 pointer-events-none"
          style={{ background: "#fff" }}
        />

        <img
          src="/images/athletrack_logo.png"
          alt="AthleTrack"
          className="
            w-[300px] sm:w-[400px] md:w-[550px] lg:w-[700px] xl:w-[900px] 2xl:w-[1100px]
            max-w-full h-auto
            scale-90
            drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)]
            transition-transform duration-300 hover:scale-[1.00]
          "
        />
      </div>

      {/* right side - sign in */}
      <div className="relative flex items-center justify-center bg-gradient-to-b from-white to-[#fff7d6] px-4 sm:px-6">
        {/* corner dots */}
        <div className="absolute top-4 right-4 flex gap-1" aria-hidden>
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: BRAND.maroon }}
          />
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: BRAND.yellow }}
          />
          <span className="w-2 h-2 rounded-full bg-black/80" />
        </div>

        <Card
          className="w-[min(92vw,480px)] shadow-2xl rounded-2xl border-0"
          styles={{
            body: {
              padding: 28,
              background: "linear-gradient(180deg,#ffffff,#fff7d6)",
              borderRadius: 16,
            },
          }}
        >
          <div className="flex flex-col items-center text-center mb-3">
            <Typography.Title
              level={1}
              style={{
                margin: 0,
                color: BRAND.maroon,
                letterSpacing: 0.2,
              }}
            >
              AthleTrack Admin
            </Typography.Title>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 15, color: "rgba(0,0,0,0.65)" }}
            >
              Sign in to access your dashboard.
            </Typography.Text>
          </div>

          <Divider style={{ margin: "12px 0 18px" }} />

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            requiredMark={false}
          >
            <Form.Item
              label={
                <span className="text-[17px] font-medium">Email Address</span>
              }
              name="email"
              rules={[
                { required: true, message: "Email is required" },
                { type: "email", message: "Enter a valid email" },
              ]}
              style={{ marginBottom: 14 }}
            >
              <Input
                size="large"
                prefix={<MailOutlined className="text-black/40 mr-1" />}
                placeholder="you@athletrack.com"
                className="rounded-xl"
                style={{
                  background: "#FFE681",
                  borderRadius: 6,
                  height: 38,
                  borderColor: "transparent",
                }}
              />
            </Form.Item>

            <Form.Item
              label={<span className="text-[17px] font-medium">Password</span>}
              name="password"
              rules={[{ required: true, message: "Password is required" }]}
              style={{ marginBottom: 14 }}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined className="text-black/40 mr-1" />}
                placeholder="••••••••"
                className="rounded-xl"
                style={{
                  background: "#FFE681",
                  borderRadius: 6,
                  height: 38,
                  borderColor: "transparent",
                }}
              />
            </Form.Item>

            <Button
              htmlType="submit"
              type="primary"
              className="w-full !h-11 !rounded-full flex items-center justify-center"
              style={{
                fontSize: "17px",
                fontWeight: 600,
                background: BRAND.maroon,
                border: "none",
                boxShadow: "0 8px 14px rgba(128,0,0,0.25)",
              }}
              loading={loading}
            >
              Log In
            </Button>

            <Divider style={{ margin: "18px 0 10px" }} />

            <div className="text-center mt-3">
              <a
                href="/reset-password"
                className="font-semibold hover:underline"
                style={{ color: BRAND.maroon, fontSize: "15px" }}
              >
                Forgot Password?
              </a>
            </div>
          </Form>

          <div className="text-center" style={{ fontSize: "15px" }}>
            New here?{" "}
            <a
              href="/sign-up"
              className="font-semibold hover:underline"
              style={{ color: BRAND.maroon, fontSize: "15px" }}
            >
              Create an admin account.
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
