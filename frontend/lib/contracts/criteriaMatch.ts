/**
 * Client-side comparison between locally saved acceptance criteria and the
 * criteria recorded in an on-chain verdict.
 *
 * This module is deliberately pure: no React, no network, no storage access.
 * Callers pass in both sides and receive a fully resolved comparison.
 *
 * Matching rules mirror `contracts/milestone_judge.py` exactly. The contract's
 * `_normalise_key` lowercases, strips, collapses internal whitespace, and
 * truncates to 200 characters. Mirroring it is what lets a locally saved
 * criterion line line up with the `criterion_key` the contract stored.
 */

import type { CriterionResult, CriterionStatus } from "./types";

/** Maximum criterion label length kept by the contract (`_MAX_TEXT`). */
const MAX_TEXT = 4000;

/** Truncation applied by the contract's `_normalise_key`. */
const MAX_KEY = 200;

/**
 * Canonical form of a criterion label, byte-for-byte equivalent to the
 * contract's `_normalise_key`.
 *
 * Python's `str.lower()` and JavaScript's `toLowerCase()` agree for the ASCII
 * text this app handles. Non-ASCII input could in principle differ, which is
 * why matching falls back to a conservative comparison rather than assuming
 * equality (see `matchCriteria`).
 */
export function normaliseKey(text: string): string {
  const s = String(text).toLowerCase().trim();
  const out: string[] = [];
  let lastWasSpace = false;
  for (const ch of s) {
    if (/\s/.test(ch)) {
      if (!lastWasSpace) out.push(" ");
      lastWasSpace = true;
    } else {
      out.push(ch);
      lastWasSpace = false;
    }
  }
  return out.join("").trim().slice(0, MAX_KEY);
}

/**
 * Split a locally saved criteria blob into individual criterion lines.
 *
 * Milestones are authored one criterion per line (the create form says so in
 * its placeholder), but blank lines and surrounding whitespace are tolerated.
 * A line longer than the contract's text limit is truncated the same way the
 * contract truncates, so a very long line cannot defeat matching.
 */
export function splitCriteriaBlob(blob: string | undefined | null): string[] {
  if (!blob || typeof blob !== "string") return [];
  return blob
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, MAX_TEXT));
}

/** Why a local criterion could not be matched to an on-chain result. */
export type UnmatchedLocalReason =
  /** The same local criterion text appears more than once, so a one-to-one
   * association would require guessing. */
  | "duplicate_local"
  /** The contract only keeps one result per normalized key, and that result
   * was already consumed by an earlier copy of this line. */
  | "duplicate_onchain"
  /** No on-chain result shares this label. */
  | "not_found";

/** Why an on-chain criterion could not be matched to a local criterion. */
export type UnmatchedOnChainReason =
  /** Two or more distinct local lines collapse to this entry's label. */
  | "ambiguous_local"
  /** The label is not present in the saved criteria at all. */
  | "not_found"
  /** A local line with this label exists but was already taken. */
  | "already_matched";

/** One matched pair, in on-chain order. */
export interface MatchedCriterion {
  /** The original criterion line, as saved locally. */
  original: string;
  /** The criterion text recorded in the on-chain verdict. */
  evaluated: string;
  /** The status the contract assigned. */
  status: CriterionStatus;
  /** True when the match came from the containment fallback rather than an
   * exact normalized-key match. */
  fuzzy: boolean;
}

/** A local criterion line that has no on-chain counterpart. */
export interface UnmatchedLocalCriterion {
  original: string;
  reason: UnmatchedLocalReason;
}

/** An on-chain result that has no local counterpart. */
export interface UnmatchedOnChainCriterion {
  evaluated: string;
  status: CriterionStatus;
  reason: UnmatchedOnChainReason;
}

export interface CriteriaComparison {
  matched: MatchedCriterion[];
  unmatchedLocal: UnmatchedLocalCriterion[];
  unmatchedOnChain: UnmatchedOnChainCriterion[];
  /** True when every local line matched and every on-chain result matched. */
  complete: boolean;
  /** The on-chain results in their original order, for fallback rendering. */
  onChain: CriterionResult[];
}

function isUsableCriterion(value: unknown): value is CriterionResult {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<CriterionResult>;
  return (
    typeof c.criterion === "string" &&
    typeof c.criterion_key === "string" &&
    typeof c.status === "string"
  );
}

/**
 * Conservatively match local criteria lines against on-chain results.
 *
 * Strategy, in priority order:
 *   1. Exact normalized-key equality (the contract's own notion of identity).
 *   2. Containment, but only when it is unambiguous on both sides: exactly one
 *      remaining local line is contained in the on-chain label (or vice versa)
 *      and no other on-chain label also contains it.
 *
 * Every pairing is one-to-one. A label is never reused, and an ambiguous
 * candidate is reported as unmatched instead of guessed.
 *
 * On-chain results that arrive with malformed shape are passed through to
 * `unmatchedOnChain` rather than being silently dropped, so the caller can
 * still show something for every entry the verdict claimed.
 */
export function matchCriteria(
  localCriteria: string[] | undefined | null,
  onChainResults: CriterionResult[] | undefined | null,
): CriteriaComparison {
  const locals = (Array.isArray(localCriteria) ? localCriteria : []).filter(
    (line): line is string => typeof line === "string" && line.trim().length > 0,
  );
  const rawResults = Array.isArray(onChainResults) ? onChainResults : [];

  // Keep only well-formed results for pairing; malformed ones are surfaced
  // separately so nothing is invented or hidden.
  const results: CriterionResult[] = [];
  const malformed: UnmatchedOnChainCriterion[] = [];
  for (const r of rawResults) {
    if (isUsableCriterion(r)) {
      results.push(r);
    } else {
      const anyR = r as Partial<CriterionResult> | null | undefined;
      malformed.push({
        evaluated: String(anyR?.criterion ?? anyR?.criterion_key ?? ""),
        status: "inconclusive",
        reason: "not_found",
      });
    }
  }

  const localKeys = locals.map(normaliseKey);
  const resultKeys = results.map((r) =>
    normaliseKey(r.criterion_key || r.criterion),
  );

  const matchedLocalIndexes = new Set<number>();
  const matchedResultIndexes = new Set<number>();
  // result index -> original local line index
  const pairing = new Map<number, { localIndex: number; fuzzy: boolean }>();

  // Pass 1: exact normalized-key equality.
  //
  // A local key may legitimately map to several identical lines (the user
  // typed the same criterion twice) and the contract keeps only one result
  // per key. We pair the first copy and leave the rest for the duplicate
  // reporting below, which is honest about what happened.
  for (let ri = 0; ri < results.length; ri++) {
    const key = resultKeys[ri];
    if (matchedResultIndexes.has(ri)) continue;
    const localIndex = localKeys.findIndex(
      (lk, li) => lk === key && !matchedLocalIndexes.has(li),
    );
    if (localIndex !== -1) {
      matchedLocalIndexes.add(localIndex);
      matchedResultIndexes.add(ri);
      pairing.set(ri, { localIndex, fuzzy: false });
    }
  }

  // Pass 2: conservative containment, only when unambiguous both ways.
  for (let ri = 0; ri < results.length; ri++) {
    if (matchedResultIndexes.has(ri)) continue;
    const rKey = resultKeys[ri];
    if (!rKey) continue;

    const candidates = locals
      .map((_, li) => li)
      .filter((li) => {
        if (matchedLocalIndexes.has(li)) return false;
        const lKey = localKeys[li];
        if (!lKey) return false;
        return lKey.includes(rKey) || rKey.includes(lKey);
      });

    // Exactly one remaining local line must be compatible, and it must be the
    // only one this on-chain entry can refer to. Anything else is ambiguous.
    if (candidates.length !== 1) continue;

    const localIndex = candidates[0];
    const lKey = localKeys[localIndex];

    // Reject if another unmatched on-chain result is equally compatible with
    // this same local line; picking either would be a guess.
    const competing = results.filter((_, otherRi) => {
      if (otherRi === ri || matchedResultIndexes.has(otherRi)) return false;
      const oKey = resultKeys[otherRi];
      if (!oKey) return false;
      return oKey.includes(lKey) || lKey.includes(oKey);
    });
    if (competing.length > 0) continue;

    matchedLocalIndexes.add(localIndex);
    matchedResultIndexes.add(ri);
    pairing.set(ri, { localIndex, fuzzy: true });
  }

  // Build matched pairs in on-chain order.
  const matched: MatchedCriterion[] = [];
  for (let ri = 0; ri < results.length; ri++) {
    const p = pairing.get(ri);
    if (!p) continue;
    matched.push({
      original: locals[p.localIndex],
      evaluated: results[ri].criterion,
      status: results[ri].status,
      fuzzy: p.fuzzy,
    });
  }

  // Explain each unmatched local line.
  const unmatchedLocal: UnmatchedLocalCriterion[] = [];
  const consumedKeys = new Set<string>();
  for (const [ri, p] of pairing) {
    consumedKeys.add(resultKeys[ri]);
  }
  for (let li = 0; li < locals.length; li++) {
    if (matchedLocalIndexes.has(li)) continue;
    const key = localKeys[li];
    const duplicatesEarlier = localKeys.some(
      (other, oi) => oi < li && other === key,
    );
    let reason: UnmatchedLocalReason = "not_found";
    if (duplicatesEarlier && consumedKeys.has(key)) {
      // An identical line was already paired with the single on-chain result
      // for this key; the contract does not record a second one.
      reason = "duplicate_onchain";
    } else if (localKeys.filter((k) => k === key).length > 1) {
      reason = "duplicate_local";
    }
    unmatchedLocal.push({ original: locals[li], reason });
  }

  // Explain each unmatched on-chain result.
  const unmatchedOnChain: UnmatchedOnChainCriterion[] = [...malformed];
  for (let ri = 0; ri < results.length; ri++) {
    if (matchedResultIndexes.has(ri)) continue;
    const key = resultKeys[ri];
    const sameKeyLocals = localKeys.filter((k) => k === key).length;
    const compatibleLocals = localKeys.filter(
      (lk) => lk && (lk.includes(key) || key.includes(lk)),
    );

    let reason: UnmatchedOnChainReason = "not_found";
    if (sameKeyLocals > 0) {
      // A local line with this label exists; it must already be paired.
      reason = "already_matched";
    } else if (compatibleLocals.length > 1) {
      reason = "ambiguous_local";
    }

    unmatchedOnChain.push({
      evaluated: results[ri].criterion,
      status: results[ri].status,
      reason,
    });
  }

  return {
    matched,
    unmatchedLocal,
    unmatchedOnChain,
    complete: unmatchedLocal.length === 0 && unmatchedOnChain.length === 0,
    onChain: results,
  };
}
