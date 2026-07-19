"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// next/dynamic's ssr:false must originate in a Client Component — Server
// Components throw a build error if they call it directly. This thin wrapper
// is that boundary: it keeps the wallet/wagmi provider tree (which touches
// indexedDB during its own module init, regardless of wagmi's own `ssr` flag
// or storage adapter) out of the server render entirely.
const Providers = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
});

export function ProvidersDynamic({
  children,
  cookie,
}: {
  children: ReactNode;
  cookie?: string;
}) {
  return <Providers cookie={cookie}>{children}</Providers>;
}
