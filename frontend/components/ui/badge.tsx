"use client";

import * as React from "react";
import { classNames } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANTS: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700 border-slate-200",
  secondary: "bg-slate-100 text-slate-600 border-slate-200",
  destructive: "bg-red-50 text-red-700 border-red-200",
  outline: "bg-white text-slate-700 border-slate-300",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
