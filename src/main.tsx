import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, theme, App as AntdApp } from "antd";
import App from "./App";
import "./styles/tailwind.css";
import "antd/dist/reset.css";
import { BRAND } from "./brand";

/**
 * NOTE:
 * We removed the eager sign-out guard from here to avoid race conditions
 * that were logging users out immediately after a successful sign-in.
 * Gmail-only gating now lives in <ProtectedRoute />, which decides access
 * without force-closing the session from this global entrypoint.
 */

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
