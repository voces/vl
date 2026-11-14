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

# `$VL_SEED_BASE` (a URL prefix, `file://` included) replaces the release download, for
# a mirror and for tests/vl_fetch_seed_test.ts. The checksum rules below apply to it too.
fetch() {
  if [ -n "${VL_SEED_BASE:-}" ]; then
    curl -fsSL "$VL_SEED_BASE/$1" -o "$WORK/$1"
    return
  fi
  # Prefer gh (honors auth / private repos / rate limits), but FALL BACK to curl
  # when gh is absent OR fails — an unauthenticated gh on PATH errors out, and the
  # release asset is public, so the curl path still succeeds.
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

# Integrity fails closed: the seed is installed only when its SHA-256 equals the
# published `.sha256` sidecar's, and, for `seed-v0`, also the hash committed in
# scripts/seed-v0.sha256. A rolling release's sidecar sits beside the bytes it vouches
# for, so it catches a corrupt download, not a replaced release; the pinned hash does.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}
# The first field of a `sha256sum` line, lower-cased; empty unless it is 64 hex digits.
hash_field() {
  tr 'A-F' 'a-f' < "$1" | awk 'NR == 1 && $1 ~ /^[0-9a-f]{64}$/ { print $1 }'
}
GOT="$(sha256_of "$WORK/$ASSET")"
if ! fetch "$ASSET.sha256"; then
  echo "ERROR: release '$TAG' publishes no $ASSET.sha256; refusing to install an unverified seed." >&2
  exit 1
fi
WANT="$(hash_field "$WORK/$ASSET.sha256")"
if [ -z "$WANT" ]; then
  echo "ERROR: $ASSET.sha256 from '$TAG' holds no SHA-256; refusing to install." >&2
  exit 1
fi
if [ "$GOT" != "$WANT" ]; then
  echo "ERROR: checksum mismatch on $ASSET from '$TAG' (got $GOT, published $WANT); refusing to install." >&2
  exit 1
fi
if [ "$TAG" = "seed-v0" ]; then
  PINNED="$(hash_field scripts/seed-v0.sha256)"
  if [ -z "$PINNED" ] || [ "$GOT" != "$PINNED" ]; then
    echo "ERROR: seed-v0's $ASSET is $GOT, but scripts/seed-v0.sha256 pins ${PINNED:-nothing}; refusing to install." >&2
    exit 1
  fi
fi

mv "$WORK/$ASSET" "$OUT"
echo "fetched $OUT ($(wc -c < "$OUT") bytes, sha256 $GOT) from $REPO '$TAG'"
