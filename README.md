# Freelance Milestone Judge — GenLayer Intelligent Contract POC

A minimal GenLayer Intelligent Contract that evaluates a freelancer's deliverable against agreed milestone acceptance criteria and records an on-chain verdict.

A Next.js frontend lets a client create milestones, submit deliverables, and read the validator-backed verdict back from the chain.

## Deployed on GenLayer StudioNet

| | |
|---|---|
| Network | GenLayer StudioNet |
| Chain ID | `61999` (`0xf22f`) |
| RPC | `https://studio.genlayer.com/api` |
| Contract address | `0xF12f7fD23d1092eC8739CF9812299A0F2D1AA7cD` |
| Evaluation version | `mi-v2` |

StudioNet is a hosted testnet. You need test GEN from the faucet on the StudioNet
dashboard to pay transaction fees. **Do not send real funds.**

## Technology stack

| Layer | Technology |
|---|---|
| Contract | GenLayer Intelligent Contract (Python, `genlayer-py`) |
| Consensus | `glvm.run_nondet_unsafe` — leader/validator equivalence re-execution |
| LLM | `gl.nondet.exec_prompt` with JSON response format |
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Web3 | `genlayer-js` 1.1.8, `viem`, MetaMask |
| Data | TanStack Query; milestone metadata in `localStorage` |
| Tests | pytest (direct mode), `gltest` + `glsim` (integration) |

## Frontend quick start

```bash
cd frontend
npm install
cp .env.example .env.local      # then fill in the values
npm run dev                     # http://localhost:3000
```

For a production build:

```bash
npm run build
npm start
```

Do not run `dev` and `start` against the same `.next` directory at the same
time — both write to it and can corrupt the build output.

### Environment variables

All frontend variables are public build-time values (they are prefixed
`NEXT_PUBLIC_` and end up in the client bundle). Never put a private key, seed
phrase, or API secret in any `NEXT_PUBLIC_*` variable.

| Variable | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_GENLAYER_NETWORK` | Target network | `studionet` |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | RPC endpoint | `https://studio.genlayer.com/api` |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed contract | `0x...` (40 hex chars) |
| `OPENAI_API_KEY` | Only for the local `glsim` launcher, read from the environment | — |

Preserve the exact casing of the contract address. StudioNet resolves contracts
by literal address string, so a lowercased address refers to a different,
non-existent contract.

### Using the app

1. Open the app and connect MetaMask. The app offers to add/switch to GenLayer
   StudioNet (chain ID 61999).
2. **Create Milestone** — title, description, and acceptance criteria. This is
   saved to the browser's `localStorage` only; no transaction is sent.
3. **Submit Deliverable** — pick the milestone, paste the deliverable and any
   objections, then approve the MetaMask transaction. This calls the contract.
4. Wait for the evaluation. The contract runs a real LLM adjudication through
   validator consensus, so expect roughly 30–90 seconds.
5. **Evaluation Results** — open the verdict from the dashboard. Refresh the
   page to confirm it is read from the chain, not from local state.

Note that the contract stores only the verdict, keyed by `milestone_id`. Title,
description, criteria, and deliverable text never leave the browser.

### Testing

Frontend type check:

```bash
cd frontend && npm run lint
```

Contract tests are described under [Testing](#testing) below.

## What this does

A client submits:

- `milestone_id` — unique identifier
- `criteria` — the agreed acceptance requirements
- `deliverable` — the freelancer's submitted text
- `objections` — optional client objections

The contract runs an LLM-assisted adjudication through GenLayer's equivalence principle, producing one of:

- `ACCEPT` — every criterion satisfied
- `REJECT` — at least one criterion not satisfied
- `INCONCLUSIVE` — evidence missing, criteria ambiguous, or objections unresolvable

The verdict, explanation, and per-criterion results are stored on-chain.

## How it works

| GenLayer capability | Purpose |
|---|---|
| `gl.nondet.exec_prompt(prompt, response_format="json")` | LLM reads criteria + deliverable + objections and returns a JSON verdict |
| `glvm.run_nondet_unsafe(leader_fn, validator_fn)` | Equivalence principle — validators re-run the leader's LLM prompt and compare decisions |
| `TreeMap[str, Verdict]` | On-chain storage of verdicts keyed by milestone ID |
| `gl.vm.UserError(...)` | Guard clauses for duplicate milestones, empty criteria, empty deliverables |
| `direct_vm.mock_llm(...)` | Direct-mode test mocking of LLM responses |

## Requirements

- Python 3.12+

## Setup

```bash
# 1. Clone or navigate to this project directory
cd freelance-milestone-judge

# 2. Create a Python 3.12 virtual environment
python3.12 -m venv .venv

# 3. Activate it
source .venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Install pytest
pip install pytest
```

`requirements.txt` includes `genlayer-py`, `genlayer-test`, `genvm-linter`, `web3`, and supporting packages.

## Linting

```bash
genvm-lint check contracts/milestone_judge.py
```

Expected output: validation passes. The contract defines 3 methods (2 view, 1 write).
Note: genvm-lint may emit a heuristic warning about the nested `leader_fn` containing `gl.nondet.exec_prompt`. This is a linter limitation; contract validation passes and direct-mode tests execute correctly.

## Testing

### Direct-mode tests (fast, no network)

Run in-memory with web/LLM mocked:

```bash
pytest tests/direct -v
```

Expected: 10 passed.

### Integration tests (real GenVM, real LLM, real consensus)

These run against a local glsim network. Nothing is mocked: each `submit` is a
real transaction, the LLM is called for real, and every configured validator
re-runs the prompt independently.

```bash
# Terminal 1 - start a clean network (3 validators)
GLSIM_LOG_LLM=1 python scripts/run_glsim.py \
    --port 4000 --validators 3 --provider openai:gemini-2.5-flash --no-browser

# Terminal 2 - run the suite from the project root
gltest tests/integration -v -s --default-wait-retries 250
```

Expected: 7 passed, taking roughly 2 minutes. Because each transaction triggers
one leader call plus one call per validator, a 3-validator network makes 4 model
calls per submission.

Restart glsim between runs: it keeps chain state in memory, so milestone IDs
from a previous run are already judged and a rerun will fail the duplicate
guard.

`scripts/run_glsim.py` exists because glsim's built-in OpenAI handler always
posts to `api.openai.com` and ignores `OPENAI_BASE_URL`. The launcher redirects
that call to any OpenAI-compatible gateway without modifying installed packages.

## Project structure

```
contracts/
  milestone_judge.py              # The Intelligent Contract (this POC)
frontend/                         # Next.js app
  app/                            # App Router routes
    page.tsx                      # Dashboard / milestone list
    create-milestone/             # Milestone creation form
    submit-deliverable/           # Submit + evaluation trigger
    evaluation-results/           # Verdict display
    globals.css                   # Theme tokens and shared utilities
  components/                     # App shell, logo, UI primitives
  lib/
    contracts/                    # Contract wrapper + local metadata store
    genlayer/                     # Client, network config, WalletProvider
    hooks/                        # TanStack Query hooks
  public/                         # Static assets (logo)
  .env.example                    # Environment variable template
tests/
  direct/
    test_milestone_judge.py       # Direct-mode tests (10 tests, mocked LLM)
    test_equivalence.py           # Equivalence-principle tests
  integration/
    test_milestone_judge_glsim.py # Real-LLM tests against glsim (7 tests)
    test_deploy_localnet.py       # Localnet deployment helper
scripts/
  run_glsim.py                    # Starts glsim with a custom LLM gateway
localnet-backup/                  # Preserved Localnet config (public values only)
gltest.config.yaml                # Network configuration (localnet)
requirements.txt                  # Python dependencies
README.md                         # This file
```

## Contract API

### `submit(milestone_id, criteria, deliverable, objections="")` — write
Submit a milestone for evaluation. Returns nothing; verdict stored on-chain.

### `get_verdict(milestone_id)` — view → JSON string
Returns the full verdict object as JSON: `milestone_id`, `judge`, `decision`, `explanation`, `criteria_results`.

### `has_verdict(milestone_id)` — view → bool
Check whether a milestone has been judged.

## What this POC does NOT include (intentionally out of scope)

- Real-money escrow or payment settlement
- IPFS uploads / evidence storage
- Frontend
- Wallet integration / authentication
- Reputation systems
- Multi-chain support
- Automated background monitoring
- Testnet deployment

## Unresolved technical limitations

1. **genvm-lint heuristic warning**: The linter reports `gl.nondet.* call in leader_fn not reachable from equivalence principle block`, yet contract validation passes and direct-mode tests execute correctly. This appears to be a linter heuristic limitation with nested functions. The contract still runs successfully in direct mode.

2. **LLM model dependency**: Direct-mode tests mock `gl.nondet.exec_prompt`. Actual execution on GenLayer Studio or testnet requires the LLM to be available in the execution environment and respects the equivalence principle (leader/validator agreement).

3. **Verdict is probabilistic**: The LLM adjudication is not deterministic. Two validators may return different interpretations of ambiguous criteria. The contract captures `INCONCLUSIVE` for unresolvable cases, but the outcome is still model-dependent.

   A related ambiguity is visible in practice: for a deliverable that simply
   asserts a claim ("I have 5 years of experience") the model may answer
   `REJECT` (the criterion is plainly unmet) or `INCONCLUSIVE` (nothing can be
   checked). Both readings are defensible under the current prompt. If the
   distinction matters for release, the prompt needs an explicit rule for
   "criterion requires evidence that the submission was expected to contain".

4. **Consensus is agreement, not correctness**: `validator_fn` now compares the
   leader's decision with every validator's independently-recomputed evaluation
   on substance: the decision label, the set of criterion identities, and each
   criterion's normalized status. Explanation wording and evidence text are
   intentionally excluded, so validators can agree on substance while writing
   different explanations — which is desired, since equivalence is about the
   substantive assessment, not wording. What `validator_fn` cannot do is judge
   whether the LLM's assessment itself is correct; it only establishes that the
   leader and validators independently arrived at the same substantive verdict.

5. **Local verification is glsim only**: The integration suite has been run
   against a locally started glsim network. It has **not** been run against
   GenLayer Studio or any public testnet, so nothing here establishes behaviour
   on those networks.

## Dependencies on the original boilerplate

This project is self-contained. It does not depend on any files outside its directory.
- `gltest.config.yaml` provides the direct-mode network configuration (`localnet` at `http://127.0.0.1:4000/api`).
- No `.env` file is required for direct-mode tests.
- No code is imported from the original `genlayer-project-boilerplate` repository.

## Documentation references

- SDK API reference: https://sdk.genlayer.com/main/_static/ai/api.txt
- Full documentation: https://docs.genlayer.com/full-documentation.txt
- Main docs: https://docs.genlayer.com/
- Intelligent Contracts introduction: https://docs.genlayer.com/developers/intelligent-contracts/introduction
- Contract examples: https://docs.genlayer.com/developers/intelligent-contracts/examples/storage
- Deploying contracts: https://docs.genlayer.com/developers/intelligent-contracts/deploying
- Crafting prompts: https://docs.genlayer.com/developers/intelligent-contracts/crafting-prompts

## Lint and test

```bash
genvm-lint check contracts/milestone_judge.py
pytest tests/direct -q
gltest tests/integration -v -s --default-wait-retries 250   # needs glsim running
```
