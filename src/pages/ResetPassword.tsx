import { useState, useCallback } from "react";
import { Card, Form, Input, Button, Typography, Divider, App as AntdApp } from "antd";
import { MailOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { BRAND } from "@/brand";
import { supabase } from "@/core/supabase";

interface ResetPasswordValues {
  email: string;
}

export default function ResetPassword() {
  const [form] = Form.useForm<ResetPasswordValues>();
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  // Use AntD App context for React 19 compatibility
  const { message } = AntdApp.useApp();

  const onFinish = useCallback(async (values: ResetPasswordValues) => {
    setLoading(true);
    try {
      const email = values.email?.trim().toLowerCase();
      if (!email) {
        message.error("Please enter your email address");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) {
        // Log for debugging but don't reveal to user (security best practice)
        console.error("Reset error:", error);
      }

      // Always show success message (don't reveal if email exists or not)
      setEmailSent(true);
      message.success("If that email is registered, we've sent a reset link!");
    } catch (err) {
      console.error("Reset failed:", err);
      message.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [message]);

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
              scale-90               /* ← global shrink */
              drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)]
              transition-transform duration-300 hover:scale-[1.00]
            "
          />
        </div>
      </div>

      {/* right side - reset password */}
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
            }
          }}
        >
          <div className="flex flex-col items-center text-center mb-3">
            <Typography.Title
              level={1}
              style={{ margin: 0, color: BRAND.maroon, letterSpacing: 0.2 }}
            >
              Reset Password
            </Typography.Title>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 15, color: "rgba(0,0,0,0.65)" }}
            >
              Enter your email to receive a reset link.
            </Typography.Text>
          </div>

          <Divider style={{ margin: "12px 0 18px" }} />

          {emailSent ? (
            <div className="text-center py-6">
              <CheckCircleOutlined 
                style={{ fontSize: 48, color: "#52c41a" }} 
                className="mb-4"
              />
              <Typography.Title level={4} style={{ color: BRAND.maroon, margin: "16px 0 8px" }}>
                Check Your Email
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                We've sent a password reset link to your email address. 
                Click the link in the email to set a new password.
              </Typography.Text>
              <Divider style={{ margin: "24px 0 16px" }} />
              <Button
                type="link"
                onClick={() => {
                  setEmailSent(false);
                  form.resetFields();
                }}
                style={{ color: BRAND.maroon, fontWeight: 600 }}
              >
                Didn't receive it? Try again
              </Button>
              <div className="mt-3">
                <a
                  href="/sign-in"
                  className="font-semibold hover:underline"
                  style={{ color: BRAND.maroon, fontSize: "15px" }}
                >
                  Back to sign in
                </a>
              </div>
            </div>
          ) : (
            <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
              <Form.Item
                label={<span className="text-[17px] font-medium">Email Address</span>}
                name="email"
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Enter a valid email" },
                ]}
                style={{ marginBottom: 16 }}
              >
                <Input
                  size="large"
                  prefix={<MailOutlined className="text-black/40 mr-1" />}
                  placeholder="you@gmail.com"
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
                loading={loading}
                className="w-full !h-11 !rounded-full flex items-center justify-center"
                style={{
                  fontSize: "17px",
                  fontWeight: 600,
                  background: BRAND.maroon,
                  border: "none",
                  boxShadow: "0 8px 14px rgba(128,0,0,0.25)",
                }}
              >
                Send Reset Link
              </Button>

              <Divider style={{ margin: "18px 0 10px" }} />

              <div className="text-center mt-3 text-xs" style={{ fontSize: "15px" }}>
                Remembered your password?{" "}
                <a
                  href="/sign-in"
                  className="font-semibold hover:underline"
                  style={{ color: BRAND.maroon, fontSize: "15px" }}
                >
                  Back to sign in.
                </a>
              </div>
            </Form>
          )}
        </Card>
      </div>
    </div>
  );
}
