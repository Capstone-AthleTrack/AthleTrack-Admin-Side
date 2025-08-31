// src/pages/Settings.tsx
import { useState } from "react";
import {
  Form,
  Input,
  Button,
  message,
  Upload,
  Card,
  Tabs,
  Divider,
  Avatar,
} from "antd";
import {
  UploadOutlined,
  UserOutlined,
  MailOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import NavBar from "@/components/NavBar";
import { BRAND } from "@/brand";

const { Item } = Form;

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const navigate = useNavigate();

  // ----- Handlers -----
  const handleSaveProfile = async (values: any) => {
    setLoading(true);
    try {
      console.log("Profile values:", values);
      message.success("Profile updated successfully!");
    } catch {
      message.error("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSecurity = async (values: any) => {
    setLoading(true);
    try {
      console.log("Security values:", values);
      message.success("Password changed successfully!");
    } catch {
      message.error("Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  // ----- Upload (preview only) -----
  const uploadProps = {
    beforeUpload: (file: File) => {
      const reader = new FileReader();
      reader.onload = () => setAvatarUrl(reader.result as string);
      reader.readAsDataURL(file);
      return false;
    },
    maxCount: 1,
    accept: "image/*",
    showUploadList: false,
  };

  // ----- Tabs content -----
  const ProfileTab = (
    <Card className="shadow-md bg-white/90 backdrop-blur rounded-2xl">
      <div className="flex items-center gap-6 mb-6">
        <Avatar size={80} src={avatarUrl} icon={<UserOutlined />} />
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />}>Upload New Avatar</Button>
        </Upload>
      </div>
      <Form layout="vertical" onFinish={handleSaveProfile}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Item label="First Name" name="firstName" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} placeholder="Juan" />
          </Item>
          <Item label="Last Name" name="lastName" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} placeholder="Dela Cruz" />
          </Item>
          <Item label="Username" name="username" rules={[{ required: true }]}>
            <Input placeholder="athletrack_admin" />
          </Item>
          <Item
            label="Email"
            name="email"
            rules={[{ required: true }, { type: "email" }]}
          >
            <Input prefix={<MailOutlined />} placeholder="admin@example.com" />
          </Item>
        </div>
        <Divider />
        <div className="flex gap-3 justify-end">
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            style={{ background: BRAND.maroon, borderColor: BRAND.maroon }}
          >
            Save Profile
          </Button>
        </div>
      </Form>
    </Card>
  );

  const SecurityTab = (
    <Card className="shadow-md bg-white/90 backdrop-blur rounded-2xl">
      <Form layout="vertical" onFinish={handleSaveSecurity}>
        <Item label="Current Password" name="currentPassword" rules={[{ required: true }]}>
          <Input.Password prefix={<LockOutlined />} />
        </Item>
        <Item label="New Password" name="newPassword" rules={[{ required: true }]}>
          <Input.Password prefix={<LockOutlined />} />
        </Item>
        <Item
          label="Confirm New Password"
          name="confirmNew"
          dependencies={["newPassword"]}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                return Promise.reject(new Error("Passwords do not match"));
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} />
        </Item>
        <Divider />
        <div className="flex gap-3 justify-end">
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            style={{ background: BRAND.maroon, borderColor: BRAND.maroon }}
          >
            Change Password
          </Button>
        </div>
      </Form>
    </Card>
  );



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300">
      <NavBar />
      <section className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: BRAND.maroon }}>
            Settings
          </h1>
          <p className="text-gray-600">Manage your profile and security.</p>
        </div>
        <Tabs
          defaultActiveKey="profile"
          items={[
            { key: "profile", label: "Profile", children: ProfileTab },
            { key: "security", label: "Security", children: SecurityTab },
          ]}
        />
      </section>
    </div>
  );
}
