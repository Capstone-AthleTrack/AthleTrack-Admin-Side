import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, theme, App as AntdApp } from "antd";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles/tailwind.css";
import "antd/dist/reset.css";
import { BRAND } from "./brand";
import { initOffline } from "./core/offline";

/**
 * NOTE:
 * We removed the eager sign-out guard from here to avoid race conditions
 * that were logging users out immediately after a successful sign-in.
 * Gmail-only gating now lives in <ProtectedRoute />, which decides access
 * without force-closing the session from this global entrypoint.
 */

// ---- Initialize Offline System ----
// Sets up IndexedDB, network listeners, and background sync
initOffline();

// ---- Register Service Worker ----
// Auto-updates when new version is available
const updateSW = registerSW({
  onNeedRefresh() {
    // New content available - auto update
    // You could show a toast here if you want user confirmation
    console.log("[PWA] New content available, updating...");
    updateSW(true);
  },
  onOfflineReady() {
    console.log("[PWA] App ready to work offline");
  },
  onRegistered(registration) {
    console.log("[PWA] Service worker registered", registration);
    
    // Check for updates periodically (every hour)
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    }
  },
  onRegisterError(error) {
    console.error("[PWA] Service worker registration failed:", error);
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: BRAND.maroon,
          colorInfo: BRAND.maroon,
          colorLink: BRAND.maroon,
          borderRadius: 12,
          fontFamily: "Inter, ui-sans-serif, system-ui",
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      {/* Ant Design context provider so message/notification use the theme and render properly */}
      <AntdApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
