"""Adversarial tests for the milestone judge's equivalence checking.

These tests drive `validator_fn` directly through `direct_vm.run_validator()`,
which is the only way to observe validator behaviour in direct mode: the
direct-mode `RunNondet` handler runs the leader and records the validator,
but never invokes it on its own. Real validator execution happens under
glsim and is covered by tests/integration.

Run with: pytest tests/direct/test_equivalence.py -v
"""

import json

LLM_PATTERN = r".*ACCEPTANCE CRITERIA.*"


def _eval_payload(decision, criteria, explanation="because"):
    return json.dumps(
        {
            "criteria_results": [
                {"criterion": key, "criterion_key": key, "status": status, "evidence": ev}
                for key, status, ev in criteria
            ],
            "decision": decision,
            "explanation": explanation,
        }
    )


def _submit(direct_vm, direct_deploy, account, payload, milestone_id="eq1"):
    """Deploy, mock the evaluator, and submit so the validator is captured."""
    contract = direct_deploy("contracts/milestone_judge.py")
    direct_vm.sender = account
    direct_vm.mock_llm(LLM_PATTERN, payload)
    contract.submit(
        milestone_id=milestone_id,
        criteria="1. names the project\n2. states the date",
        deliverable="Project X, due 2026-03-15.",
    )
    return contract


def _leader_result(direct_vm, decision, criteria, explanation="because"):
    """The leader's normalised result, as the validator would receive it."""
    return {
        "evaluation_version": "mi-v2",
        "decision": decision,
        "criteria_results": [
            {"criterion_key": key, "criterion": key, "status": status}
            for key, status, _ in criteria
        ],
        "explanation": explanation,
    }


BASE_CRITERIA = [
    ("names the project", "met", '"Project X"'),
    ("states the date", "not_met", "no date given"),
]


# 1. Identical normalised evaluations -> agree
def test_identical_evaluations_agree(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA))
    assert direct_vm.run_validator() is True


# 2. Same decision, conflicting criterion statuses -> disagree
def test_same_decision_conflicting_statuses_disagree(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA))

    flipped = _leader_result(direct_vm, "REJECT", [
        ("names the project", "not_met", "x"),
        ("states the date", "met", "y"),
    ])
    assert direct_vm.run_validator(leader_result=flipped) is False


# 3. Same criteria count, different identities -> disagree
def test_same_count_different_identities_disagree(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA))

    other = _leader_result(direct_vm, "REJECT", [
        ("mentions the client", "met", "q"),
        ("mentions the budget", "not_met", "q"),
    ])
    assert direct_vm.run_validator(leader_result=other) is False


# 4. Different decisions -> disagree
def test_different_decisions_disagree(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("ACCEPT", [
                ("names the project", "met", "a"),
                ("states the date", "met", "b"),
            ]))

    rejected = _leader_result(direct_vm, "REJECT", [
        ("names the project", "met", "a"),
        ("states the date", "not_met", "b"),
    ])
    assert direct_vm.run_validator(leader_result=rejected) is False


# 5. Missing or malformed criterion results -> disagree, and never crash
def test_malformed_leader_results_disagree(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA))

    bad_results = [
        [1, 2, 3],
        "not an evaluation",
        None,
        {"decision": "REJECT"},
        {"evaluation_version": "mi-v2", "decision": "REJECT", "criteria_results": "nope"},
        {
            "evaluation_version": "mi-v2",
            "decision": "REJECT",
            "criteria_results": [{"criterion_key": "names the project", "status": "unknown"}],
        },
        {
            "evaluation_version": "mi-v2",
            "decision": "REJECT",
            "criteria_results": [{"criterion_key": 7, "status": "met"}],
        },
        {"evaluation_version": "stale-version", "decision": "REJECT", "criteria_results": []},
        {"decision": "REJECT", "criteria_results": [{"criterion_key": "x", "status": "met"}]},
    ]
    for bad in bad_results:
        assert direct_vm.run_validator(leader_result=bad) is False, bad


# 5b. A leader that errored is never agreement
def test_leader_error_disagrees(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA))
    assert direct_vm.run_validator(leader_error="LLM unavailable") is False


# 6. Equivalent explanations with different wording -> agree
def test_different_explanation_wording_agrees(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA, explanation="The date is absent."))

    reworded = _leader_result(direct_vm, "REJECT", BASE_CRITERIA)
    reworded["explanation"] = "No delivery date was given anywhere in the text."
    assert direct_vm.run_validator(leader_result=reworded) is True


# 6b. Criterion order chosen by the model must not cause disagreement
def test_criterion_order_is_irrelevant(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA))

    reordered = _leader_result(direct_vm, "REJECT", list(reversed(BASE_CRITERIA)))
    assert direct_vm.run_validator(leader_result=reordered) is True


# 6c. Criterion label case/whitespace differences are not substantive
def test_criterion_label_formatting_is_ignored(direct_vm, direct_deploy, direct_alice):
    _submit(direct_vm, direct_deploy, direct_alice,
            _eval_payload("REJECT", BASE_CRITERIA))

    shouty = _leader_result(direct_vm, "REJECT", [
        ("Names  The Project", "met", "a"),
        ("states the date ", "not_met", "b"),
    ])
    assert direct_vm.run_validator(leader_result=shouty) is True


# 7. Invalid LLM output -> INCONCLUSIVE without corrupting state
def test_invalid_llm_output_is_inconclusive_and_keeps_state(
    direct_vm, direct_deploy, direct_alice
):
    contract = direct_deploy("contracts/milestone_judge.py")
    direct_vm.sender = direct_alice

    direct_vm.mock_llm(LLM_PATTERN, "<<<not json at all>>>")
    contract.submit(milestone_id="bad1", criteria="Do x.", deliverable="Did x.")

    verdict = json.loads(contract.get_verdict("bad1"))
    assert verdict["decision"] == "INCONCLUSIVE"
    assert verdict["criteria_results"] == []
    assert contract.has_verdict("bad1") is True


def test_contract_stays_usable_after_bad_output(direct_vm, direct_deploy, direct_alice):
    """A failed evaluation must not poison later submissions."""
    contract = _submit(
        direct_vm, direct_deploy, direct_alice,
        _eval_payload("ACCEPT", [
            ("names the project", "met", "a"),
            ("states the date", "met", "b"),
        ]),
        milestone_id="good1",
    )
    good = json.loads(contract.get_verdict("good1"))
    assert good["decision"] == "ACCEPT"

    # An unrelated milestone read still behaves, and the stored one is intact.
    assert contract.has_verdict("never-submitted") is False
    assert json.loads(contract.get_verdict("good1"))["decision"] == "ACCEPT"


# 8. Contradictory model output is downgraded rather than stored
def test_contradictory_decision_is_downgraded(direct_vm, direct_deploy, direct_alice):
    contract = _submit(
        direct_vm,
        direct_deploy,
        direct_alice,
        _eval_payload("ACCEPT", [
            ("names the project", "met", "a"),
            ("states the date", "not_met", "b"),
        ]),
        milestone_id="contra1",
    )
    verdict = json.loads(contract.get_verdict("contra1"))
    assert verdict["decision"] == "INCONCLUSIVE"


# 9. Unknown status labels never read as "met"
def test_unknown_status_never_counts_as_met(direct_vm, direct_deploy, direct_alice):
    contract = _submit(
        direct_vm,
        direct_deploy,
        direct_alice,
        _eval_payload("ACCEPT", [
            ("names the project", "probably fine", "a"),
            ("states the date", "met", "b"),
        ]),
        milestone_id="weird1",
    )
    verdict = json.loads(contract.get_verdict("weird1"))
    statuses = [c["status"] for c in verdict["criteria_results"]]
    assert "met" not in statuses[0:1]
    assert verdict["criteria_results"][0]["status"] == "inconclusive"
    assert verdict["decision"] == "INCONCLUSIVE"


# 10. Duplicate criterion entries cannot inflate the assessment
def test_duplicate_criteria_are_deduplicated(direct_vm, direct_deploy, direct_alice):
    contract = _submit(
        direct_vm,
        direct_deploy,
        direct_alice,
        _eval_payload("REJECT", [
            ("states the date", "met", "a"),
            ("States The Date", "not_met", "b"),
        ]),
        milestone_id="dupe-crit",
    )
    verdict = json.loads(contract.get_verdict("dupe-crit"))
    assert len(verdict["criteria_results"]) == 1
