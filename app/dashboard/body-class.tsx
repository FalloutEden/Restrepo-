"use client";

import { useEffect } from "react";

// Toggles `body.has-dashboard-light` on mount/unmount.
// operator.css uses this class to override the dark cyberpunk globals
// and switch the operator UI to a light SaaS theme. Scoped to /dashboard
// only — admin routes keep the dark globals.

export function DashboardBodyClass() {
  useEffect(() => {
    document.body.classList.add("has-dashboard-light");
    return () => {
      document.body.classList.remove("has-dashboard-light");
    };
  }, []);
  return null;
}
