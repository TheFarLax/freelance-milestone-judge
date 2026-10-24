"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ArrowRight, Info } from "lucide-react";
import {
  makeMilestoneId,
  saveLocalMilestone,
} from "@/lib/contracts/MilestoneJudge";
import { useWallet } from "@/lib/genlayer/WalletProvider";

/** Shared class for the multi-line fields on this form. */
const TEXTAREA_CLASS =
  "flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 shadow-sm transition-colors duration-150 " +
  "focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50";

export default function CreateMilestonePage() {
  const { isConnected } = useWallet();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [spec, setSpec] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!isConnected) throw new Error("Wallet not connected");
      const id = makeMilestoneId(title, Date.now());
      const milestone = {
        id,
        title,
        description,
        criteria,
        spec,
        createdAt: Date.now(),
        status: "Draft" as const,
      };
      saveLocalMilestone(milestone);
      return milestone;
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setCriteria("");
      setSpec("");
      setSubmitError(null);
    },
    onError: (err: any) => {
      setSubmitError(err?.message || "Failed to create milestone");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    if (!description.trim()) next.description = "Description is required";
    if (!criteria.trim()) next.criteria = "Acceptance criteria are required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitError(null);
    setIsSubmitting(true);
    mutation.mutate(undefined, {
      onSettled: () => setIsSubmitting(false),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Create Milestone</h1>
        <p className="page-subtitle">
          Define a freelance milestone and save it locally. Submit it for
          evaluation on the next step.
        </p>
      </div>

      {submitError && (
        <Alert variant="destructive" title="Failed to create milestone">
          {submitError}
        </Alert>
      )}

      <form onSubmit={handleCreate} className="card space-y-5 p-5 sm:p-6">
        <Input
          label="Milestone title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="e.g. Website homepage redesign"
        />

        <div className="space-y-1.5">
          <label
            htmlFor="description"
            className="block text-[13px] font-medium text-slate-700"
          >
            Description
          </label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What work will be delivered?"
            aria-invalid={errors.description ? true : undefined}
            className={TEXTAREA_CLASS}
          />
          {errors.description && (
            <p className="text-xs text-red-600">{errors.description}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="criteria"
            className="block text-[13px] font-medium text-slate-700"
          >
            Acceptance criteria
          </label>
          <textarea
            id="criteria"
            rows={6}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="Criteria the judge will evaluate against — one per line works best"
            aria-invalid={errors.criteria ? true : undefined}
            className={TEXTAREA_CLASS}
          />
          {errors.criteria ? (
            <p className="text-xs text-red-600">{errors.criteria}</p>
          ) : (
            <p className="text-xs text-slate-500">
              The judge evaluates each criterion separately. Be specific and
              checkable.
            </p>
          )}
        </div>

        <Input
          label="Project specification (optional)"
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          helper="Frontend-only metadata; not stored on chain"
        />

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
          <Button type="submit" disabled={isSubmitting} isLoading={isSubmitting}>
            Save milestone
          </Button>
          <span className="text-xs text-slate-500 sm:ml-auto">
            Saved in this browser (localStorage)
          </span>
        </div>
      </form>

      <div className="panel flex gap-2.5 p-4 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <p>
          On-chain submission happens in the{" "}
          <strong className="font-semibold text-slate-800">
            Submit Deliverable
          </strong>{" "}
          step, where the milestone_id is sent to the GenLayer Milestone Judge
          contract for evaluation.
        </p>
      </div>

      <p className="text-sm text-slate-500">
        Ready to submit?{" "}
        <Link
          href="/submit-deliverable"
          className="inline-flex items-center gap-1 font-medium text-indigo-600 transition-colors hover:text-indigo-700"
        >
          Submit a deliverable
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
