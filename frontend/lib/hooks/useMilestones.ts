"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getContract,
  listLocalMilestones,
  decisionToStatus,
} from "../contracts/MilestoneJudge";
import type { Milestone, Verdict } from "../contracts/types";
import { useWallet } from "../genlayer/WalletProvider";

/** Key prefix for all milestone queries. */
const MILESTONE_KEYS = {
  all: ["milestones"] as const,
  list: () => [...MILESTONE_KEYS.all, "list"] as const,
  verdict: (milestoneId: string) =>
    [...MILESTONE_KEYS.all, "verdict", milestoneId] as const,
};

/**
 * Hook: fetch the full milestone list.
 *
 * The contract itself only stores verdicts keyed by milestone_id; title,
 * description, criteria etc. live in localStorage. On-chain truth (verdicts)
 * overrides client-side judged state. Returns `null` data when no contract
 * address is configured (feature labeled unavailable).
 */
export function useMilestones() {
  const { address } = useWallet();

  return useQuery({
    queryKey: MILESTONE_KEYS.list(),
    queryFn: async (): Promise<Milestone[]> => {
      const local = listLocalMilestones();
      const contract = getContract();
      if (!contract) return local;

      const enriched = await Promise.all(
        local.map(async (m: Milestone) => {
          try {
            const onChain = await contract.hasVerdict(m.id);
            if (onChain) {
              const verdict = await contract.getVerdict(m.id);
              if (!verdict) return m;
              return {
                ...m,
                verdict,
                status: decisionToStatus(verdict.decision),
              };
            }
            return m;
          } catch {
            return m;
          }
        }),
      );
      return enriched;
    },
    enabled: !!address,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook: fetch a single milestone&rsquo;s verdict on demand.
 */
export function useVerdict(milestoneId: string | undefined) {
  return useQuery({
    queryKey: MILESTONE_KEYS.verdict(milestoneId ?? ""),
    queryFn: async (): Promise<Verdict | null> => {
      const contract = getContract();
      if (!contract) return null;
      try {
        return await contract.getVerdict(milestoneId!);
      } catch {
        return null;
      }
    },
    enabled: !!milestoneId && !!getContract(),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook: submit a milestone to the contract for evaluation.
 *
 * Writes to the real contract via `writeContract`, then polls
 * `waitForTransactionReceipt` for finality. Requires a connected wallet and a
 * configured contract address. Returns `{ txHash, status }`.
 */
export function useSubmitMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      milestoneId: string;
      criteria: string;
      deliverable: string;
      objections?: string;
    }) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not configured");
      const txHash = await contract.submit(args);
      const result = await contract.waitForFinality(txHash);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MILESTONE_KEYS.list() });
    },
  });
}
