"use client";

import { Toaster } from "sonner";

/**
 * Site-wide toast outlet (sonner). All user-facing errors/notices go through
 * `toast.*` — never `alert()`. Mounted once in the root layout.
 */
export function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: "#17171b",
          border: "1px solid #313138",
          color: "#e9e9ec",
        },
      }}
    />
  );
}
