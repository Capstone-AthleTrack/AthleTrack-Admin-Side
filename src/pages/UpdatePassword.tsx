import { useState, useEffect, useCallback } from "react";
import { Card, Form, Input, Button, Typography, Divider, Spin, App as AntdApp } from "antd";
import { LockOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { BRAND } from "@/brand";
import { supabase } from "@/core/supabase";

interface UpdatePasswordValues {
  password: string;
  confirmPassword: string;
}

export default function UpdatePassword() {
  const [form] = Form.useForm<UpdatePasswordValues>();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  
  // Use AntD App context for React 19 compatibility
  const { message } = AntdApp.useApp();

  // Check if user arrived via magic link (password recovery mode)
  useEffect(() => {
    const checkSession = async () => {
      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log("Auth event:", event);
        if (event === "PASSWORD_RECOVERY") {
          setIsRecoveryMode(true);
          setChecking(false);
        } else if (event === "SIGNED_IN" && session) {
          // User might already be in recovery mode from URL hash
          setIsRecoveryMode(true);
          setChecking(false);
        }
      });

      // Also check current session (in case page was refreshed)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsRecoveryMode(true);
      }
      setChecking(false);

      return () => subscription.unsubscribe();
    };

    checkSession();
  }, []);

  const onFinish = useCallback(async (values: UpdatePasswordValues) => {
    if (values.password !== values.confirmPassword) {
      message.error("Passwords do not match!");
      return;
    }

    if (values.password.length < 8) {
      message.error("Password must be at least 8 characters!");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) throw error;

      setSuccess(true);
      message.success("Password updated successfully!");

      // Sign out after a short delay and redirect to login
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/sign-in");
      }, 2000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update password";
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [message, navigate]);

  // Loading state while checking auth
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-[#fff8cc]">
        <Spin size="large" />
      </div>
    );
  }

  // Not in recovery mode - show error
  if (!isRecoveryMode && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-[#fff8cc] px-4">
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
          <div className="flex flex-col items-center text-center">
            <Typography.Title level={2} style={{ color: BRAND.maroon, margin: "0 0 16px" }}>
              Invalid Reset Link
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 15 }}>
              This password reset link is invalid or has expired. 
              Please request a new reset link.
            </Typography.Text>
            <Divider style={{ margin: "24px 0 16px" }} />
            <Button
              type="primary"
              onClick={() => navigate("/reset-password")}
              style={{
                background: BRAND.maroon,
                border: "none",
                borderRadius: 20,
                height: 40,
                fontWeight: 600,
              }}
            >
              Request New Link
            </Button>
            <div className="mt-4">
              <a
                href="/sign-in"
                className="font-semibold hover:underline"
                style={{ color: BRAND.maroon, fontSize: "14px" }}
              >
                Back to sign in
              </a>
            </div>
          </div>
        </Card>
      </div>
    );
  }

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

      {/* right side - update password form */}
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
          {success ? (
            <div className="text-center py-6">
              <CheckCircleOutlined 
                style={{ fontSize: 48, color: "#52c41a" }} 
                className="mb-4"
              />
              <Typography.Title level={4} style={{ color: BRAND.maroon, margin: "16px 0 8px" }}>
                Password Updated!
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                Your password has been changed successfully. 
                Redirecting to sign in...
              </Typography.Text>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-3">
                <Typography.Title
                  level={1}
                  style={{ margin: 0, color: BRAND.maroon, letterSpacing: 0.2 }}
                >
                  Set New Password
                </Typography.Title>
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 15, color: "rgba(0,0,0,0.65)" }}
                >
                  Enter your new password below.
                </Typography.Text>
              </div>

              <Divider style={{ margin: "12px 0 18px" }} />

              <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
                <Form.Item
                  label={<span className="text-[17px] font-medium">New Password</span>}
                  name="password"
                  rules={[
                    { required: true, message: "Password is required" },
                    { min: 8, message: "Password must be at least 8 characters" },
                  ]}
                  style={{ marginBottom: 16 }}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined className="text-black/40 mr-1" />}
                    placeholder="Enter new password"
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
                  name="confirmPassword"
                  rules={[
                    { required: true, message: "Please confirm your password" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue("password") === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error("Passwords do not match!"));
                      },
                    }),
                  ]}
                  style={{ marginBottom: 16 }}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined className="text-black/40 mr-1" />}
                    placeholder="Confirm new password"
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
                  Update Password
                </Button>

                <Divider style={{ margin: "18px 0 10px" }} />

                <div className="text-center mt-3" style={{ fontSize: "15px" }}>
                  <a
                    href="/sign-in"
                    className="font-semibold hover:underline"
                    style={{ color: BRAND.maroon, fontSize: "15px" }}
                  >
                    Back to sign in
                  </a>
                </div>
              </Form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

