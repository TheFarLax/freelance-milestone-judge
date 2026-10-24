# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
MilestoneJudge — evaluate a freelancer deliverable against agreed acceptance criteria.

The judgement is the intelligent part: whether free-form prose satisfies
free-form criteria is not decidable by deterministic code. The contract runs
the evaluation through the equivalence principle so validators agree on the
outcome, and stores the verdict on-chain.
"""

import json
from dataclasses import dataclass
from genlayer import *
import genlayer.gl.vm

DECISION_ACCEPT = "ACCEPT"
DECISION_REJECT = "REJECT"
DECISION_INCONCLUSIVE = "INCONCLUSIVE"
_VALID_DECISIONS = (DECISION_ACCEPT, DECISION_REJECT, DECISION_INCONCLUSIVE)

# Documented criterion status vocabulary. Anything else is coerced to
# INCONCLUSIVE so an unexpected label can never masquerade as "met".
STATUS_MET = "met"
STATUS_NOT_MET = "not_met"
STATUS_INCONCLUSIVE = "inconclusive"
_VALID_STATUSES = (STATUS_MET, STATUS_NOT_MET, STATUS_INCONCLUSIVE)

# Bumped whenever the shape or the comparison rules of the evaluated result
# change, so a stored verdict can be traced back to the rules that produced it.
EVALUATION_VERSION = "mi-v2"

_MAX_CRITERIA = 32
_MAX_TEXT = 4000


def _parse_llm_json(raw) -> dict:
    """Parse the evaluator's reply, tolerating code fences and stray prose.

    A model error or an unparseable reply must not revert the transaction:
    that would leave the milestone permanently unsubmittable because the
    duplicate guard only lets each id through once. Callers get an empty
    dict, which is treated as INCONCLUSIVE.
    """
    if isinstance(raw, dict):
        return raw
    s = str(raw).strip().replace("```json", "").replace("```", "").strip()
    start, end = s.find("{"), s.rfind("}") + 1
    if start < 0 or end <= start:
        return {}
    try:
        parsed = json.loads(s[start:end])
    except (ValueError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _normalise_key(text) -> str:
    """Canonical form of a criterion label used for identity comparison.

    Case, surrounding whitespace and internal whitespace are not meaningful,
    so they are flattened. The words themselves are kept: two criteria that
    differ in content must not collapse to the same key.
    """
    s = str(text).lower().strip()
    out = []
    last_was_space = False
    for ch in s:
        if ch.isspace():
            if not last_was_space:
                out.append(" ")
            last_was_space = True
        else:
            out.append(ch)
            last_was_space = False
    return "".join(out).strip()[:200]


def _normalise_status(raw) -> str:
    """Map a model-provided status onto the documented three-value vocabulary."""
    s = str(raw).lower().strip().replace("-", "_").replace(" ", "_")
    if s in _VALID_STATUSES:
        return s
    # Tolerate the common near-misses rather than silently treating them as
    # a positive assessment.
    if s in ("met", "satisfied", "pass", "passed", "fulfilled"):
        return STATUS_MET
    if s in ("not_met", "unmet", "failed", "fail", "missing", "unsatisfied"):
        return STATUS_NOT_MET
    return STATUS_INCONCLUSIVE


def _normalise_decision(raw, statuses) -> str:
    """Coerce the decision label, then reject combinations that contradict it.

    A model that says ACCEPT while listing a "not_met" criterion is internally
    inconsistent. Rather than store that contradiction, the decision is
    downgraded to INCONCLUSIVE.
    """
    s = str(raw).upper().strip()
    if s not in _VALID_DECISIONS:
        return DECISION_INCONCLUSIVE
    if s == DECISION_ACCEPT and STATUS_NOT_MET in statuses:
        return DECISION_INCONCLUSIVE
    if s == DECISION_ACCEPT and STATUS_INCONCLUSIVE in statuses:
        return DECISION_INCONCLUSIVE
    if s == DECISION_REJECT and STATUS_NOT_MET not in statuses:
        return DECISION_INCONCLUSIVE
    return s


def _normalise_criterion_results(raw_results) -> list:
    """Build a deterministic, defensively-parsed list of criterion results.

    Each entry has exactly the keys (criterion_key, criterion, status). The
    evidence text is deliberately excluded: it is free-form prose, and
    including it would make equivalence depend on wording rather than on the
    substantive assessment. Evidence is still stored for the reader.
    """
    if not isinstance(raw_results, list):
        return []
    entries = []
    seen_keys = set()
    for item in raw_results[:_MAX_CRITERIA]:
        if not isinstance(item, dict):
            continue
        label = ""
        for field in ("criterion", "criterion_id", "id", "label"):
            value = item.get(field)
            if isinstance(value, str) and value.strip():
                label = value.strip()[:_MAX_TEXT]
                break
        key = _normalise_key(label)
        if not key or key in seen_keys:
            # Two results for one criterion cannot be compared meaningfully
            # against a leader that reported only one.
            continue
        seen_keys.add(key)
        entries.append(
            {
                "criterion_key": key,
                "criterion": label,
                "status": _normalise_status(item.get("status")),
            }
        )
    # Sort so list order chosen by the model cannot cause a false mismatch.
    entries.sort(key=lambda e: e["criterion_key"])
    return entries


def _normalise_evaluation(raw) -> dict:
    """Turn a raw model reply into the canonical evaluated result.

    This is the single place where shape is enforced. Both the leader and
    every validator run it, so the compared objects are comparable by
    construction. It never raises: malformed input yields a well-formed
    INCONCLUSIVE result.
    """
    data = _parse_llm_json(raw)
    if not data:
        return {
            "evaluation_version": EVALUATION_VERSION,
            "decision": DECISION_INCONCLUSIVE,
            "criteria_results": [],
            "explanation": "Evaluator did not return a usable verdict.",
        }

    criteria_results = _normalise_criterion_results(data.get("criteria_results"))
    statuses = [c["status"] for c in criteria_results]
    decision = _normalise_decision(data.get("decision"), statuses)

    explanation = data.get("explanation")
    explanation = str(explanation)[:_MAX_TEXT] if explanation is not None else ""

    return {
        "evaluation_version": EVALUATION_VERSION,
        "decision": decision,
        "criteria_results": criteria_results,
        "explanation": explanation,
    }


def _substantive_digest(evaluation) -> dict:
    """The parts of an evaluation that validators must agree on.

    Explanation and evidence are excluded; decision plus per-criterion keys and
    statuses are included. Returns None when the shape is not a normalised
    evaluation, which callers treat as disagreement.
    """
    if not isinstance(evaluation, dict):
        return None
    if evaluation.get("evaluation_version") != EVALUATION_VERSION:
        return None
    results = evaluation.get("criteria_results")
    if not isinstance(results, list):
        return None

    pairs = []
    for item in results:
        if not isinstance(item, dict):
            return None
        key = item.get("criterion_key")
        status = item.get("status")
        if not isinstance(key, str) or status not in _VALID_STATUSES:
            return None
        normalised_key = _normalise_key(key)
        if not normalised_key:
            return None
        pairs.append((normalised_key, status))

    # Order is presentation, not substance: a different ordering of the same
    # assessments must still be equivalent.
    pairs.sort()

    return {
        "decision": evaluation.get("decision"),
        "criteria_count": len(pairs),
        "criteria": tuple(pairs),
    }


def _evaluations_equivalent(leader_result, validator_result) -> bool:
    """Compare two normalised evaluations on substance, not wording.

    Equivalent explanations with different wording pass. Any difference in the
    decision, in the set of criteria evaluated, or in the status of a single
    criterion fails.
    """
    a = _substantive_digest(leader_result)
    b = _substantive_digest(validator_result)
    if a is None or b is None:
        return False
    return a == b


@allow_storage
@dataclass
class Verdict:
    milestone_id: str
    judge: str
    decision: str
    explanation: str
    criteria_results_json: str


class MilestoneJudge(gl.Contract):
    verdicts: TreeMap[str, Verdict]

    def __init__(self):
        self.verdicts = TreeMap()

    @gl.public.write
    def submit(
        self, milestone_id: str, criteria: str, deliverable: str, objections: str = ""
    ) -> None:
        """Evaluate a submitted deliverable against milestone criteria."""
        if milestone_id in self.verdicts:
            raise gl.vm.UserError("Milestone already judged")
        if not criteria.strip():
            raise gl.vm.UserError("Milestone criteria must not be empty")
        if not deliverable.strip():
            raise gl.vm.UserError("Deliverable must not be empty")

        prompt = f"""You are adjudicating a freelance milestone.

ACCEPTANCE CRITERIA (agreed in advance):
{criteria}

SUBMITTED DELIVERABLE:
{deliverable}

CLIENT OBJECTIONS (may be empty):
{objections or "(none submitted)"}

Rules you must follow:
- Judge only the text supplied above. Never assume evidence that is not present.
- A client objection is a claim, not a fact. Only let it change the decision if the
  deliverable itself supports the objection.
- If a criterion cannot be checked from the deliverable, list it as "inconclusive".
- Do not invent criteria that were not listed.

Return JSON with exactly these keys:
{{
  "criteria_results": [{{
    "criterion_key": str,
    "criterion": str,
    "status": "met" | "not_met" | "inconclusive",
    "evidence": str
  }}],
  "decision": "ACCEPT" | "REJECT" | "INCONCLUSIVE",
  "explanation": str
}}

Field rules:
- "criterion_key" is a short stable slug for the criterion (lowercase, words
  separated by single spaces). Two runs must produce the same key for the same
  criterion, so derive it from the criterion text, not from your opinion.
- "criterion" is the criterion restated in the same words as the criteria list.
- "status" must be exactly one of "met", "not_met", "inconclusive".
- "evidence" is a short quote or pointer to the part of the deliverable you
  relied on. Never invent evidence.
- Emit exactly one entry per listed criterion, in the listed order.

Decision rule:
- ACCEPT only if every criterion is "met".
- REJECT only if at least one criterion is "not_met" and the deliverable does not
  plausibly satisfy it.
- Otherwise use INCONCLUSIVE (missing evidence, ambiguous criteria, or objections
  that cannot be resolved from the deliverable).
"""

        def leader_fn() -> dict:
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return _normalise_evaluation(raw)

        def validator_fn(leader_result) -> bool:
            # A leader error (UserError/VMError) is never agreement.
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                raw = gl.nondet.exec_prompt(prompt, response_format="json")
                mine = _normalise_evaluation(raw)
            except Exception:
                # If our own run fails we cannot corroborate the leader.
                return False
            leader_eval = leader_result.calldata
            if not isinstance(leader_eval, dict):
                return False
            return _evaluations_equivalent(leader_eval, mine)

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        decision = result["decision"] if isinstance(result, dict) else DECISION_INCONCLUSIVE
        if decision not in _VALID_DECISIONS:
            decision = DECISION_INCONCLUSIVE

        self.verdicts[milestone_id] = Verdict(
            milestone_id=milestone_id,
            judge=gl.message.sender_address.as_hex,
            decision=decision,
            explanation=str(result.get("explanation", "")),
            criteria_results_json=json.dumps(result.get("criteria_results", [])),
        )

    @gl.public.view
    def get_verdict(self, milestone_id: str) -> str:
        if milestone_id not in self.verdicts:
            raise gl.vm.UserError("Milestone not found")
        v = self.verdicts[milestone_id]
        return json.dumps(
            {
                "milestone_id": v.milestone_id,
                "judge": v.judge,
                "evaluation_version": EVALUATION_VERSION,
                "decision": v.decision,
                "explanation": v.explanation,
                "criteria_results": json.loads(v.criteria_results_json),
            },
            sort_keys=True,
        )

    @gl.public.view
    def has_verdict(self, milestone_id: str) -> bool:
        return milestone_id in self.verdicts
