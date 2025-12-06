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
import { changePassword } from "@/services/authSecurity";

/* ── Offline-enabled profile services ── */
import { getMyProfileOffline, updateMyProfileOffline } from "@/services/offline";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/* ── storage/signing (no UI change) ── */
/* IMPORTANT: use the same default import style app-wide to avoid duplicate clients */
import supabase from "@/core/supabase";
import { getVersionedAvatarSrc } from "@/services/avatars";

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
type PendingAvatar = { blob: Blob; fileName: string };

/* ───────── MOCK DATA ───────── */
const mockProfile: ProfileValues = {
  fullName: "Juan Dela Cruz",
  email: "admin@example.com",
  phone: "09345678234",
  pupId: "",            // default empty
};

export default function Settings() {
  const navigate = useNavigate();
  
  /* network status for offline support (pendingSync available for future sync indicator) */
  const { isOnline } = useNetworkStatus();
  void isOnline; // Reserved for future offline indicator

  /* state */
  const [avatarUrl, setAvatarUrl] = useState<string>();           // live preview (data URL or signed URL)
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string>(); // last-saved signed URL
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar>(); // cropped square awaiting save
  const [savedProfile, setSavedProfile] = useState<ProfileValues>(mockProfile);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profileForm] = Form.useForm<ProfileValues>();
  const [securityForm] = Form.useForm();

  /* AntD helpers */
  const [msgApi, msgCtx] = message.useMessage();
  const [modal, modalCtx] = Modal.useModal();
  message.config({ top: 72 });

  /* helpers: square-crop to match circle frame (ensure 1:1) */
  async function cropToSquareJPEG(file: File, targetSize = 512): Promise<PendingAvatar & { previewDataUrl: string }> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objectUrl;
      });

      const side = Math.min(img.width, img.height);
      const sx = Math.max(0, Math.floor((img.width - side) / 2));
      const sy = Math.max(0, Math.floor((img.height - side) / 2));

      const canvas = document.createElement("canvas");
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))), "image/jpeg", 0.92)
      );

      const previewDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const fileName = "avatar_512.jpg";
      return { blob, fileName, previewDataUrl };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /* preload data */
  useEffect(() => {
    // Load real profile from Supabase (with offline caching)
    (async () => {
      try {
        const result = await getMyProfileOffline();
        const p = result.data;
        const mapped: ProfileValues = {
          fullName: p.full_name ?? "",
          email: (p.email ?? "") as string,
          phone: p.phone ?? "",
          pupId: p.pup_id ?? "",
        };
        setSavedProfile(mapped);
        if (result.fromCache && result.isStale) {
          msgApi.info("Showing cached profile data (offline)");
        }
      } catch (e) {
        // keep mock if fail
        msgApi.error((e as Error)?.message || "Failed to load profile.");
      }

      // Load avatar signed URL (keeps bucket private)
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return;

        const { data: prof } = await supabase
          .from("profiles")
          .select("avatar_url, avatar_updated_at")
          .eq("id", uid)
          .maybeSingle();

        const path = prof?.avatar_url;
        const updatedAt = prof?.avatar_updated_at ?? undefined;
        if (path) {
          const signed = await getVersionedAvatarSrc(path, updatedAt);
          if (signed) {
            setSavedAvatarUrl(signed);
            setAvatarUrl(signed);
          }
        }
      } catch {
        // ignore; avatar remains placeholder if not found
      }
    })();
  }, [msgApi]);

  useEffect(() => {
    profileForm.setFieldsValue(savedProfile);
    // keep avatarUrl as-is (live preview) unless nothing selected
    if (!avatarUrl && savedAvatarUrl) setAvatarUrl(savedAvatarUrl);
  }, [profileForm, savedProfile, savedAvatarUrl, avatarUrl]);

  /* ───────── API handlers ───────── */
  const saveProfile = async (values: ProfileValues) => {
    setLoading(true);
    try {
      // Persist text fields (email is read-only on backend; do not update it)
      // Uses offline-aware service that queues updates when offline
      const { queued } = await updateMyProfileOffline({
        full_name: values.fullName,
        phone: values.phone || null,
        pup_id: values.pupId || null,
      });
      
      if (queued) {
        msgApi.info("You're offline. Changes will sync when you're back online.");
      }

      // If an avatar is pending, upload to private Storage and set canonical path
      if (pendingAvatar) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) throw new Error("User not authenticated.");

        // canonical object path in private bucket
        const objectPath = `${uid}/${pendingAvatar.fileName}`;
        const { error: upErr } = await supabase.storage
          .from("avatar")
          .upload(objectPath, pendingAvatar.blob, {
            contentType: "image/jpeg",
            upsert: true,
            cacheControl: "3600",
          });
        if (upErr) throw upErr;

        // Persist canonical path in profiles.avatar_url
        const canonical = `avatar/${objectPath}`;
        const { error: updErr } = await supabase
          .from("profiles")
          .update({ avatar_url: canonical })
          .eq("id", uid);
        if (updErr) throw updErr;

        // Re-fetch avatar_updated_at for proper cache-busting
        const { data: prof2, error: selErr } = await supabase
          .from("profiles")
          .select("avatar_updated_at, avatar_url")
          .eq("id", uid)
          .single();
        if (selErr) throw selErr;

        const signed = await getVersionedAvatarSrc(
          prof2.avatar_url ?? canonical,
          prof2.avatar_updated_at ?? Date.now()
        );
        if (signed) {
          setSavedAvatarUrl(signed);
          setAvatarUrl(signed);
        }
        setPendingAvatar(undefined);
      }

      msgApi.success("Profile updated successfully!");

      // Persist new “saved” snapshot (keep backend email mirror)
      setSavedProfile({
        fullName: values.fullName,
        email: savedProfile.email, // ignore any edited email in UI; keep server email
        phone: values.phone,
        pupId: values.pupId,
      });

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
    if (!profileForm.isFieldsTouched(true) && !pendingAvatar) {
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

  /* ───────── Upload (preview-only UI; we do client-side square crop) ───────── */
  const uploadProps = {
    beforeUpload: async (file: File) => {
      try {
        // Crop to a centered square and scale to 512×512 JPEG (matches circle frame cleanly)
        const { blob, fileName, previewDataUrl } = await cropToSquareJPEG(file, 512);
        setPendingAvatar({ blob, fileName });
        setAvatarUrl(previewDataUrl); // live preview
      } catch (e) {
        msgApi.error((e as Error)?.message || "Failed to process image.");
      }
      return false; // prevent antd from uploading
    },
    maxCount: 1,
    accept: "image/*",
    showUploadList: false,
  };

  /* ───────── Cancel handler ───────── */
  const handleCancelEdit = () => {
    profileForm.setFieldsValue(savedProfile); // revert text fields
    setAvatarUrl(savedAvatarUrl);             // revert avatar
    setPendingAvatar(undefined);              // discard pending crop
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
            const untouched =
              !profileForm.isFieldsTouched(true) && !pendingAvatar;
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
      <Form form={securityForm} layout="vertical" onFinish={confirmSaveSecurity}>
        <Item label="Current Password" name="currentPassword" rules={[{ required: true }]}>
          <Input.Password size="large" prefix={<LockOutlined />} />
        </Item>

        <Item
          label="New Password"
          name="newPassword"
          rules={[
            { required: true },
            { min: 12, message: "Password must be at least 12 characters" },
          ]}
        >
          <Input.Password size="large" prefix={<LockOutlined />} />
        </Item>

        <Item
          label="Confirm New Password"
          name="confirmNew"
          dependencies={["newPassword"]}
          rules={[
            { required: true },
            { min: 12, message: "Password must be at least 12 characters" },
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
