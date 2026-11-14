#!/usr/bin/env bash
# Carry a pull request's PROVEN seed to a later CI run with the same seed key, across the
# cache scope GitHub draws between a pull request and master.
#
#   scripts/ci-proven-seed.sh pack           (pull request, after the fixpoint ladder)
#   scripts/ci-proven-seed.sh fetch <name>   (any other run, after an exact seed-key miss)
#
# `pack` writes build/proven-seed.tar.zst: the seed, its `.src`, its `.cwasm` sidecars from the
# seed cache (`vl seed --cache-files`) and a sha256 manifest of them. ci.yml uploads it as
# artifact <name>. `fetch` takes the newest artifact <name> whose run passes every provenance
# check below, verifies the manifest, and installs the seed as build/vl-compiler.wasm* and its
# sidecars into the seed cache, for `refresh-compiler.sh --prove-fixpoint` to start from. A
# miss or a failed check leaves build/ untouched and exits 0: it costs the ladder.
#
# Provenance, all required: the artifact's run is a same-repository `pull_request` run of
# .github/workflows/ci.yml whose `seed` job concluded `success`. A fork's run is refused,
# because a self-reproducing compiler would pass the fixpoint; the caller still re-observes
# the fixpoint on every reuse, so a reused seed is a better start, never a skipped proof.
set -euo pipefail
cd "$(dirname "$0")/.."

MANIFEST=proven-seed.sha256
BUNDLE=proven-seed.tar.zst
VL="${VL:-scripts/vl-host/target/release/vl}"
# A sidecar's name in the seed cache: `seed-<seed key>-<engine tag>.cwasm`.
SIDECAR_RE='seed-[0-9a-f]+-[0-9a-f]+\.cwasm'

pack() {
  [ -f build/vl-compiler.wasm ] || { echo "pack: no build/vl-compiler.wasm" >&2; exit 1; }
  local stage side
  stage=$(mktemp -d)
  trap 'rm -rf "$stage"' EXIT
  cp build/vl-compiler.wasm "$stage/"
  [ -f build/vl-compiler.wasm.src ] && cp build/vl-compiler.wasm.src "$stage/"
  while IFS= read -r side; do
    [ -f "$side" ] && cp "$side" "$stage/"
  done < <("$VL" seed --cache-files --compiler build/vl-compiler.wasm)
  (cd "$stage" && sha256sum * > "$MANIFEST" && cat "$MANIFEST" \
    && tar -I 'zstd -T0 -3' -cf "$BUNDLE" "$MANIFEST" $(ls | grep -vx "$MANIFEST"))
  mv "$stage/$BUNDLE" build/
  echo "packed build/$BUNDLE ($(wc -c < "build/$BUNDLE") bytes)"
}

# Why the run may not hand over its artifact; empty when it may.
refusal() { # <run id>
  local run=$1 info path event repo head seed
  info=$(gh api "repos/$REPO/actions/runs/$run" \
    --jq '"\(.path) \(.event) \(.repository.id) \(.head_repository.id)"') || { echo "run unreadable"; return; }
  read -r path event repo head <<< "$info"
  [ "$path" = .github/workflows/ci.yml ] || { echo "workflow is $path"; return; }
  [ "$event" = pull_request ] || { echo "event is $event"; return; }
  [ "$repo" = "$head" ] || { echo "head repository $head is not this repository $repo"; return; }
  seed=$(gh api "repos/$REPO/actions/runs/$run/jobs?filter=latest&per_page=100" \
    --jq '[.jobs[] | select(.name == "seed") | .conclusion] | join(",")') || { echo "jobs unreadable"; return; }
  [ "$seed" = success ] || echo "seed job concluded '${seed:-<none>}'"
}

# Unpack <bundle> into <dir> and check it against its manifest; prints the names to install.
verify() { # <bundle> <dir>
  local bundle=$1 dir=$2 listed present
  tar -I zstd -xf "$bundle" -C "$dir" || { echo "unpack failed" >&2; return 1; }
  (cd "$dir" && sha256sum --strict --quiet -c "$MANIFEST") || { echo "checksum mismatch" >&2; return 1; }
  listed=$(cut -c67- "$dir/$MANIFEST" | sort)
  present=$(cd "$dir" && ls | { grep -vx "$MANIFEST" || true; } | sort)
  if [ "$listed" != "$present" ] || ! grep -qx vl-compiler.wasm <<< "$listed" \
      || grep -Eqvx "vl-compiler\.wasm(\.src)?|$SIDECAR_RE" <<< "$listed"; then
    echo "the bundle's files do not match its manifest" >&2; return 1
  fi
  echo "$listed"
}

fetch() { # <artifact name>
  local name=$1 runs run why names
  : "${REPO:=${GITHUB_REPOSITORY:?fetch needs GITHUB_REPOSITORY}}"
  # Newest first, unexpired only.
  runs=$(gh api "repos/$REPO/actions/artifacts?name=$name&per_page=20" \
    --jq '.artifacts[] | select(.expired | not) | .workflow_run.id') || runs=""
  if [ -z "$runs" ]; then
    echo "no artifact named $name; the ladder starts from the restored seed"
    return 0
  fi
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  for run in $runs; do
    why=$(refusal "$run")
    if [ -n "$why" ]; then echo "run $run refused: $why"; continue; fi
    rm -rf "$TMP/dl" "$TMP/x" && mkdir -p "$TMP/x"
    if ! gh run download "$run" -R "$REPO" -n "$name" -D "$TMP/dl"; then
      echo "run $run: download failed"; continue
    fi
    if ! names=$(verify "$TMP/dl/$BUNDLE" "$TMP/x" 2> "$TMP/err"); then
      echo "run $run: $(cat "$TMP/err")"; continue
    fi
    mkdir -p build
    rm -f build/vl-compiler.wasm build/vl-compiler.wasm.src build/vl-compiler.wasm.*.cwasm
    local cache
    cache=$("$VL" seed --cache-dir 2>/dev/null || true)
    for f in $names; do
      case "$f" in
        *.cwasm) if [ -n "$cache" ]; then mv "$TMP/x/$f" "$cache/$f"; fi ;;
        *) mv "$TMP/x/$f" "build/$f" ;;
      esac
    done
    echo "installed the seed run $run proved: $(wc -c < build/vl-compiler.wasm) bytes, $(grep -c '\.cwasm$' <<< "$names") sidecar(s) into ${cache:-no seed cache}"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "run=$run" >> "$GITHUB_OUTPUT"; fi
    return 0
  done
  echo "no artifact named $name passed provenance; the ladder starts from the restored seed"
}

case "${1:-}" in
  pack) pack ;;
  fetch) fetch "${2:?usage: ci-proven-seed.sh fetch <name>}" ;;
  *) echo "usage: ci-proven-seed.sh pack | fetch <name>" >&2; exit 2 ;;
esac
