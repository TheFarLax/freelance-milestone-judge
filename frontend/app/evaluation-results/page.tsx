"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useVerdict } from "@/lib/hooks/useVerdict";
import { listLocalMilestones } from "@/lib/contracts/MilestoneJudge";
import {
  matchCriteria,
  splitCriteriaBlob,
} from "@/lib/contracts/criteriaMatch";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileQuestion,
  Info,
  Loader2,
  MinusCircle,
  XCircle,
} from "lucide-react";
import type { BadgeVariant } from "@/components/ui/badge";
import type { Decision, Verdict } from "@/lib/contracts/types";

const DECISION: Record<
  Decision,
  { variant: BadgeVariant; icon: React.ReactNode; summary: string }
> = {
  ACCEPT: {
    variant: "success",
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    summary: "Every criterion was judged as met.",
  },
  REJECT: {
    variant: "destructive",
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
    summary: "At least one criterion was judged as not met.",
  },
  INCONCLUSIVE: {
    variant: "warning",
    icon: <MinusCircle className="h-4 w-4" aria-hidden="true" />,
    summary: "The submitted evidence was not enough to decide.",
  },
};

const CRITERION_VARIANT: Record<string, BadgeVariant> = {
  met: "success",
  not_met: "destructive",
  inconclusive: "warning",
};

const CRITERION_LABEL: Record<string, string> = {
  met: "Met",
  not_met: "Not met",
  inconclusive: "Inconclusive",
};

export default function EvaluationResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-2xl items-center justify-center py-24 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
          Loading evaluation results…
        </div>
      }
    >
      <EvaluationResults />
    </Suspense>
  );
}

/**
 * Side-by-side comparison of the locally saved acceptance criteria and the
 * criteria recorded in the on-chain verdict.
 *
 * The on-chain verdict is always the source of truth for what was evaluated.
 * Local metadata only supplies the "original" column; when it is absent (a
 * different browser), the on-chain side still renders and a note explains the
 * missing comparison. Nothing here re-evaluates or alters the verdict.
 */
function CriteriaComparisonSection({ verdict }: { verdict: Verdict }) {
  const local = listLocalMilestones().find((m) => m.id === verdict.milestone_id);

  const hasLocalCriteria =
    !!local && typeof local.criteria === "string" && local.criteria.trim().length > 0;
  const localLines = hasLocalCriteria ? splitCriteriaBlob(local!.criteria) : [];
  const comparison = matchCriteria(localLines, verdict.criteria_results);
  const showMismatch =
    hasLocalCriteria &&
    !comparison.complete &&
    (comparison.unmatchedLocal.length > 0 || comparison.unmatchedOnChain.length > 0);

  return (
    <div className="border-b border-slate-100 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-slate-500">
          Criteria Comparison
        </p>
        {hasLocalCriteria && comparison.complete && (
          <Badge variant="success" className="shrink-0">
            {verdict.criteria_results.length} matched
          </Badge>
        )}
      </div>

      {!hasLocalCriteria && (
        <div className="mt-3 flex gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[13px] leading-5 text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <p>
            The criteria evaluated on-chain are shown below with their results.
            The original criteria were not found in this browser, so a
            side-by-side comparison with your saved milestone is not available
            here.
          </p>
        </div>
      )}

      {showMismatch && (
        <div className="mt-3 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-[13px] leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            Your saved criteria and the on-chain evaluation do not fully match.
            The results below reflect the criteria recorded on-chain. This does
            not indicate an error by the contract — it only means the stored
            milestone text and the submitted criteria differ.
          </p>
        </div>
      )}

      {hasLocalCriteria && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4 font-medium">Original Acceptance Criterion</th>
                <th className="pb-2 pr-4 font-medium">Evaluated Criterion</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparison.matched.map((m, i) => (
                <tr key={`m-${i}`} className="align-top">
                  <td className="py-2.5 pr-4 leading-5 text-slate-700">{m.original}</td>
                  <td className="py-2.5 pr-4 leading-5 text-slate-600">
                    {m.evaluated}
                    {m.fuzzy && (
                      <span className="ml-1.5 text-[11px] text-slate-400">≈</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <Badge variant={CRITERION_VARIANT[m.status] ?? "warning"}>
                      {CRITERION_LABEL[m.status] ?? m.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {comparison.unmatchedOnChain.map((u, i) => (
                <tr key={`u-${i}`} className="align-top">
                  <td className="py-2.5 pr-4 text-[13px] italic text-slate-400">—</td>
                  <td className="py-2.5 pr-4 leading-5 text-slate-600">{u.evaluated}</td>
                  <td className="py-2.5">
                    <Badge variant={CRITERION_VARIANT[u.status] ?? "warning"}>
                      {CRITERION_LABEL[u.status] ?? u.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {comparison.unmatchedLocal.map((u, i) => (
                <tr key={`l-${i}`} className="align-top">
                  <td className="py-2.5 pr-4 leading-5 text-slate-700">{u.original}</td>
                  <td className="py-2.5 pr-4 text-[13px] italic text-slate-400">
                    not found on-chain
                  </td>
                  <td className="py-2.5">
                    <Badge variant="outline">No result</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No local criteria: show the on-chain side only, still readable. */}
      {!hasLocalCriteria && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4 font-medium">Evaluated Criterion</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparison.onChain.map((c, i) => (
                <tr key={`oc-${i}`} className="align-top">
                  <td className="py-2.5 pr-4 leading-5 text-slate-700">{c.criterion}</td>
                  <td className="py-2.5">
                    <Badge variant={CRITERION_VARIANT[c.status] ?? "warning"}>
                      {CRITERION_LABEL[c.status] ?? c.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Back to dashboard
    </Link>
  );
}

function EvaluationResults() {
  const searchParams = useSearchParams();
  const milestoneId = searchParams.get("id");

  const { data: verdict, isLoading, error } = useVerdict(
    milestoneId || undefined,
  );

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        <p className="mt-4 text-sm text-slate-500">Fetching verdict…</p>
      </div>
    );
  }

  if (!milestoneId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-16 text-center">
        <Alert
          variant="destructive"
          title="No milestone selected"
          description="Select a milestone to view its evaluation results."
        />
        <BackLink />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-16 text-center">
        <Alert variant="destructive" title="Unable to load verdict">
          {error.message}
        </Alert>
        <BackLink />
      </div>
    );
  }

  if (!verdict) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          <FileQuestion className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          No verdict yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
          This milestone has not been judged on the GenLayer contract.
        </p>
        <div className="mt-7">
          <Link href="/submit-deliverable">
            <Button size="sm">Submit a deliverable</Button>
          </Link>
        </div>
      </div>
    );
  }

  const meta = DECISION[verdict.decision] ?? DECISION.INCONCLUSIVE;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Evaluation Results</h1>
        <p className="page-subtitle">
          Verdict for milestone{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-700">
            {milestoneId}
          </code>
        </p>
      </div>

      <div className="card overflow-hidden">
        {/* Decision summary */}
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-slate-500">Decision</p>
            <div className="mt-2 flex items-center gap-2.5">
              <span className="text-slate-700">{meta.icon}</span>
              <Badge
                variant={meta.variant}
                className="px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide"
              >
                {verdict.decision}
              </Badge>
            </div>
            <p className="mt-2 text-[13px] text-slate-500">{meta.summary}</p>
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Evaluation version
            </p>
            <p className="mt-1 font-mono text-[12px] text-slate-700">
              {verdict.evaluation_version}
            </p>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Judge
            </p>
            <p className="mt-1 font-mono text-[12px] text-slate-700" title={verdict.judge}>
              {formatAddress(verdict.judge, 20)}
            </p>
          </div>
        </div>

        <CriteriaComparisonSection verdict={verdict} />

        {/* Explanation */}
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <p className="text-[13px] font-medium text-slate-500">Explanation</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {verdict.explanation || "No explanation provided."}
          </p>
        </div>

        {/* Criteria */}
        {verdict.criteria_results.length > 0 && (
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-slate-500">
                Criteria results
              </p>
              <span className="text-xs text-slate-400">
                {verdict.criteria_results.length} total
              </span>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {verdict.criteria_results.map((c, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <p className="min-w-0 text-sm leading-6 text-slate-700">
                    {c.criterion}
                  </p>
                  <Badge
                    variant={CRITERION_VARIANT[c.status] ?? "warning"}
                    className="w-fit shrink-0"
                  >
                    {CRITERION_LABEL[c.status] ?? c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Disclaimer */}
        <div className="flex gap-2.5 bg-amber-50/60 p-5 text-[13px] leading-5 text-amber-900 sm:p-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            This verdict reflects the GenLayer validators&rsquo; output for this
            submission. It is{" "}
            <strong className="font-semibold">
              not a guarantee that the evaluation is correct
            </strong>
            . Always review the explanation and criteria results before treating
            the outcome as final.
          </p>
        </div>
      </div>

      <BackLink />
    </div>
  );
}
