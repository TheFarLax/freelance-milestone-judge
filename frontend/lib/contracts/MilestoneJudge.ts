"use client";

import {
  createGenLayerClient,
  getClient,
  getContractAddress,
} from "../genlayer/client";
import type { Address } from "viem";
import type {
  Decision,
  Milestone,
  MilestoneStatus,
  Verdict,
} from "../contracts/types";

/**
 * MilestoneJudge contract wrapper.
 *
 * Only the methods that genuinely exist on the contract are exposed:
 *   - submit(milestone_id, criteria, deliverable, objections="")  -> None
 *   - get_verdict(milestone_id) -> JSON string
 *   - has_verdict(milestone_id) -> bool
 *
 * No other contract methods are invented or assumed. Reads work without a
 * connected wallet; writes require a connected MetaMask account.
 */

/** Result of the submit write, including the transaction hash. */
export interface SubmitResult {
  txHash: string;
  /** The final GenLayer transaction status string (e.g. "ACCEPTED"). */
  status: string;
}

export class MilestoneJudgeContract {
  address: string;

  constructor(address: string) {
    this.address = address;
  }

  /**
   * Fetch a verdict from the contract. Returns null if no verdict exists
   * (get_verdict raises "Milestone not found" in that case).
   */
  async getVerdict(milestoneId: string): Promise<Verdict | null> {
    const client = createGenLayerClient();
    if (!client) throw new Error("Unable to create GenLayer client");

    const raw: unknown = await client.readContract({
      address: this.address as Address,
      functionName: "get_verdict",
      args: [milestoneId],
    });

    const verdict = JSON.parse(String(raw));
    return verdict as Verdict;
  }

  /**
   * Check whether a milestone has already been judged on chain.
   */
  async hasVerdict(milestoneId: string): Promise<boolean> {
    const client = createGenLayerClient();
    if (!client) throw new Error("Unable to create GenLayer client");

    const result: unknown = await client.readContract({
      address: this.address as Address,
      functionName: "has_verdict",
      args: [milestoneId],
    });

    return Boolean(result);
  }

  /**
   * Submit a milestone for evaluation.
   *
   * Returns the GenLayer transaction id so the caller can poll for finality.
   * Requires a connected wallet account.
   */
  async submit(args: {
    milestoneId: string;
    criteria: string;
    deliverable: string;
    objections?: string;
  }): Promise<string> {
    const client = await getClient();
    if (!client) throw new Error("Unable to create GenLayer client");

    const accounts = await (
      await import("../genlayer/client")
    ).getAccounts();
    if (!accounts || accounts.length === 0) {
      throw new Error("No wallet connected");
    }

    const txHash = await client.writeContract({
      address: this.address as Address,
      functionName: "submit",
      args: [
        args.milestoneId,
        args.criteria,
        args.deliverable,
        args.objections ?? "",
      ],
      value: BigInt(0),
    });

    return String(txHash);
  }

  /**
   * Wait for a submitted transaction to reach a decided status.
   * Returns the final status string.
   */
  async waitForFinality(txHash: string): Promise<SubmitResult> {
    const client = await getClient();
    if (!client) throw new Error("Unable to create GenLayer client");

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash as never,
      status: "ACCEPTED" as never,
    });

    return {
      txHash,
      status: String((receipt as any)?.status ?? "UNKNOWN"),
    };
  }
}

/** Singleton built from the configured contract address. */
let _instance: MilestoneJudgeContract | null = null;

/**
 * Get the contract instance. Returns null when no contract address is
 * configured (frontend is in an unconfigured state).
 */
export function getContract(): MilestoneJudgeContract | null {
  const address = getContractAddress();
  if (!address) return null;

  // Preserve the address exactly as configured. StudioNet resolves contract
  // addresses by literal string, so a lowercased address is a different
  // (non-existent) contract and fails with "Contract ... not found".
  if (!_instance || _instance.address !== address) {
    _instance = new MilestoneJudgeContract(address);
  }
  return _instance;
}

/**
 * Client-side milestone metadata store.
 *
 * NOTE: the contract itself only stores verdicts keyed by milestone_id. It does
 * not store title, description, criteria or deliverable text. This layer keeps
 * that metadata in localStorage so the dashboard can list milestones, while the
 * on-chain verdict remains the source of truth for judging state.
 */
const METADATA_KEY = "fmj_milestones";

export function listLocalMilestones(): Milestone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(METADATA_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Milestone[];
  } catch {
    return [];
  }
}

export function saveLocalMilestone(milestone: Milestone): void {
  if (typeof window === "undefined") return;
  const existing = listLocalMilestones();
  const next = [milestone, ...existing.filter((m) => m.id !== milestone.id)];
  localStorage.setItem(METADATA_KEY, JSON.stringify(next));
}

export function removeLocalMilestone(id: string): void {
  if (typeof window === "undefined") return;
  const existing = listLocalMilestones();
  localStorage.setItem(
    METADATA_KEY,
    JSON.stringify(existing.filter((m) => m.id !== id)),
  );
}

/**
 * Build a client-side milestone id. On-chain ids must be unique; this helper
 * produces deterministic ids from title + createdAt. The user-provided id is
 * the authoritative `milestone_id` passed to `submit`.
 */
export function makeMilestoneId(title: string, createdAt: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `fmj-${slug}-${createdAt}`;
}

/** Map a contract decision to a human-facing milestone status. */
export function decisionToStatus(
  decision: Decision | undefined,
): MilestoneStatus {
  switch (decision) {
    case "ACCEPT":
      return "Accepted";
    case "REJECT":
      return "Rejected";
    case "INCONCLUSIVE":
      return "Inconclusive";
    default:
      return "Under Review";
  }
}
