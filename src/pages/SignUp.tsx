import { useState } from "react";       
import { Card, Form, Input, Button, Typography, Divider, App as AntdApp } from "antd";
import { MailOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { BRAND } from "@/brand";
import { postSignUpBootstrap, submitAdminRequest } from "@/services/admin-approval";
import { supabaseUrl, supabaseAnonKey } from "@/core/supabase";
/* NEW: use supabase session to send a real JWT when available */
import supabase from "@/core/supabase";
/* Optional: if you later want to condition on role more strictly, you can import isAdmin from admin-approval */

interface SignUpFormValues {
  fullName: string;
  pupId: string;
  email: string;
  password: string;
  confirm: string;
}

type CreateAdminResponse =
  | { ok: true; id: string }
  | { error: string; details?: string };


// Gmail-only helper (client-side validation)
const isGmail = (e?: string | null) =>
  !!e && e.toLowerCase().trim().endsWith("@gmail.com");

// Strong password helper (≥12 chars, 1 upper, 1 lower, 1 digit, 1 special)
const isStrongPassword = (p?: string | null) =>
  !!p && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{12,}$/.test(p);

export default function SignUp() {
  const [form] = Form.useForm<SignUpFormValues>();
  const [loading, setLoading] = useState(false);
  // AntD v5 context-bound message API so toasts render
  const { message } = AntdApp.useApp();

  async function handleSignUp(values: SignUpFormValues) {
    try {
      setLoading(true);

      // Basic Gmail-only guard (nice UX; DB/Edge enforces this as well)
      const email = (values.email ?? "").trim().toLowerCase();
      if (!isGmail(email)) {
        message.error("Please use a @gmail.com address.");
        return;
      }

      // Client-side strong password check (server also enforces)
      if (!isStrongPassword(values.password)) {
        message.error(
          "Password must be at least 12 characters and include upper, lower, digit, and special character."
        );
        return;
      }

      // Decide desired role:
      // - If caller has a signed-in session token (and is an admin), they can create admin.
      // - Otherwise, fall back to athlete so sign-up succeeds with pending status by default.
      let desiredRole: "admin" | "coach" | "athlete" = "athlete";
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s.session?.access_token || null;
        if (token) {
          // If a user is signed in (e.g., an existing admin creating another admin),
          // allow the request to ask for 'admin'; server will enforce.
          desiredRole = "admin";
        }
      } catch {
        desiredRole = "athlete";
      }

      // Build headers — include user JWT if present; else anon key.
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token || supabaseAnonKey;

      // Create user via secure Edge Function (no direct browser sign-up)
      // Use ABSOLUTE Supabase URL to avoid relative /functions calls to the app origin.
      const resp = await fetch(`${supabaseUrl}/functions/v1/create_user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Send a real Authorization header: user JWT if signed in (admin flow), else anon key
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          full_name: values.fullName,
          pupId: values.pupId, // harmless if backend ignores
          email,               // normalized to lowercase
          password: values.password,
          role: desiredRole,   // "admin" when an admin is logged in; otherwise "athlete"
        }),
      });

      let data: CreateAdminResponse | null = null;
      try {
        data = (await resp.json()) as CreateAdminResponse;
      } catch {
        data = null;
      }

      if (!resp.ok) {
        const err =
          data && typeof data === "object" && "error" in data
            ? (data as { error: string; details?: string }).details
              ? `${(data as { error: string; details?: string }).error}: ${(data as { error: string; details?: string }).details}`
              : (data as { error: string }).error
            : `Failed to create account (HTTP ${resp.status})`;
        message.error(err);
        return;
      }

      // Success. If created as athlete (most cases), inform the user about pending approval.
      if (desiredRole === "admin") {
        message.success("Admin created. You may now sign in.");
      } else {
        message.success("Account created. Your access is pending admin approval.");
      }
      form.resetFields();

      // Optional legacy hooks (safe no-ops if not applicable)
      try { await postSignUpBootstrap(); } catch { /* ignore */ }
      try { await submitAdminRequest();   } catch { /* ignore */ }

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const onFinish = (values: SignUpFormValues) => handleSignUp(values);

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
        <div className="relative z-10 flex flex-col items-center gap-5 px-6">
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
      </div>

      {/* right side - sign up */}
      <div className="relative flex items-center justify-center bg-gradient-to-b from-white to-[#fff8cc] px-4 sm:px-6">
        {/* corner dots */}
        <div className="absolute top-4 right-4 flex gap-1" aria-hidden>
          <span className="w-2 h-2 rounded-full" style={{ background: BRAND.maroon }} />
          <span className="w-2 h-2 rounded-full" style={{ background: BRAND.yellow }} />
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
              style={{ margin: 0, color: BRAND.maroon, letterSpacing: 0.2 }}
            >
              Create Admin Account
            </Typography.Title>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 15, color: "rgba(0,0,0,0.65)" }}
            >
              Set up your admin credentials.
            </Typography.Text>
          </div>

        <Divider style={{ margin: "12px 0 18px" }} />

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            label={<span className="text-[17px] font-medium">Full Name</span>}
            name="fullName"
            rules={[{ required: true, message: "Full name is required" }]}
            style={{ marginBottom: 14 }}
          >
            <Input
              size="large"
              prefix={<UserOutlined className="text-black/40 mr-1" />}
              placeholder="Juan Dela Cruz"
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
            label={<span className="text-[17px] font-medium">PUP ID</span>}
            name="pupId"
            rules={[{ required: true, message: "PUP ID is required" }]}
            style={{ marginBottom: 14 }}
          >
            <Input
              size="large"
              prefix={<UserOutlined className="text-black/40 mr-1" />}
              placeholder="e.g., 20XX-12345-MN-0"
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
            label={<span className="text-[17px] font-medium">Email Address</span>}
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

          <Form.Item
            label={<span className="text-[17px] font-medium">Confirm Password</span>}
            name="confirm"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Please confirm your password" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject(new Error("Passwords do not match"));
                },
              }),
            ]}
            style={{ marginBottom: 18 }}
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
            Create Account
          </Button>

          <Divider style={{ margin: "18px 0 10px" }} />

          <div className="text-center mt-3 text-xs" style={{ fontSize: "15px" }}>
            Already have an account?{" "}
            <a
              href="/sign-in"
              className="font-semibold hover:underline"
              style={{ color: BRAND.maroon, fontSize: "15px" }}
            >
              Back to sign in.
            </a>
          </div>
        </Form>
        </Card>
      </div>
    </div>
  );
}
