## Infrastructure (Track F)

- **CI drops the retired queue's machinery and two always-on jobs' idle runs:** the `ci-proof` job, `ci-proof.sh verify`, `gate.sh`'s `GATE_CI_PROOF` skip, ci-verdict's `gated` mode and the docs-only `vl-queue` arm are deleted (`ci-proof.sh rows` stays). `ci-embed-seed` builds only when `scripts/vl-host/`, `fetch-seed.sh` or `ci.yml` changes, plus nightly and manual runs; `ci-cost` part 1 runs its steps only when a pull request touches the compiler, std or its own inputs. Skipped steps leave each job green.
