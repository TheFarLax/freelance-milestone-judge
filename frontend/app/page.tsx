"use client";

import { useMilestones } from "@/lib/hooks/useMilestones";
import { Milestone } from "@/lib/contracts/types";
import { formatDate, formatAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Link } from "@/components/ui/link";
import { ChevronRight, FileText, Info, Loader2, Plus } from "lucide-react";
import type { BadgeVariant } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  Draft: "outline",
  Submitted: "secondary",
  "Under Review": "warning",
  Accepted: "success",
  Rejected: "destructive",
  Inconclusive: "warning",
};

export default function DashboardPage() {
  const { data: milestones, isLoading, error } = useMilestones();
  const list: Milestone[] = milestones ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        <p className="mt-4 text-sm text-slate-500">Loading milestones…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <Alert variant="destructive" title="Unable to load milestones">
          {error.message}
        </Alert>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-24 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          <FileText className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          No milestones yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
          Create your first milestone, then submit a deliverable for on-chain
          evaluation.
        </p>
        <div className="mt-7">
          <Link href="/create-milestone">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create milestone
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Milestones</h1>
          <p className="page-subtitle">
            Freelance work evaluated by the GenLayer Milestone Judge contract.
          </p>
        </div>
        <Link href="/create-milestone" className="shrink-0">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create milestone
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <MilestoneCard key={m.id} m={m} />
        ))}
      </div>

      <div className="panel flex gap-2.5 p-4 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <p>
          The on-chain verdict is the source of truth for judging state. A
          milestone&rsquo;s on-chain decision is not a guarantee that the
          evaluation is correct — it reflects the GenLayer validators&rsquo;
          output for that submission.
        </p>
      </div>
    </div>
  );
}

function MilestoneCard({ m }: { m: Milestone }) {
  const variant = STATUS_VARIANT[m.status ?? "Draft"] ?? "outline";
  const hasVerdict = !!m.verdict;

  return (
    <div className="card flex flex-col p-5 transition-colors duration-150 hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-sm font-semibold leading-5 text-slate-900">
          {m.title}
        </h3>
        <Badge variant={variant} className="shrink-0">
          {m.status ?? "Draft"}
        </Badge>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-500">
        {m.description || "No description."}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-slate-400">
        <span>{formatDate(m.createdAt)}</span>
        {m.verdict && <span>Judge: {formatAddress(m.verdict.judge, 12)}</span>}
      </div>

      {hasVerdict && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <Link
            href={`/evaluation-results?id=${m.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700"
          >
            View results
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
