"""Deployment step: deploy MilestoneJudge to the running local network.

Run it on its own to (re)deploy and print the address the frontend must use:

    gltest tests/integration/test_deploy_localnet.py -s -v

The address is also written to ``artifacts/deployed_address.json`` so it can
be copied into ``frontend/.env.local`` without transcription.
"""

import json
import os

import pytest
from gltest import get_contract_factory, get_default_account, get_gl_client

pytestmark = pytest.mark.integration

ARTIFACT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "artifacts",
    "deployed_address.json",
)


def test_deploy_milestone_judge():
    client = get_gl_client()
    print("\nglsim chain id:", client.chain.id if getattr(client, "chain", None) else "n/a")

    factory = get_contract_factory("MilestoneJudge")
    account = get_default_account()
    contract = factory.deploy(account=account, wait_interval=2000, wait_retries=120)

    address = contract.address
    assert address, "Deployment returned no address"
    assert address.startswith("0x") and len(address) == 42, address

    # Prove the deployment is live by calling a real view method.
    assert contract.has_verdict(["__deploy_probe__"]).call() is False

    payload = {"address": address, "rpc_url": "http://127.0.0.1:4000/api"}
    os.makedirs(os.path.dirname(ARTIFACT), exist_ok=True)
    with open(ARTIFACT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)

    print("\nDEPLOYED CONTRACT ADDRESS:", address)
    print("ARTIFACT:", ARTIFACT)
