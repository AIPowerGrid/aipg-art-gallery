/**
 * Link / broken-link glyphs for chaining (replaces the ⛓ emoji): two chain
 * "eyes" joined by a bar; the broken variant separates them with a slash.
 */
export function ChainIcon({
  broken = false,
  className = "h-[11px] w-[11px]",
}: {
  broken?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {broken ? (
        <>
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
          <line x1="15" y1="5" x2="9" y2="19" />
        </>
      ) : (
        <>
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </>
      )}
    </svg>
  );
}
