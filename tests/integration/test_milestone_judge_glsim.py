"""Integration tests against a running glsim (or Studio) network.

Unlike the direct tests, nothing is mocked: each `submit` is a real
transaction that goes through GenVM, a real LLM call, and consensus across
the validators glsim was started with. Receipts are checked so a passing
test means the execution actually succeeded on-chain.

Start the network first:

    glsim --port 4000 --validators 3 --no-browser

Then run from the project root:

    gltest tests/integration -v -s

The `--no-browser` flag keeps glsim from opening the Studio UI. These tests
are skipped unless `--network` resolves to a reachable endpoint.
"""

import json
import socket
import urllib.parse

import pytest
from gltest import get_contract_factory, get_default_account, get_gl_client
from gltest.assertions import tx_execution_succeeded, tx_execution_failed
from gltest_cli.config.general import get_general_config

pytestmark = pytest.mark.integration


def _rpc_reachable(url: str, timeout: float = 2.0) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


@pytest.fixture(scope="module")
def rpc_url() -> str:
    url = get_general_config().get_rpc_url()
    if not _rpc_reachable(url):
        pytest.skip(
            f"No GenLayer network at {url}. Start glsim, e.g.: "
            "glsim --port 4000 --validators 3 --no-browser"
        )
    return url


@pytest.fixture(scope="module")
def client(rpc_url):
    return get_gl_client()


@pytest.fixture(scope="module")
def judge(client):
    """Deploy one contract instance for the whole module."""
    factory = get_contract_factory("MilestoneJudge")
    contract = factory.deploy(
        account=get_default_account(),
        wait_interval=2000,
        wait_retries=120,
    )
    return contract


def _submit_and_wait(judge, milestone_id, criteria, deliverable, objections=""):
    # gltest v0.29 binds contract methods as `method(args=[...])`, so all
    # arguments go in a single positional list.
    receipt = judge.submit(
        [milestone_id, criteria, deliverable, objections]
    ).transact(
        wait_interval=2000,
        wait_retries=120,
    )
    return receipt


def _read_verdict(judge, milestone_id):
    raw = judge.get_verdict([milestone_id]).call()
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Scenario 1: deliverable satisfies every criterion -> ACCEPT
# ---------------------------------------------------------------------------
def test_scenario_accept(judge):
    milestone_id = "int-accept-1"
    receipt = _submit_and_wait(
        judge,
        milestone_id=milestone_id,
        criteria=(
            "The deliverable must be a written project summary that:\n"
            "1. Names the project 'Orbit Tracker'.\n"
            "2. States the delivery date is 2026-03-15.\n"
            "3. Describes the main feature as live satellite pass alerts."
        ),
        deliverable=(
            "Project summary: Orbit Tracker, to be delivered on 2026-03-15. "
            "The main feature is live satellite pass alerts that notify the user "
            "before a tracked satellite crosses overhead."
        ),
    )
    assert tx_execution_succeeded(receipt), f"Execution failed: {receipt}"

    verdict = _read_verdict(judge, milestone_id)
    assert verdict["decision"] == "ACCEPT", verdict
    assert verdict["milestone_id"] == milestone_id
    assert len(verdict["criteria_results"]) == 3
    assert all(c["status"] == "met" for c in verdict["criteria_results"])
    print("\nACCEPT verdict:", json.dumps(verdict, indent=2, sort_keys=True))


# ---------------------------------------------------------------------------
# Scenario 2: deliverable clearly fails a criterion -> REJECT
# ---------------------------------------------------------------------------
def test_scenario_reject(judge):
    milestone_id = "int-reject-1"
    receipt = _submit_and_wait(
        judge,
        milestone_id=milestone_id,
        criteria=(
            "The deliverable must be a written project summary that:\n"
            "1. Names the project 'Orbit Tracker'.\n"
            "2. States the delivery date is 2026-03-15.\n"
            "3. Describes the main feature as live satellite pass alerts."
        ),
        deliverable=(
            "Project summary: Orbit Tracker. The main feature is live satellite "
            "pass alerts. No timeline has been agreed yet."
        ),
    )
    assert tx_execution_succeeded(receipt), f"Execution failed: {receipt}"

    verdict = _read_verdict(judge, milestone_id)
    assert verdict["decision"] == "REJECT", verdict
    statuses = {c["criterion"].lower(): c["status"] for c in verdict["criteria_results"]}
    not_met = [c for c in verdict["criteria_results"] if c["status"] == "not_met"]
    assert not_met, verdict
    assert any("date" in k or "timeline" in k for k in statuses), verdict
    print("\nREJECT verdict:", json.dumps(verdict, indent=2, sort_keys=True))


# ---------------------------------------------------------------------------
# Scenario 3: deliverable supplies no evidence for the claim
# ---------------------------------------------------------------------------
def test_scenario_unproven_claim_is_not_accepted(judge):
    """A bare assertion is never an ACCEPT.

    Note the live model can legitimately answer either INCONCLUSIVE ("cannot
    be checked") or REJECT ("the criterion is plainly unmet"). Both are
    defensible; what matters is that an unsupported claim is not accepted.
    """
    milestone_id = "int-inconclusive-1"
    receipt = _submit_and_wait(
        judge,
        milestone_id=milestone_id,
        criteria=(
            "The deliverable must prove the applicant has 5 years of "
            "professional Python experience, with employer references."
        ),
        deliverable=(
            "I have written Python before and I am confident I can do this job."
        ),
    )
    assert tx_execution_succeeded(receipt), f"Execution failed: {receipt}"

    verdict = _read_verdict(judge, milestone_id)
    assert verdict["decision"] in ("INCONCLUSIVE", "REJECT"), verdict
    assert all(c["status"] != "met" for c in verdict["criteria_results"]), verdict
    print("\nUnproven-claim verdict:", json.dumps(verdict, indent=2, sort_keys=True))


# ---------------------------------------------------------------------------
# Scenario 3b: a criterion that genuinely cannot be checked -> INCONCLUSIVE
# ---------------------------------------------------------------------------
def test_scenario_inconclusive_unverifiable_criterion(judge):
    """The criterion asks for something the text form cannot settle.

    The deliverable does mention the required facts, but whether those facts
    hold is not checkable from a text submission, so the model should decline
    to accept rather than assert success.
    """
    milestone_id = "int-inconclusive-unverifiable-1"
    receipt = _submit_and_wait(
        judge,
        milestone_id=milestone_id,
        criteria=(
            "The deliverable must demonstrate that the deployed service is "
            "reachable at https://api.example.com/health and returns 200."
        ),
        deliverable=(
            "Deployment is finished. The service is available at "
            "https://api.example.com/health."
        ),
    )
    assert tx_execution_succeeded(receipt), f"Execution failed: {receipt}"

    verdict = _read_verdict(judge, milestone_id)
    assert verdict["decision"] in ("INCONCLUSIVE", "REJECT"), verdict
    print("\nUnverifiable-criterion verdict:", json.dumps(verdict, indent=2, sort_keys=True))


# ---------------------------------------------------------------------------
# Scenario 4: client objections that the deliverable cannot resolve
# ---------------------------------------------------------------------------
def test_scenario_client_objections(judge):
    milestone_id = "int-objections-1"
    receipt = _submit_and_wait(
        judge,
        milestone_id=milestone_id,
        criteria=(
            "The deliverable must be a logo file description that:\n"
            "1. Uses the brand colour navy blue.\n"
            "2. Includes the company name 'Northwind'."
        ),
        deliverable=(
            "A circular logo mark described as navy blue with the word "
            "Northwind rendered in a serif typeface."
        ),
        objections=(
            "The client says the logo does not look navy in print and claims "
            "the company name is misspelled, but cannot say in what way."
        ),
    )
    assert tx_execution_succeeded(receipt), f"Execution failed: {receipt}"

    verdict = _read_verdict(judge, milestone_id)
    assert verdict["decision"] in ("INCONCLUSIVE", "ACCEPT"), verdict
    assert verdict["explanation"], verdict
    print("\nObjections verdict:", json.dumps(verdict, indent=2, sort_keys=True))


# ---------------------------------------------------------------------------
# Guard clauses still hold on a real network
# ---------------------------------------------------------------------------
def test_duplicate_milestone_fails_on_chain(judge):
    milestone_id = "int-duplicate-1"
    ok = _submit_and_wait(
        judge,
        milestone_id=milestone_id,
        criteria="Deliverable must contain the word 'complete'.",
        deliverable="The work is complete.",
    )
    assert tx_execution_succeeded(ok), f"First submission failed: {ok}"

    dup = _submit_and_wait(
        judge,
        milestone_id=milestone_id,
        criteria="Different criteria.",
        deliverable="Different deliverable.",
    )
    assert tx_execution_failed(dup), f"Duplicate was accepted: {dup}"
    assert "Milestone already judged" in json.dumps(dup), dup


def test_has_verdict_reflects_chain_state(judge):
    assert judge.has_verdict(["int-accept-1"]).call() is True
    assert judge.has_verdict(["int-never-submitted"]).call() is False
