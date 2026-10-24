# Localnet backup

Preserved configuration for the local glsim setup (chain ID 61127).

Note: do NOT keep this inside `artifacts/` — `gltest` clears that directory on
every run.

To restore Localnet for local development:
    cp localnet-backup/env.local.localnet frontend/.env.local
    cp localnet-backup/gltest.config.localnet.yaml gltest.config.yaml

The Localnet contract address only exists while a glsim instance holds that
chain state; after a restart it must be redeployed.
