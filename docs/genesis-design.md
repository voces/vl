# Genesis without TypeScript — release-artifact bootstrap

## Problem

VL is self-hosting: `scripts/refresh-compiler.sh` rebuilds the seed
`build/vl-compiler.wasm` by self-compiling `compiler/*.vl` with an *existing*
seed via the Rust host (`scripts/vl-host`), and `scripts/native-fixpoint.sh`
proves the result is a byte-for-byte fixpoint. None of that touches TypeScript.

The one remaining TS dependence is **genesis**: minting the *first* seed when
none exists. Today that path is the legacy TS emitter — `refresh-compiler.sh`
falls back to `deno run -A scripts/build-compiler-wasm.ts`
(`compiler/compile.ts` → `toWasm.ts`) when there is no seed or the seed is too
stale to compile current source. The entire `compile.ts`/`toWasm.ts` stack
exists only to serve that one moment. A cold clone, or a cold CI cache, is
therefore forced to "compile VL with TS before VL can compile itself."

## Decision

Publish the seed as a **GitHub release artifact** and have a fresh tree / cold
CI cache *download* it instead of minting it via TS. The repository stays
binary-free (`build/` remains gitignored); the seed lives in releases, not
history. After a one-time `seed-v0` mint, TS is on no automatic path.

## Why this is cheap: the freshness invariant

`refresh-compiler.sh` already tolerates a **stale-but-capable** seed: it only
needs a newer seed when `compiler/*.vl` starts *using* a construct the seed's
emitter cannot lower yet (the "seed cannot compile current source" branch). The
single invariant we must maintain is therefore:

> the published seed can compile *current* master.

We satisfy it by **republishing the seed on every master push** — each push's
seed is compiled by the *previous* published seed, gated through
`native-fixpoint.sh`, then re-published. Consumers never need a per-commit seed:
`fetch-seed.sh` always pulls `seed-latest`, and `refresh-compiler.sh` then
self-compiles current source with it. Compatibility is proven *at use time* by
the existing fixpoint gate — no version-matching logic.

## Asset contract

Rolling pre-release, tag **`seed-latest`** (continuously re-pointed):

| asset | meaning |
| --- | --- |
| `vl-compiler.wasm` | the seed; overwritten each master push (the "latest" pointer) |
| `vl-compiler.wasm.sha256` | checksum sidecar; `fetch-seed.sh` fails closed on mismatch |
| `seed-fingerprint.txt` | `sha256` over `compiler/*.vl` + `scripts/vl-compiler-driver.vl`, plus the producing commit SHA (provenance) |

A second immutable tagged release **`seed-v0`** preserves the auditable genesis
artifact (the one seed ever minted by TS).

## Bootstrap flow

```
scripts/fetch-seed.sh        # download seed-latest into build/ (idempotent)
scripts/refresh-compiler.sh  # self-compile current source with it
scripts/native-fixpoint.sh   # re-prove stage3 == stage4 byte-for-byte
```

`fetch-seed.sh` verifies the checksum sidecar, is a no-op when a seed is already
present, and on no-network prints an explicit error pointing at the break-glass.

### Break-glass: `--ts-genesis`

`scripts/build-compiler-wasm.ts` (and `compile.ts`/`toWasm.ts`) are **retained**
but removed from every automatic path. `scripts/fetch-seed.sh --ts-genesis`
(or `VL_SEED_TS_GENESIS=1`) mints a seed locally via deno — the documented
last resort for air-gapped first bootstraps, and the mechanism for the one-time
`seed-v0` mint. Keeping it is deliberate: it is the only existence proof that the
seed is reconstructable from source without trusting a binary, which matters for
supply-chain/reproducibility.

## Self-perpetuation and `seed-v0`

The first `seed-latest` has no prior seed to be compiled by, so it is minted once
via TS (`--ts-genesis`) — **the last legitimate TS-genesis use** — gated through
`native-fixpoint.sh`, and published as both `seed-v0` and `seed-latest`.
Thereafter every master push compiles new source with the previously published
seed and republishes: `build-compiler-wasm.ts` is never on an automatic path
again.

## Implementation (ordered)

1. **`scripts/fetch-seed.sh`** + this doc — the downloader and design. Inert
   until wired; zero change to live behavior. *(this PR)*
2. **`.github/workflows/publish-seed.yml`** — on `push: branches: [master]` (+
   `workflow_dispatch`): build the Rust host, restore the seed cache, refresh +
   fixpoint as a gate, then upload the three assets to `seed-latest`. Needs
   `contents: write`.
3. **One-time `seed-v0` mint** — dispatch the workflow once with
   `VL_SEED_TS_GENESIS=1` to mint and publish the genesis seed.
4. **`scripts/refresh-compiler.sh`** — flip the fallback from `ts_bootstrap` to
   `fetch-seed.sh`: on a missing seed, fetch then fall through to the self-compile
   step (the fetched seed may be one push stale); on a fetched seed that *still*
   cannot compile current source, fail loud pointing at `--ts-genesis` rather
   than silently re-entering TS.
5. **`.github/workflows/ci.yml`** (`ci-native`) — cold-cache path fetches the
   release instead of TS-minting; drop the `setup-node` + `npm ci` steps that
   exist solely to feed the TS fallback. Keep the seed cache as the warm path and
   deno for the non-genesis test tooling (golden check, corpus oracle).
6. **(separable) released binary** — switch the release artifact from the TS CLI
   (`deno compile compiler/cli.ts`) to the Rust host (`scripts/vl-host`), shipping
   `vl` + seed together. Does not block the genesis goal.

## Risk / rollback

- **`seed-latest` unavailable** (release deleted, outage, network block):
  `fetch-seed.sh` fails with an explicit error. A contributor with any healthy
  local seed (prior run or cache) is unaffected. A truly cold contributor uses
  `--ts-genesis`. The TS path is gone from automatic flows but kept as break-glass.
- **Corrupt download**: the `.sha256` check fails closed; CI re-runs
  `native-fixpoint.sh` every time, so a bad seed cannot silently pass.
- **Republish loop breaks** (a master push whose source the prior seed cannot
  compile): `publish-seed.yml` runs with the fixpoint as a gate, so it fails
  loudly and `seed-latest` stays pinned to the last-good seed; the author re-mints
  via `--ts-genesis` in that PR. No automatic TS re-introduction.
- **Local regeneration**: `cargo build --release` in `scripts/vl-host`, then
  `scripts/fetch-seed.sh` (online) or `--ts-genesis` (offline), then
  `scripts/refresh-compiler.sh`.
