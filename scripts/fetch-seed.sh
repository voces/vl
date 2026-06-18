#!/usr/bin/env bash
# Obtain a `build/vl-compiler.wasm` seed by downloading the rolling `seed-latest`
# release asset (a seed published by the previous master push; see
# docs/genesis-design.md). The fetched seed need only be new enough to compile
# current compiler/*.vl — refresh-compiler.sh self-compiles current source with it
# and native-fixpoint.sh re-proves it — so a one-push-stale `seed-latest` is fine.
#
# The published release IS the seed's source of truth: there is no TypeScript
# genesis path. `seed-v0` (the immutable tagged release) anchors the auditable
# lineage; every later seed self-compiles from the one before, gated by the
# fixpoint. (The TS stage-0 bootstrap was retired — the project does not maintain
# a second compiler.)
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${VL_SEED_REPO:-voces/vl}"
TAG="${VL_SEED_TAG:-seed-latest}"
ASSET="vl-compiler.wasm"
OUT="${SEED:-build/vl-compiler.wasm}"

# Idempotent: a present, non-empty seed is left untouched (refresh-compiler.sh
# overwrites it with a current-source rebuild regardless).
if [ -s "$OUT" ]; then
  echo "seed already present: $OUT ($(wc -c < "$OUT") bytes)"
  exit 0
fi

mkdir -p "$(dirname "$OUT")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fetch() {
  # Prefer gh (honors auth / private repos / rate limits), but FALL BACK to curl
  # when gh is absent OR fails — an unauthenticated gh on PATH errors out, and the
  # release asset is public, so the curl path (which 302s to the published GitHub
  # CDN range) still succeeds. Without this fallthrough an unauthenticated gh would
  # fail the whole fetch even though the bytes are reachable.
  if command -v gh >/dev/null 2>&1 && \
     gh release download "$TAG" --repo "$REPO" --pattern "$1" --dir "$WORK" --clobber 2>/dev/null; then
    return 0
  fi
  curl -fsSL "https://github.com/$REPO/releases/download/$TAG/$1" -o "$WORK/$1"
}

echo "== fetch $ASSET from $REPO release '$TAG' =="
if ! fetch "$ASSET"; then
  echo "ERROR: no seed in $OUT and could not fetch '$TAG/$ASSET' from $REPO." >&2
  echo "  Ensure network access to github.com (or 'gh auth login'); the seed is" >&2
  echo "  republished on every master push, so '$TAG' tracks current master." >&2
  exit 1
fi

# Integrity: verify against the published checksum sidecar when present. A corrupt
# download must fail closed — a bad seed would otherwise feed refresh-compiler.sh's
# self-compile and surface as a confusing downstream error.
if fetch "$ASSET.sha256"; then
  ( cd "$WORK" && sha256sum -c "$ASSET.sha256" >/dev/null ) || {
    echo "ERROR: checksum mismatch on $ASSET — refusing to install." >&2
    exit 1
  }
else
  echo "warn: no $ASSET.sha256 sidecar published; skipping integrity check" >&2
fi

mv "$WORK/$ASSET" "$OUT"
echo "fetched $OUT ($(wc -c < "$OUT") bytes) from $REPO '$TAG'"
