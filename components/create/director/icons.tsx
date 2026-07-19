/** Tiny inline SVG icon set for the Director console — no emoji anywhere. */

function Svg({
  children,
  className = "h-[14px] w-[14px]",
  filled = false,
}: {
  children: React.ReactNode;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconPlay({ className }: { className?: string }) {
  return (
    <Svg className={className} filled>
      <path d="M7 4.5v15l13-7.5z" />
    </Svg>
  );
}

export function IconPause({ className }: { className?: string }) {
  return (
    <Svg className={className} filled>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </Svg>
  );
}

export function IconStop({ className }: { className?: string }) {
  return (
    <Svg className={className} filled>
      <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
    </Svg>
  );
}

export function IconDownload({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </Svg>
  );
}

export function IconChevronLeft({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m14 6-6 6 6 6" />
    </Svg>
  );
}

export function IconChevronRight({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m10 6 6 6-6 6" />
    </Svg>
  );
}

export function IconMusic({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </Svg>
  );
}

export function IconChevronDown({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m6 10 6 6 6-6" />
    </Svg>
  );
}

export function IconPlus({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconX({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

/** Rows layout: three stacked bands (controls / preview / timeline). */
export function IconLayoutRows({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="4" y="4" width="16" height="4.5" rx="1" />
      <rect x="4" y="10.5" width="16" height="6" rx="1" />
      <rect x="4" y="18.5" width="16" height="2.5" rx="1" />
    </Svg>
  );
}

/** Console layout: big stage + right rail. */
export function IconLayoutConsole({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="4" y="4" width="10.5" height="12" rx="1" />
      <rect x="16.5" y="4" width="3.5" height="12" rx="1" />
      <rect x="4" y="18.5" width="16" height="2.5" rx="1" />
    </Svg>
  );
}
