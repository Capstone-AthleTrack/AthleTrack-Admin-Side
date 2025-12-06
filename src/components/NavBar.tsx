import { useEffect, useState } from "react";
import { Avatar, Dropdown, Modal } from "antd";
import { LogoutOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BRAND } from "@/brand";
import { supabase } from "@/core/supabase";
import { bulkSignedByUserIds } from "@/services/avatars";
import { clearCachedAuth } from "@/components/ProtectedRoute";
import { SyncBadge, useReconnectionToast } from "@/components/OfflineIndicator";

export default function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false); 
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const { pathname } = useLocation();
  const navigate = useNavigate(); 

  // Show toast when reconnecting
  useReconnectionToast();

  // scroll to add shadow and background
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20); 
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch logged-in user's avatar
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (!uid || !alive) return;

        const urls = await bulkSignedByUserIds([uid], 60 * 60 * 24);
        if (!alive) return;
        if (urls[uid]) setAvatarUrl(urls[uid]);
      } catch {
        // ignore; keep placeholder
      }
    })();
    return () => { alive = false; };
  }, []);
  
  // logoutconfirmation modal
  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    setIsModalVisible(false);
    try {
      // Clear offline auth cache
      clearCachedAuth();
      // Sign out from Supabase
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[NavBar] signOut error:', err);
    }
    navigate("/sign-in"); 
  };

  const handleCancel = () => {
    setIsModalVisible(false); 
  };

  // dropdown menu items (new API)
  const menuItems = {
    items: [
      {
        key: "settings",
        label: (
          <Link to="/settings" className="flex items-center gap-3 w-full hover:text-white hover:bg-maroon-500 rounded-md px-2 py-2">
            <SettingOutlined className="text-xl" />
            <span>Settings</span>
          </Link>
        ),
        className: "px-6 py-4 text-xl font-medium text-black transition-all duration-300",
        style: { borderBottom: `1px solid ${BRAND.maroon}` },
      },
      {
        key: "logout",
        label: (
          <span className="flex items-center gap-3 w-full rounded-md px-2 py-2 text-left text-red-600">
            <LogoutOutlined className="text-xl" />
            <span>Log Out</span>
          </span>
        ),
        className: "px-6 py-4 text-xl font-medium transition-all duration-300",
        onClick: showModal,
      },
    ],
    className: "bg-white shadow-lg rounded-lg border border-gray-300",
    style: {
      width: 220,
      padding: 0,
      boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
    },
  };

  return (
    <header
      className={[
        "sticky top-0 z-40 w-full transition-all duration-300",
        "border-b",
        scrolled
          ? "bg-white/75 backdrop-blur-md shadow-sm"
          : "bg-white border-b-transparent",
        "h-18",
      ].join(" ")}
    >
      <div className="h-16 px-6 relative flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/dashboard" className="flex items-center gap-2" aria-label="AthleTrack Home">
            <img
              src="/images/navbar_logo.png"
              alt="AthleTrack"
              className="h-6 sm:h-8 md:h-10 lg:h-12 xl:h-16 w-auto"
            />
          </Link>
        </div>

        <nav
          className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-10 font-semibold text-sm md:text-base xl:text-lg tracking-wide"
          aria-label="Primary"
        >
          {[{ path: "/dashboard", label: "Dashboard" }, 
            { path: "/sports", label: "Sports" }, 
            { path: "/user-management", label: "Users" }, 
            { path: "/manage-requests", label: "Requests" }].map(
            ({ path, label }) => {
              const isActive = pathname === path || (path === "/sports" && pathname.startsWith("/sports"));
              return (
                <Link
                  key={path}
                  to={path}
                  className={`group relative px-3 py-1.5 rounded-full transition-all duration-300 focus:outline-none shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.02)]`}
                  aria-current={isActive ? "page" : undefined}
                  style={{
                    color: isActive ? BRAND.maroon : BRAND.black,
                  }}
                >
                  {label}
                  <span
                    className={`pointer-events-none absolute left-3 right-3 -bottom-0.5 h-[2px] origin-left scale-x-0 transition-transform duration-300 ${
                      isActive ? "scale-x-100" : "group-hover:scale-x-100"
                    }`}
                    style={{ backgroundColor: BRAND.maroon }}
                  />
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full [mask-image:linear-gradient(to_bottom,rgba(0,0,0,.25),transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ backgroundColor: BRAND.white, opacity: 0.3 }}
                  />
                </Link>
              );
            }
          )}
        </nav>

        <div className="flex items-center gap-3">
          {/* Sync status indicator */}
          <SyncBadge className="hidden sm:flex" />
          
          {/* User avatar dropdown */}
          <Dropdown menu={menuItems} trigger={["click"]}>
            <Avatar 
              size="large" 
              src={avatarUrl} 
              icon={!avatarUrl ? <UserOutlined /> : undefined}
              className="cursor-pointer"
            />
          </Dropdown>
        </div>
      </div>

      {/* modal for logout confirmation */}
      <Modal
        title="Confirm Log Out"
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Yes"
        cancelText="No"
        centered 
        width={650} 
      >
        <p>Are you sure you want to log out?</p>
      </Modal>
    </header>
  );
}
