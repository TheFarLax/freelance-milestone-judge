"use client";

import { Suspense, useState, useEffect } from "react";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { useSubmitMilestone } from "@/lib/hooks/useMilestones";
import { listLocalMilestones } from "@/lib/contracts/MilestoneJudge";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  ArrowRight,
  Info,
  Loader2,
  Send,
  Wallet,
} from "lucide-react";

const TEXTAREA_CLASS =
  "flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 shadow-sm transition-colors duration-150 " +
  "focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50";

export default function SubmitDeliverablePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-2xl items-center justify-center py-24 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
          Loading…
        </div>
      }
    >
      <SubmitDeliverable />
    </Suspense>
  );
}

function SubmitDeliverable() {
  const { isConnected, connectWallet } = useWallet();
  const [deliverable, setDeliverable] = useState("");
  const [objections, setObjections] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const milestones = listLocalMilestones();
  const draftOrSubmitted = milestones.filter(
    (m) => m.status === "Draft" || m.status === "Submitted",
  );

  const mutation = useSubmitMilestone();

  useEffect(() => {
    if (draftOrSubmitted.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !draftOrSubmitted.some((m) => m.id === selectedId)) {
      setSelectedId(draftOrSubmitted[0].id);
    }
  }, [draftOrSubmitted, selectedId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!selectedId) next.milestone = "Select a milestone";
    if (!deliverable.trim()) next.deliverable = "Deliverable is required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitError(null);
    mutation.mutate({
      milestoneId: selectedId!,
      criteria: (draftOrSubmitted.find((m) => m.id === selectedId)?.criteria ?? ""),
      deliverable,
      objections,
    });
  };

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          <Wallet className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Connect wallet to submit
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
          MetaMask is required to submit a milestone to the GenLayer contract.
        </p>
        <div className="mt-7">
          <Button onClick={connectWallet}>Connect wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Submit Deliverable</h1>
        <p className="page-subtitle">
          Send a saved milestone to the GenLayer Milestone Judge contract for
          evaluation.
        </p>
      </div>

      {submitError && (
        <Alert variant="destructive" title="Submission failed">
          {submitError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5 p-5 sm:p-6">
        <div className="space-y-1.5">
          <label
            htmlFor="milestone-select"
            className="block text-[13px] font-medium text-slate-700"
          >
            Milestone
          </label>
          <select
            id="milestone-select"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            disabled={draftOrSubmitted.length === 0}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 disabled:bg-slate-50 disabled:opacity-60"
          >
            <option value="">Select a milestone</option>
            {draftOrSubmitted.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          {errors.milestone && (
            <p className="text-xs text-red-600">{errors.milestone}</p>
          )}
          {draftOrSubmitted.length === 0 && (
            <p className="text-xs text-slate-500">
              No draft milestones yet —{" "}
              <Link
                href="/create-milestone"
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                create one first
              </Link>
              .
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="deliverable"
            className="block text-[13px] font-medium text-slate-700"
          >
            Deliverable
          </label>
          <textarea
            id="deliverable"
            rows={6}
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="The completed work being submitted for evaluation"
            aria-invalid={errors.deliverable ? true : undefined}
            className={TEXTAREA_CLASS}
          />
          {errors.deliverable && (
            <p className="text-xs text-red-600">{errors.deliverable}</p>
          )}
        </div>

        <Input
          label="Objections (optional)"
          value={objections}
          onChange={(e) => setObjections(e.target.value)}
          helper="Any objections the submitter wants raised against the criteria"
        />

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              !selectedId ||
              !deliverable.trim() ||
              draftOrSubmitted.length === 0
            }
            isLoading={mutation.isPending}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Submit to contract
          </Button>
          <span className="text-xs text-slate-500 sm:ml-auto">
            Requires MetaMask on GenLayer
          </span>
        </div>
      </form>

      {mutation.isPending && (
        <div className="panel flex items-center gap-3 p-4 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" aria-hidden="true" />
          <span>Submitting to GenLayer contract… this may take a moment.</span>
        </div>
      )}

      <div className="panel flex gap-2.5 p-4 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <p>
          The contract does not store title, description, or deliverable text. It
          only records a verdict keyed by milestone_id. Your milestone metadata
          stays in this browser&rsquo;s localStorage; the on-chain verdict is the
          source of truth for judging state.
        </p>
      </div>

      <p className="text-sm text-slate-500">
        Need to create a milestone first?{" "}
        <Link
          href="/create-milestone"
          className="inline-flex items-center gap-1 font-medium text-indigo-600 transition-colors hover:text-indigo-700"
        >
          Create milestone
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
