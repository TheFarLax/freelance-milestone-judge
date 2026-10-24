"use client";

import * as React from "react";
import { classNames } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "default" | "sm";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      isLoading,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center gap-2 rounded-lg border font-medium " +
      "transition-[background-color,border-color,color,box-shadow] duration-150 " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 " +
      "focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
      "disabled:opacity-50 disabled:pointer-events-none select-none";

    const variants: Record<string, string> = {
      primary:
        "bg-indigo-600 text-white border-transparent shadow-sm hover:bg-indigo-700 active:bg-indigo-800",
      ghost:
        "bg-transparent text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900",
      outline:
        "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-400",
      danger:
        "bg-red-600 text-white border-transparent shadow-sm hover:bg-red-700",
    };

    const sizes: Record<string, string> = {
      default: "h-10 px-4 text-sm",
      sm: "h-8 px-3 text-[13px]",
    };

    return (
      <button
        ref={ref}
        className={classNames(base, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="-ml-0.5 h-3.5 w-3.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading...
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button };
