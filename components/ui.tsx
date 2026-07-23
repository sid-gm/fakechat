"use client";

import type { ReactNode } from "react";

export function Card({
  title,
  children,
  right,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">
            {title}
          </h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-2 select-none`}
    >
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${
          on ? "bg-emerald-500" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
      {label && <span className="text-sm text-white/80">{label}</span>}
    </button>
  );
}

export function ActionButton({
  children,
  onClick,
  tone = "neutral",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "good" | "bad" | "wild";
  disabled?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/5 hover:bg-white/10 border-white/10 text-white/90",
    good: "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-200",
    bad: "bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-200",
    wild: "bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border-fuchsia-500/30 text-fuchsia-200",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-white/50">{label}</span>
      {children}
    </label>
  );
}
