"use client";

import * as React from "react";
import type { InputHTMLAttributes } from "react";
import { classNames } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export function Input({
  className,
  label,
  error,
  helper,
  id,
  ...props
}: InputProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-slate-700"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={classNames(
          "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900",
          "placeholder:text-slate-400 shadow-sm transition-colors duration-150",
          "focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60",
          error && "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/20",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? `${inputId}-hint` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-hint`} className="text-xs text-red-600">
          {error}
        </p>
      )}
      {helper && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-slate-500">
          {helper}
        </p>
      )}
    </div>
  );
}
