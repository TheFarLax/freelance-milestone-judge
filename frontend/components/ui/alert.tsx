"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { classNames } from "@/lib/utils";

interface AlertProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  children?: React.ReactNode;
}

const STYLES: Record<string, string> = {
  default: "bg-slate-50 border-slate-200 text-slate-700",
  destructive: "bg-red-50 border-red-200 text-red-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
};

const ICONS: Record<string, React.ReactNode> = {
  default: <Info className="h-4 w-4 text-slate-500" aria-hidden="true" />,
  destructive: (
    <AlertCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
  ),
  success: (
    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
  ),
};

export function Alert({
  title,
  description,
  variant = "default",
  children,
}: AlertProps) {
  const body = description ?? children;

  return (
    <div
      role="alert"
      className={classNames(
        "flex w-full gap-2.5 rounded-lg border p-3.5 text-sm",
        STYLES[variant],
      )}
    >
      <span className="mt-0.5 shrink-0">{ICONS[variant]}</span>
      <div className="min-w-0">
        {title && <p className="font-semibold leading-5">{title}</p>}
        {body && (
          <div className={classNames(title && "mt-0.5", "leading-5 break-words")}>
            {body}
          </div>
        )}
      </div>
    </div>
  );
}
