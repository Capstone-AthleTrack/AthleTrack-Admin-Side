import { useEffect, useState } from "react";
import { Avatar, Dropdown, Menu, Modal } from "antd";
import { LogoutOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BRAND } from "@/brand";

export default function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false); 
  const { pathname } = useLocation();
  const navigate = useNavigate(); 

  // scroll to add shadow and background
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20); 
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  // logoutconfirmation modal
  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = () => {
    setIsModalVisible(false);
    navigate("/sign-in"); 
  };

  const handleCancel = () => {
    setIsModalVisible(false); 
  };

  // dropdown menu
  const menu = (
    <Menu
      className="bg-white shadow-lg rounded-lg border border-gray-300"
      style={{
        width: 220,
        padding: 0,
        boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
      }}
    >
      <Menu.Item
        key="settings"
        className="px-6 py-4 text-xl font-medium text-black transition-all duration-300"
        style={{ borderBottom: `1px solid ${BRAND.maroon}` }}
      >
        <Link to="/settings" className="flex items-center gap-3 w-full hover:text-white hover:bg-maroon-500 rounded-md px-2 py-2">
          <SettingOutlined className="text-xl" />
          <span>Settings</span>
        </Link>
      </Menu.Item>

      <Menu.Item
        key="logout"
        className="px-6 py-4 text-xl font-medium text-red-600 transition-all duration-300"
        onClick={showModal}
      >
        <button
          className="flex items-center gap-3 w-full rounded-md px-2 py-2 text-left"
          type="button"
        >
          <LogoutOutlined className="text-xl" />
          <span>Log Out</span>
        </button>
      </Menu.Item>
    </Menu>
  );

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
          {/* Search bar removed from navbar as requested */}
          <Dropdown overlay={menu} trigger={["click"]}>
            <Avatar size="large" icon={<UserOutlined />} />
          </Dropdown>
        </div>
      </div>

      {/* modal for logout confirmation */}
      <Modal
        title="Confirm Log Out"
        visible={isModalVisible}
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
