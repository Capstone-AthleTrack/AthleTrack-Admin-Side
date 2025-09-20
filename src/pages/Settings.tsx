/* src/pages/Settings.tsx */
import { useEffect, useState } from "react";
import {
  Form,
  Input,
  Button,
  Upload,
  Card,
  Tabs,
  Divider,
  Avatar,
  Modal,
  message,
} from "antd";
import {
  UploadOutlined,
  UserOutlined,
  MailOutlined,
  LockOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import NavBar from "@/components/NavBar";
import { BRAND } from "@/brand";

/* ── services (wired, no UI change) ── */
import { getMyProfile, updateMyProfile } from "@/services/profile";
import { changePassword } from "@/services/authSecurity";

const { Item } = Form;

/* ───────── TYPES ───────── */
interface ProfileValues {
  fullName: string;
  email: string;
  phone: string;
  pupId: string;        // ← new field for PUP ID
}
interface SecurityValues {
  currentPassword: string;
  newPassword: string;
  confirmNew: string;
}

/* ───────── MOCK DATA ───────── */
const mockProfile: ProfileValues = {
  fullName: "Juan Dela Cruz",
  email: "admin@example.com",
  phone: "09345678234",
  pupId: "",            // default empty
};

export default function Settings() {
  const navigate = useNavigate();

  /* state */
  const [avatarUrl, setAvatarUrl] = useState<string>();           // live preview
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string>(); // last-saved
  const [savedProfile, setSavedProfile] = useState<ProfileValues>(mockProfile);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profileForm] = Form.useForm<ProfileValues>();

  /* AntD helpers */
  const [msgApi, msgCtx] = message.useMessage();
  const [modal, modalCtx] = Modal.useModal();
  message.config({ top: 72 });

  /* preload data */
  useEffect(() => {
    // Load real profile from Supabase
    (async () => {
      try {
        const p = await getMyProfile(); // { full_name, email, pup_id, phone }
        const mapped: ProfileValues = {
          fullName: p.full_name ?? "",
          email: (p.email ?? "") as string,
          phone: p.phone ?? "",
          pupId: p.pup_id ?? "",
        };
        setSavedProfile(mapped);
      } catch (e) {
        // keep mock if fail
        msgApi.error((e as Error)?.message || "Failed to load profile.");
      }
    })();
  }, [msgApi]);

  useEffect(() => {
    profileForm.setFieldsValue(savedProfile);
    setAvatarUrl(savedAvatarUrl);
  }, [profileForm, savedProfile, savedAvatarUrl]);

  /* ───────── API handlers ───────── */
  const saveProfile = async (values: ProfileValues) => {
    setLoading(true);
    try {
      // Persist to DB (email is read-only on backend; do not update it)
      await updateMyProfile({
        full_name: values.fullName,
        phone: values.phone || null,
        pup_id: values.pupId || null,
      });
      msgApi.success("Profile updated successfully!");

      // Persist new “saved” snapshot (keep backend email mirror)
      setSavedProfile({
        fullName: values.fullName,
        email: savedProfile.email, // ignore any edited email in UI; keep server email
        phone: values.phone,
        pupId: values.pupId,
      });
      setSavedAvatarUrl(avatarUrl ?? "");

      setIsEditing(false);
    } catch (e) {
      msgApi.error((e as Error)?.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const saveSecurity = async (values: SecurityValues) => {
    setLoading(true);
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      msgApi.success("Password changed successfully!");
    } catch (e) {
      msgApi.error((e as Error)?.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  /* ───────── Confirm flows ───────── */
  const confirmSaveProfile = () => {
    if (!profileForm.isFieldsTouched(true)) {
      msgApi.info("Edit at least one field before saving.");
      return;
    }
    modal.confirm({
      title: "Are you sure you want to save these changes?",
      icon: <ExclamationCircleOutlined />,
      centered: true,
      okText: "Save",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const values = await profileForm.validateFields();
          await saveProfile(values);
        } catch {
          return Promise.reject();
        }
      },
    });
  };
  const confirmSaveSecurity = (values: SecurityValues) =>
    modal.confirm({
      title: "Change your password?",
      icon: <ExclamationCircleOutlined />,
      centered: true,
      okText: "Change",
      cancelText: "Cancel",
      onOk: () => saveSecurity(values),
    });

  /* ───────── Upload (preview-only) ───────── */
  const uploadProps = {
    beforeUpload: (file: File) => {
      const reader = new FileReader();
      reader.onload = () => setAvatarUrl(reader.result as string); // live preview
      reader.readAsDataURL(file);
      return false;
    },
    maxCount: 1,
    accept: "image/*",
    showUploadList: false,
  };

  /* ───────── Cancel handler ───────── */
  const handleCancelEdit = () => {
    profileForm.setFieldsValue(savedProfile); // revert text fields
    setAvatarUrl(savedAvatarUrl);             // revert avatar
    profileForm.resetFields();                // clear validation states
    setIsEditing(false);
  };

  /* ───────── PROFILE TAB ───────── */
  const ProfileTab = (
    <Card className="shadow-md bg-white/90 backdrop-blur rounded-2xl p-8">
      <Form form={profileForm} layout="vertical">
        {/* Avatar */}
        <div className="flex items-center gap-6 mb-8">
          <Avatar size={96} src={avatarUrl || savedAvatarUrl} icon={<UserOutlined />} />
          {isEditing && (
            <Upload {...uploadProps}>
              <Button size="large" icon={<UploadOutlined />}>
                Upload New Avatar
              </Button>
            </Upload>
          )}
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Item label="Full Name" name="fullName" rules={[{ required: true }]}>
            <Input size="large" prefix={<UserOutlined />} readOnly={!isEditing} />
          </Item>

          <Item
            label="Email"
            name="email"
            rules={[
              { required: true },
              { type: "email", message: "Enter a valid email" },
            ]}
          >
            <Input size="large" prefix={<MailOutlined />} readOnly={!isEditing} />
          </Item>

          <Item
            label="Phone Number"
            name="phone"
            rules={[
              { required: true },
              { pattern: /^(\+?\d{1,3}[- ]?)?\d{10,11}$/, message: "Enter a valid phone number" },
            ]}
          >
            <Input size="large" prefix={<UserOutlined />} readOnly={!isEditing} />
          </Item>

          {/* NEW: PUP ID (optional) */}
          <Item label="PUP ID" name="pupId">
            <Input size="large" prefix={<UserOutlined />} readOnly={!isEditing} />
          </Item>
        </div>

        <Divider className="my-8" />

        {/* Action buttons */}
        <Form.Item shouldUpdate>
          {() => {
            const untouched = !profileForm.isFieldsTouched(true);
            const hasError  = profileForm.getFieldsError().some(f => f.errors.length);
            const saveDisabled = untouched || hasError || loading;

            return (
              <div className="flex gap-3 justify-end">
                {/* Edit / Cancel toggle */}
                <Button
                  size="large"
                  onClick={() => (isEditing ? handleCancelEdit() : setIsEditing(true))}
                >
                  {isEditing ? "Cancel" : "Edit Profile"}
                </Button>

                {isEditing && (
                  <Button
                    size="large"
                    type="primary"
                    loading={loading}
                    disabled={saveDisabled}
                    onClick={confirmSaveProfile}
                    style={{ background: BRAND.maroon, borderColor: BRAND.maroon }}
                  >
                    Save Profile
                  </Button>
                )}
              </div>
            );
          }}
        </Form.Item>
      </Form>
    </Card>
  );

  /* ───────── SECURITY TAB ───────── */
  const SecurityTab = (
    <Card className="shadow-md bg-white/90 backdrop-blur rounded-2xl p-8">
      <Form layout="vertical" onFinish={confirmSaveSecurity}>
        <Item label="Current Password" name="currentPassword" rules={[{ required: true }]}>
          <Input.Password size="large" prefix={<LockOutlined />} />
        </Item>

        <Item label="New Password" name="newPassword" rules={[{ required: true }]}>
          <Input.Password size="large" prefix={<LockOutlined />} />
        </Item>

        <Item
          label="Confirm New Password"
          name="confirmNew"
          dependencies={["newPassword"]}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || getFieldValue("newPassword") === value
                  ? Promise.resolve()
                  : Promise.reject(new Error("Passwords do not match"));
              },
            }),
          ]}
        >
          <Input.Password size="large" prefix={<LockOutlined />} />
        </Item>

        <Divider className="my-8" />

        <div className="flex gap-3 justify-end">
          <Button size="large" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            size="large"
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

  /* ───────── RENDER ───────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300">
      {msgCtx}
      {modalCtx}

      <NavBar />

      <section className="mx-auto w-full max-w-7xl px-8 lg:px-10 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold" style={{ color: BRAND.maroon }}>
            Settings
          </h1>
          <p className="text-gray-600">Manage your profile and security.</p>
        </header>

        <Tabs
          defaultActiveKey="profile"
          size="large"
          tabBarGutter={24}
          items={[
            { key: "profile", label: "Profile", children: ProfileTab },
            { key: "security", label: "Security", children: SecurityTab },
          ]}
        />
      </section>
    </div>
  );
}
