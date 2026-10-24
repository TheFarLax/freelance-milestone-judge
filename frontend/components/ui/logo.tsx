import * as React from "react";

/**
 * Milestone Judge logo mark.
 *
 * A milestone pin whose interior is a verdict checkmark: "a checkpoint that has
 * been judged". Pure geometry so it stays legible at favicon sizes. Uses
 * `currentColor` so it adapts to the surrounding text colour.
 */
export function LogoMark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Milestone Judge"
      focusable="false"
    >
      <path
        d="M16 2.75c-5.66 0-10.25 4.5-10.25 10.05 0 7.16 8.6 15.02 9.53 15.85a1.05 1.05 0 0 0 1.44 0c.93-.83 9.53-8.69 9.53-15.85C26.25 7.25 21.66 2.75 16 2.75Z"
        fill="currentColor"
      />
      <path
        d="M11.6 12.9l2.9 2.9 5.9-5.9"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logo mark plus the "Milestone Judge" wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={"inline-flex items-center gap-2 " + (className ?? "")}>
      <LogoMark className="text-indigo-600" size={26} />
      <span className="text-[15px] font-semibold tracking-tight text-slate-900">
        Milestone{" "}
        <span className="text-indigo-600">Judge</span>
      </span>
    </span>
  );
}
