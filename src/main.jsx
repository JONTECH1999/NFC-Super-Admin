import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";

const isAdmin = window.location.pathname.replace(/\/+$/, "").startsWith("/admin");
const isSuperAdmin = window.location.hostname === "superadmin-callingcard.web.app"
  || window.location.pathname.replace(/\/+$/, "").startsWith("/superadmin");
const isEditRequest = window.location.pathname.replace(/\/+$/, "").startsWith("/edit-request");
const isDigipen = !isAdmin && (
  window.location.hostname === "digital-callingcard01.web.app"
  || window.location.pathname.replace(/\/+$/, "") === "/digipen"
);
const normalizedPath = window.location.pathname.replace(/\/+$/, "");
const isIvory = normalizedPath === "/soft-neumorphic-ivory"
  || (window.location.hostname === "calling-card-d5.web.app" && normalizedPath === "");

if (isIvory) {
  import("./i_2_Soft Neumorphic Ivory").then(({ default: SoftNeumorphicIvory }) => {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <SoftNeumorphicIvory />
      </React.StrictMode>,
    );
  });
} else if (isDigipen) {
  import("./Midnight Monochrome").then(({ default: Digipen }) => {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <Digipen />
      </React.StrictMode>,
    );
  });
} else if (isEditRequest) {
  import("./EditRequest").then(({ default: EditRequest }) => {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <EditRequest />
      </React.StrictMode>,
    );
  });
} else if (isSuperAdmin) {
  import("./SuperAdmin").then(({ default: SuperAdmin }) => {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <SuperAdmin />
      </React.StrictMode>,
    );
  });
} else if (isAdmin) {
  // Lazy-load admin panel — keeps the public card bundle small
  import("./Admin").then(({ default: Admin }) => {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <Admin />
      </React.StrictMode>,
    );
  });
} else {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// PWA service worker registration (only for public card, not admin)
if (!isAdmin && !isSuperAdmin && !isEditRequest && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}
