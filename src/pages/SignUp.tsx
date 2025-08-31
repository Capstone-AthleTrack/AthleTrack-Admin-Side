import { Card, Form, Input, Button, Typography, Divider } from "antd";
import { MailOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { BRAND } from "@/brand";
interface SignUpFormValues {
  fullName: string;
  email: string;
  password: string;
  confirm: string;
}

export default function SignUp() {
  const [form] = Form.useForm();

  const onFinish = (values: SignUpFormValues) => {
    console.log(values);
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
      <div aria-hidden className="absolute -top-10 -left-10 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: BRAND.yellow }} />
      <div aria-hidden className="absolute bottom-16 right-10 w-48 h-48 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "#fff" }} />
        <div className="relative z-10 flex flex-col items-center gap-5 px-6">
          <img
            src="/images/athletrack_logo.png"
            alt="AthleTrack"
            className="
              w-[300px]          /* base size for smaller screens */
              sm:w-[400px]       /* ≥640px */
              md:w-[550px]       /* ≥768px */
              lg:w-[700px]       /* ≥1024px */
              xl:w-[900px]       /* ≥1280px */
              2xl:w-[1100px]     /* ≥1536px */
              max-w-full         /* never overflow container */
              h-auto             /* keep aspect ratio */
              drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)]
              transition-transform duration-300
              hover:scale-[1.02]
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
            bodyStyle={{
              padding: 28,
              background: "linear-gradient(180deg,#ffffff,#fff7d6)",
              borderRadius: 16,
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
            >
              Create Account
            </Button>

            <Divider style={{ margin: "18px 0 10px" }} />
            
            <div className="text-center mt-3 text-xs" style={{ fontSize: "15px"}}>
              Already have an account?{" "}
              <a href="/sign-in" className="font-semibold hover:underline" style={{ color: BRAND.maroon, fontSize: "15px"}}>
                Back to sign in.
              </a>
            </div>
          </Form>
        </Card>
      </div>
    </div>
  );
}
