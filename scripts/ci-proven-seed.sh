#!/usr/bin/env bash
# Carry a pull request's PROVEN seed to a later CI run with the same seed key, across the
# cache scope GitHub draws between a pull request and master.
#
#   scripts/ci-proven-seed.sh pack           (pull request, after the fixpoint ladder)
#   scripts/ci-proven-seed.sh fetch <name>   (any other run, after an exact seed-key miss)
#
# `pack` writes build/proven-seed.tar.zst: the seed, its `.src`, its `.cwasm` sidecars and a
# sha256 manifest of them. ci.yml uploads it as artifact <name>. `fetch` takes the newest
# artifact <name> whose run passes every provenance check below, verifies the manifest, and
# installs it as build/vl-compiler.wasm* for `refresh-compiler.sh --prove-fixpoint` to start
# from. A miss or a failed check leaves build/ untouched and exits 0: it costs the ladder.
#
# Provenance, all required: the artifact's run is a same-repository `pull_request` run of
# .github/workflows/ci.yml whose `seed` job concluded `success`. A fork's run is refused,
# because a self-reproducing compiler would pass the fixpoint; the caller still re-observes
# the fixpoint on every reuse, so a reused seed is a better start, never a skipped proof.
set -euo pipefail
cd "$(dirname "$0")/.."

MANIFEST=proven-seed.sha256
BUNDLE=proven-seed.tar.zst

pack() {
  cd build
  shopt -s nullglob
  local files=(vl-compiler.wasm vl-compiler.wasm.src vl-compiler.wasm.*.cwasm)
  [ -f vl-compiler.wasm ] || { echo "pack: no build/vl-compiler.wasm" >&2; exit 1; }
  sha256sum "${files[@]}" > "$MANIFEST"
  cat "$MANIFEST"
  tar -I 'zstd -T0 -3' -cf "$BUNDLE" "$MANIFEST" "${files[@]}"
  rm -f "$MANIFEST"
  echo "packed build/$BUNDLE ($(wc -c < "$BUNDLE") bytes)"
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
      || grep -qvx 'vl-compiler\.wasm[A-Za-z0-9._-]*' <<< "$listed"; then
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
    for f in $names; do mv "$TMP/x/$f" "build/$f"; done
    echo "installed the seed run $run proved: $(wc -c < build/vl-compiler.wasm) bytes, $(grep -c '\.cwasm$' <<< "$names") sidecar(s)"
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
