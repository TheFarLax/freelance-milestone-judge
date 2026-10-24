/**
 * Types mirroring the MilestoneJudge GenLayer contract.
 *
 * These are derived from the contract itself (contracts/milestone_judge.py):
 *   submit(milestone_id, criteria, deliverable, objections="")  -> None
 *   get_verdict(milestone_id) -> JSON string
 *   has_verdict(milestone_id) -> bool
 *
 * No ABI is invented here; the contract exposes exactly three methods and the
 * frontend only ever calls those three.
 */

/** Documented criterion status vocabulary from the contract. */
export type CriterionStatus = "met" | "not_met" | "inconclusive";

/** Contract decision vocabulary. */
export type Decision = "ACCEPT" | "REJECT" | "INCONCLUSIVE";

/**
 * One criterion result as returned by `get_verdict`.
 *
 * The contract's `_normalise_criterion_results` emits exactly
 * {criterion_key, criterion, status}. `evidence` is deliberately NOT part of the
 * stored/comparable result — the contract strips it before storing. Any
 * `evidence` field would therefore never be populated by this contract, and the
 * UI must not imply the contract returns it.
 */
export interface CriterionResult {
  criterion_key: string;
  criterion: string;
  status: CriterionStatus;
}

/** The full verdict object returned (as JSON) by `get_verdict`. */
export interface Verdict {
  milestone_id: string;
  judge: string;
  evaluation_version: string;
  decision: Decision;
  explanation: string;
  criteria_results: CriterionResult[];
}

/**
 * Frontend-side milestone record.
 *
 * IMPORTANT: the contract stores only a verdict keyed by milestone_id. It does
 * NOT store title, description or the original criteria/deliverable text. Those
 * are client-side metadata held in this browser's localStorage. On-chain truth
 * is only ever the verdict. Any milestone whose verdict exists on chain is
 * treated as judged regardless of what local metadata says.
 */
export interface Milestone {
  /** The on-chain milestone_id. */
  id: string;
  title: string;
  description: string;
  criteria: string;
  /** Optional project specification (frontend-only metadata). */
  spec?: string;
  createdAt: number;
  /** Human-facing status (Draft/Submitted/etc.) derived locally + on-chain. */
  status?: MilestoneStatus;
  /** Latest known verdict, if the milestone has been judged on chain. */
  verdict?: Verdict;
  /** Hash of the write transaction that produced the verdict. */
  txHash?: string;
}

export type MilestoneStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Accepted"
  | "Rejected"
  | "Inconclusive";

/** Transaction lifecycle used by the submission flow. */
export type SubmissionPhase =
  | "idle"
  | "validating"
  | "submitting"
  | "waiting"
  | "success"
  | "error";
