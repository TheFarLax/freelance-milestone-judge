/**
 * Tests for criteriaMatch.ts.
 *
 * The project has no test runner configured (and adding one is out of scope),
 * so this file uses plain assertions and is executed directly with the
 * `tsx` runner that is already a devDependency:
 *
 *   npx tsx lib/contracts/criteriaMatch.test.ts
 */

import {
  matchCriteria,
  normaliseKey,
  splitCriteriaBlob,
} from "./criteriaMatch";
import type { CriterionResult } from "./types";

let failures = 0;
let checks = 0;

function assert(cond: boolean, name: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL: ${name}`);
  } else {
    console.log(`  ok:   ${name}`);
  }
}

function assertEqual<T>(actual: T, expected: T, name: string): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`  FAIL: ${name}\n    expected: ${e}\n    actual:   ${a}`);
  } else {
    console.log(`  ok:   ${name}`);
  }
}

function verdict(
  entries: Array<[string, string]>,
): CriterionResult[] {
  return entries.map(([criterion, status]) => ({
    criterion_key: normaliseKey(criterion),
    criterion,
    status: status as CriterionResult["status"],
  }));
}

console.log("normaliseKey — mirrors the Python contract");
assertEqual(
  normaliseKey("  Hello   World\tHere "),
  "hello world here",
  "lowercases, trims, collapses internal whitespace (incl. tabs)",
);
assertEqual(normaliseKey(""), "", "empty string stays empty");
assertEqual(normaliseKey("A b c"), "a b c", "keeps words intact");
assertEqual(
  normaliseKey("x".repeat(250)),
  "x".repeat(200),
  "truncates to 200 characters like the contract",
);

console.log("splitCriteriaBlob");
assertEqual(
  splitCriteriaBlob("a\n\n  b  \nc"),
  ["a", "b", "c"],
  "splits lines, drops blank lines, trims",
);
assertEqual(splitCriteriaBlob(undefined), [], "undefined yields no lines");
assertEqual(splitCriteriaBlob(""), [], "empty string yields no lines");
assertEqual(
  splitCriteriaBlob("a".repeat(5000)),
  ["a".repeat(4000)],
  "truncates a line at the contract's 4000-char text limit",
);

console.log("exact matches");
{
  const local = ["Landing page copy", "Responsive layout", "SEO meta tags"];
  const onChain = verdict([
    ["Landing page copy", "met"],
    ["Responsive layout", "not_met"],
    ["SEO meta tags", "met"],
  ]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 3, "all three match");
  assertEqual(cmp.complete, true, "marked complete");
  assertEqual(
    cmp.matched.map((m) => [m.original, m.status]),
    [
      ["Landing page copy", "met"],
      ["Responsive layout", "not_met"],
      ["SEO meta tags", "met"],
    ],
    "preserves original text and on-chain status",
  );
  assert(
    cmp.matched.every((m) => !m.fuzzy),
    "all matches are exact (not fuzzy)",
  );
}

console.log("case and whitespace differences");
{
  const local = ["  Landing  Page   Copy ", "responsive layout"];
  const onChain = verdict([
    ["landing page copy", "met"],
    ["Responsive Layout", "met"],
  ]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 2, "case/whitespace differences still match");
  assertEqual(cmp.complete, true, "complete");
  assert(
    cmp.matched.every((m) => !m.fuzzy),
    "matched via normalized key, not fallback",
  );
  assertEqual(
    cmp.matched[0].original,
    "  Landing  Page   Copy ",
    "original text preserved as authored (line not re-trimmed by matching)",
  );
}

console.log("unmatched original criteria");
{
  const local = ["Landing page copy", "Payment integration", "Analytics setup"];
  const onChain = verdict([["Landing page copy", "met"]]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 1, "one match");
  assertEqual(cmp.matched[0].original, "Landing page copy", "correct pair");
  assertEqual(
    cmp.unmatchedLocal.map((u) => u.original),
    ["Payment integration", "Analytics setup"],
    "both extra local lines reported unmatched",
  );
  assertEqual(
    cmp.unmatchedLocal.map((u) => u.reason),
    ["not_found", "not_found"],
    "reason is not_found (no on-chain result shares the label)",
  );
  assertEqual(cmp.complete, false, "not complete");
}

console.log("unmatched on-chain criteria");
{
  const local = ["Landing page copy"];
  const onChain = verdict([
    ["Landing page copy", "met"],
    ["Performance budget", "inconclusive"],
  ]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 1, "one match");
  assertEqual(
    cmp.unmatchedOnChain.map((u) => u.evaluated),
    ["Performance budget"],
    "extra on-chain result reported",
  );
  assertEqual(
    cmp.unmatchedOnChain[0].reason,
    "not_found",
    "reason not_found",
  );
  assertEqual(cmp.onChain.length, 2, "fallback list keeps all on-chain entries");
}

console.log("duplicate and ambiguous criteria");
{
  const local = ["Landing page copy", "Landing page copy", "SEO meta tags"];
  const onChain = verdict([["Landing page copy", "met"], ["SEO meta tags", "met"]]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 2, "one pair per on-chain result");
  assertEqual(cmp.unmatchedLocal.length, 1, "duplicate local line surfaced");
  assertEqual(
    cmp.unmatchedLocal[0].reason,
    "duplicate_onchain",
    "duplicate local line explained (contract keeps one result per key)",
  );
}
{
  // Two distinct local lines both contain the on-chain label — ambiguous.
  const local = ["Landing page copy draft one", "Landing page copy final"];
  const onChain = verdict([["Landing page copy", "met"]]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 0, "ambiguous containment is not guessed");
  assertEqual(
    cmp.unmatchedOnChain[0].reason,
    "ambiguous_local",
    "reported as ambiguous",
  );
  assertEqual(
    cmp.unmatchedLocal.length,
    2,
    "both local lines reported unmatched",
  );
}

console.log("different numbers of local and on-chain criteria");
{
  const local = ["A", "B", "C", "D"];
  const onChain = verdict([["A", "met"], ["D", "not_met"]]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 2, "matches the shared subset");
  assertEqual(
    cmp.unmatchedLocal.map((u) => u.original),
    ["B", "C"],
    "extra local lines listed",
  );
  assertEqual(cmp.unmatchedOnChain.length, 0, "no extra on-chain entries");
  assertEqual(cmp.complete, false, "incomplete");
}
{
  const local = ["A"];
  const onChain = verdict([["A", "met"], ["B", "met"], ["C", "met"]]);
  const cmp = matchCriteria(local, onChain);
  assertEqual(cmp.matched.length, 1, "single local line matches");
  assertEqual(cmp.unmatchedOnChain.length, 2, "extra on-chain entries listed");
}

console.log("missing local metadata");
{
  const onChain = verdict([["Landing page copy", "met"]]);
  const cmp = matchCriteria([], onChain);
  assertEqual(cmp.matched.length, 0, "no matches possible without local data");
  assertEqual(cmp.unmatchedLocal.length, 0, "no local entries to report");
  assertEqual(cmp.unmatchedOnChain.length, 1, "on-chain entry still surfaced");
  assertEqual(cmp.onChain.length, 1, "fallback list intact for rendering");
}
{
  const onChain = verdict([["Landing page copy", "met"]]);
  const cmp = matchCriteria(null, onChain);
  assertEqual(cmp.matched.length, 0, "null local data behaves like empty");
  assertEqual(cmp.unmatchedOnChain.length, 1, "still surfaces on-chain entry");
}

console.log("malformed on-chain entries are surfaced, never dropped or invented");
{
  const mixed = [
    { criterion: "Real criterion", criterion_key: "real criterion", status: "met" },
    { status: "met" }, // missing criterion and key
    "garbage", // not even an object
    { criterion: "Another", criterion_key: "another", status: "met" },
  ] as unknown as CriterionResult[];
  const cmp = matchCriteria(["Real criterion", "Another"], mixed);
  assertEqual(cmp.matched.length, 2, "well-formed entries still match");
  assertEqual(
    cmp.unmatchedOnChain.length,
    2,
    "both malformed entries surfaced (no criterion, and a non-object)",
  );
  assertEqual(cmp.onChain.length, 2, "fallback excludes unusable entries");
}

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${checks} checks FAILED`);
  process.exit(1);
} else {
  console.log(`All ${checks} checks passed.`);
}
