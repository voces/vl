#!/usr/bin/env bash
# Build the native `vl` RELEASE binary — a single self-contained file with the
# compiler seed embedded (`cargo build --features embed-seed`; see scripts/vl-host).
# Replaces the retired deno-compile path (scripts/build-binary.ts): the brains are
# the same wasm seed either way, but the host is now the Rust binary, so the shipped
# `vl` carries no V8/node/binaryen runtime.
#
#   scripts/build-binary.sh                 # host target  → dist/vl[.exe]
#   scripts/build-binary.sh --target <T>    # one target   → dist/vl-<T>[.exe]
#   scripts/build-binary.sh --all           # every target → dist/vl-<T>[.exe]
#
# Targets (kept in lockstep with .github/workflows/release.yml + Formula/vl.rb):
#   x86_64-unknown-linux-gnu   aarch64-unknown-linux-gnu
#   x86_64-apple-darwin        aarch64-apple-darwin
#   x86_64-pc-windows-msvc
#
# The seed must exist at build/vl-compiler.wasm first (scripts/fetch-seed.sh or
# refresh-compiler.sh) — build.rs bakes it in. A cross target needs its rustup
# target installed (this script adds it) and, for aarch64-linux, a cross linker
# (`gcc-aarch64-linux-gnu`); the release workflow installs that on the runner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/scripts/vl-host/Cargo.toml"
SEED="$ROOT/build/vl-compiler.wasm"
OUT="$ROOT/dist"

TARGETS=(
  x86_64-unknown-linux-gnu
  aarch64-unknown-linux-gnu
  x86_64-apple-darwin
  aarch64-apple-darwin
  x86_64-pc-windows-msvc
)

if [ ! -f "$SEED" ]; then
  echo "error: compiler seed missing at $SEED" >&2
  echo "       run scripts/fetch-seed.sh (or refresh-compiler.sh) first." >&2
  exit 1
fi
mkdir -p "$OUT"

# Build one artifact. Empty target = the host triple (a plain `dist/vl`, the local
# default — fast, no cross toolchain). A named target cross-builds and emits
# `dist/vl-<target>`.
build_one() {
  local target="$1"
  local suffix="" name bin
  local -a triple=()

  if [ -n "$target" ]; then
    triple=(--target "$target")
    rustup target add "$target" >/dev/null 2>&1 || true
    # aarch64-linux from an x86 host needs a cross linker; wire it if present.
    if [ "$target" = "aarch64-unknown-linux-gnu" ] && command -v aarch64-linux-gnu-gcc >/dev/null; then
      export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
    fi
    case "$target" in *windows*) suffix=".exe" ;; esac
    name="vl-$target$suffix"
    bin="$ROOT/scripts/vl-host/target/$target/release/vl$suffix"
  else
    case "$(rustc -vV | sed -n 's/^host: //p')" in *windows*) suffix=".exe" ;; esac
    name="vl$suffix"
    bin="$ROOT/scripts/vl-host/target/release/vl$suffix"
  fi

  echo "building $name (${target:-host})" >&2
  cargo build --release --features embed-seed --manifest-path "$MANIFEST" "${triple[@]}"
  cp "$bin" "$OUT/$name"
  echo "wrote $OUT/$name" >&2
}

case "${1:-}" in
  --all)
    for t in "${TARGETS[@]}"; do build_one "$t"; done
    ;;
  --target)
    t="${2:-}"
    if [[ " ${TARGETS[*]} " != *" $t "* ]]; then
      echo "unknown --target '$t'; one of:" >&2
      printf '  %s\n' "${TARGETS[@]}" >&2
      exit 2
    fi
    build_one "$t"
    ;;
  "")
    build_one "" # host
    ;;
  *)
    echo "usage: scripts/build-binary.sh [--target <triple> | --all]" >&2
    exit 2
    ;;
esac
