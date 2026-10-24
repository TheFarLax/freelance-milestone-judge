"use client";

import { useQuery } from "@tanstack/react-query";
import { getContract } from "../contracts/MilestoneJudge";
import type { Verdict } from "../contracts/types";

const VERDICT_KEY = (milestoneId: string) =>
  ["milestones", "verdict", milestoneId] as const;

/**
 * Hook: fetch a single milestone&rsquo;s verdict on demand.
 * Returns `null` when the contract has no verdict for that id.
 */
export function useVerdict(milestoneId: string | undefined) {
  return useQuery({
    queryKey: VERDICT_KEY(milestoneId ?? ""),
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
