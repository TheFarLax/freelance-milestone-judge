"""Direct-mode tests for MilestoneJudge contract.

These tests run contracts in-memory without GenLayer Studio. Web and LLM
calls are mocked via direct_vm.mock_web() / direct_vm.mock_llm().

Run with: pytest tests/direct/test_milestone_judge.py -v
"""

import json


def _mock_eval(vm, decision="ACCEPT", explanation="All criteria satisfied", status=None):
    """Mock web and LLM for a milestone evaluation.

    `status` defaults to a value consistent with `decision`, because the
    contract downgrades contradictory combinations (for example REJECT with
    no "not_met" criterion) to INCONCLUSIVE.
    """
    if status is None:
        status = "met" if decision == "ACCEPT" else "not_met"
    vm.mock_web(
        r".*",
        {"status": 200, "body": "ok"},
    )
    vm.mock_llm(
        r".*ACCEPTANCE CRITERIA.*",
        json.dumps(
            {
                "criteria_results": [
                    {"criterion": "text deliverable", "status": status, "evidence": "present"}
                ],
                "decision": decision,
                "explanation": explanation,
            }
        ),
    )


def _deploy(vm, deploy, account):
    contract = deploy("contracts/milestone_judge.py")
    vm.sender = account
    return contract


def test_accept_valid_milestone(direct_vm, direct_deploy, direct_alice):
    """Deliverable satisfies all criteria → ACCEPT."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_eval(direct_vm, decision="ACCEPT", explanation="All criteria satisfied")

    contract.submit(
        milestone_id="m1",
        criteria="Provide a text deliverable.",
        deliverable="This is a text deliverable.",
    )

    result = json.loads(contract.get_verdict("m1"))
    assert result["decision"] == "ACCEPT"
    assert result["milestone_id"] == "m1"
    assert result["criteria_results"][0]["status"] == "met"


def test_reject_failed_criteria(direct_vm, direct_deploy, direct_alice):
    """Deliverable clearly fails a criterion → REJECT."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_eval(
        direct_vm,
        decision="REJECT",
        explanation="Deliverable missing required section.",
    )

    contract.submit(
        milestone_id="m2",
        criteria="Include an introduction.",
        deliverable="Just a short note.",
    )

    result = json.loads(contract.get_verdict("m2"))
    assert result["decision"] == "REJECT"


def test_inconclusive_insufficient_evidence(direct_vm, direct_deploy, direct_alice):
    """Ambiguous / missing evidence → INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_eval(
        direct_vm,
        decision="INCONCLUSIVE",
        explanation="Cannot verify criteria from provided text.",
    )

    contract.submit(
        milestone_id="m3",
        criteria="Verify identity of author.",
        deliverable="A document.",
    )

    result = json.loads(contract.get_verdict("m3"))
    assert result["decision"] == "INCONCLUSIVE"


def test_client_objections_included(direct_vm, direct_deploy, direct_alice):
    """Client objections are passed to the evaluator."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_eval(direct_vm, decision="INCONCLUSIVE", explanation="Objections unresolved")

    contract.submit(
        milestone_id="m4",
        criteria="Fix the formatting.",
        deliverable="Formatted text.",
        objections="The spacing looks wrong.",
    )

    result = json.loads(contract.get_verdict("m4"))
    assert result["decision"] == "INCONCLUSIVE"


def test_duplicate_milestone_rejected(direct_vm, direct_deploy, direct_alice):
    """Submitting the same milestone_id twice raises."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_eval(direct_vm)

    contract.submit(
        milestone_id="m5",
        criteria="Do something.",
        deliverable="Done.",
    )

    with direct_vm.expect_revert("Milestone already judged"):
        contract.submit(
            milestone_id="m5",
            criteria="Do something else.",
            deliverable="Also done.",
        )


def test_empty_criteria_rejected(direct_vm, direct_deploy, direct_alice):
    """Empty criteria must raise."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Milestone criteria must not be empty"):
        contract.submit(
            milestone_id="m6",
            criteria="",
            deliverable="Done.",
        )


def test_empty_deliverable_rejected(direct_vm, direct_deploy, direct_alice):
    """Empty deliverable must raise."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Deliverable must not be empty"):
        contract.submit(
            milestone_id="m7",
            criteria="Do something.",
            deliverable="",
        )


def test_get_verdict_for_missing_milestone(direct_vm, direct_deploy, direct_alice):
    """Reading a non-existent milestone raises."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Milestone not found"):
        contract.get_verdict("nonexistent")


def test_unparseable_llm_output_is_inconclusive(direct_vm, direct_deploy, direct_alice):
    """A model error string must not revert the transaction.

    Reverting would leave the milestone unsubmittable for good, since the
    duplicate guard rejects a second attempt.
    """
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(r".*ACCEPTANCE CRITERIA.*", "live_io LLM error: 401 Unauthorized")

    contract.submit(
        milestone_id="m9",
        criteria="Do something.",
        deliverable="Done.",
    )

    result = json.loads(contract.get_verdict("m9"))
    assert result["decision"] == "INCONCLUSIVE"
    assert contract.has_verdict("m9") is True


def test_has_verdict_returns_true(direct_vm, direct_deploy, direct_alice):
    """has_verdict returns True after submission."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_eval(direct_vm)

    assert contract.has_verdict("m8") is False

    contract.submit(
        milestone_id="m8",
        criteria="Criterion.",
        deliverable="Deliverable.",
    )

    assert contract.has_verdict("m8") is True


# ---------------------------------------------------------------------------
# Regression: gateway/LLM call failures must yield INCONCLUSIVE, never revert
# ---------------------------------------------------------------------------

def test_llm_forbidden_error_is_inconclusive_without_revert(
    direct_vm, direct_deploy, direct_alice
):
    """The glsim default model (gpt-4o-mini) is rejected by the gateway with
    a 403/401. The live_io handler returns an error string; the contract must
    treat it as INCONCLUSIVE instead of reverting the transaction.

    Regression for milestone "fmj-build-a-responsive-website-homepage-...":
    every validator produced INCONCLUSIVE because the LLM call failed.
    """
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(
        r".*ACCEPTANCE CRITERIA.*",
        "live_io LLM error: Client error '403 Forbidden' for url "
        "'https://api.openai.com/v1/chat/completions'\n"
        "For more information check: https://developer.mozilla.org/en-US/docs/"
        "HTTP/Status",
    )

    # Must not revert despite the evaluator failure.
    contract.submit(
        milestone_id="regress-1",
        criteria="Deliverable must contain the word 'complete'.",
        deliverable="The work is complete.",
    )

    result = json.loads(contract.get_verdict("regress-1"))
    assert result["decision"] == "INCONCLUSIVE"
    assert result["explanation"] == "Evaluator did not return a usable verdict."
    assert result["criteria_results"] == []
    assert contract.has_verdict("regress-1") is True


def test_llm_unauthorized_error_is_inconclusive(direct_vm, direct_deploy, direct_alice):
    """A 401 Unauthorized from the LLM gateway also yields INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(
        r".*ACCEPTANCE CRITERIA.*",
        "live_io LLM error: 401 Unauthorized",
    )

    contract.submit(
        milestone_id="regress-2",
        criteria="Deliverable must contain the word 'complete'.",
        deliverable="The work is complete.",
    )

    result = json.loads(contract.get_verdict("regress-2"))
    assert result["decision"] == "INCONCLUSIVE"
    assert result["criteria_results"] == []
    assert contract.has_verdict("regress-2") is True


def test_unsupported_provider_string_is_inconclusive(
    direct_vm, direct_deploy, direct_alice
):
    """An unsupported LLM provider error string yields INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(
        r".*ACCEPTANCE CRITERIA.*",
        "Unsupported LLM provider: glsim",
    )

    contract.submit(
        milestone_id="regress-3",
        criteria="Do x.",
        deliverable="Did x.",
    )

    result = json.loads(contract.get_verdict("regress-3"))
    assert result["decision"] == "INCONCLUSIVE"
    assert contract.has_verdict("regress-3") is True


# ---------------------------------------------------------------------------
# Regression: malformed evaluator output must not revert and stays usable
# ---------------------------------------------------------------------------

def test_garbage_llm_text_is_inconclusive(direct_vm, direct_deploy, direct_alice):
    """Completely unparseable LLM text yields INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(r".*ACCEPTANCE CRITERIA.*", "<<<not json at all>>>")

    contract.submit(
        milestone_id="regress-4",
        criteria="Do x.",
        deliverable="Did x.",
    )

    result = json.loads(contract.get_verdict("regress-4"))
    assert result["decision"] == "INCONCLUSIVE"
    assert contract.has_verdict("regress-4") is True


def test_empty_llm_response_is_inconclusive(direct_vm, direct_deploy, direct_alice):
    """An empty LLM response yields INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(r".*ACCEPTANCE CRITERIA.*", "")

    contract.submit(
        milestone_id="regress-5",
        criteria="Do x.",
        deliverable="Did x.",
    )

    result = json.loads(contract.get_verdict("regress-5"))
    assert result["decision"] == "INCONCLUSIVE"
    assert contract.has_verdict("regress-5") is True


def test_json_list_instead_of_object_is_inconclusive(
    direct_vm, direct_deploy, direct_alice
):
    """An LLM that returns a JSON array instead of an object yields INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(r".*ACCEPTANCE CRITERIA.*", json.dumps([1, 2, 3]))

    contract.submit(
        milestone_id="regress-6",
        criteria="Do x.",
        deliverable="Did x.",
    )

    result = json.loads(contract.get_verdict("regress-6"))
    assert result["decision"] == "INCONCLUSIVE"
    assert contract.has_verdict("regress-6") is True


def test_fenced_json_is_parsed_correctly(direct_vm, direct_deploy, direct_alice):
    """The LLM often wraps JSON in markdown code fences; the contract must
    strip them and produce a usable verdict rather than INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(
        r".*ACCEPTANCE CRITERIA.*",
        "```json\n"
        + json.dumps(
            {
                "criteria_results": [
                    {
                        "criterion_key": "text deliverable",
                        "criterion": "text deliverable",
                        "status": "met",
                        "evidence": "present",
                    }
                ],
                "decision": "ACCEPT",
                "explanation": "Criteria satisfied.",
            }
        )
        + "\n```",
    )

    contract.submit(
        milestone_id="regress-7",
        criteria="Provide a text deliverable.",
        deliverable="This is a text deliverable.",
    )

    result = json.loads(contract.get_verdict("regress-7"))
    assert result["decision"] == "ACCEPT"
    assert result["criteria_results"][0]["status"] == "met"


def test_missing_decision_key_is_inconclusive(direct_vm, direct_deploy, direct_alice):
    """An evaluator that returns criteria but no decision key yields INCONCLUSIVE."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_llm(
        r".*ACCEPTANCE CRITERIA.*",
        json.dumps(
            {
                "criteria_results": [
                    {
                        "criterion_key": "text deliverable",
                        "criterion": "text deliverable",
                        "status": "met",
                        "evidence": "present",
                    }
                ],
                "explanation": "Criteria satisfied.",
            }
        ),
    )

    contract.submit(
        milestone_id="regress-8",
        criteria="Provide a text deliverable.",
        deliverable="This is a text deliverable.",
    )

    result = json.loads(contract.get_verdict("regress-8"))
    assert result["decision"] == "INCONCLUSIVE"
    assert result["criteria_results"][0]["status"] == "met"
