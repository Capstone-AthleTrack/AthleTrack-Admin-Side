import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import App from "./App";
import "./styles/tailwind.css";
import "antd/dist/reset.css";
import { BRAND } from "./brand";


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
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);