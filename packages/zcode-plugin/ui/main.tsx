import React from "react";
import { createRoot } from "react-dom/client";
import ZcodePluginApp from "./ZcodeApp";

// 面板主题由宿主 hostContext 提供,这里保持浅色默认
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ZcodePluginApp />
  </React.StrictMode>,
);
