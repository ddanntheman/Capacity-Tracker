import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StandardRank } from "@/lib/types";

/** Firm-defined standard ranks, ordered by seniority. */
export function useRanks(): {
  ranks: StandardRank[];
  rankNames: string[];
  defaultTargetFor: (rank: string) => number | null;
} {
  const { data } = useQuery({ queryKey: ["ranks"], queryFn: api.listRanks });
  const ranks = (data ?? []).filter((r) => !r.isArchived);
  return {
    ranks,
    rankNames: ranks.map((r) => r.name),
    defaultTargetFor: (rank: string) =>
      ranks.find((r) => r.name === rank)?.defaultUtilizationTarget ?? null,
  };
}
