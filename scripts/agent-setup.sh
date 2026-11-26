#!/bin/bash
# Worktree setup for parallel compiler agents (docs/agent-playbook.md).
# Symlinks the warm cargo target + node_modules from the main checkout,
# builds the seed compiler, then checks the host. Run from the WORKTREE root.
#   scripts/agent-setup.sh               set up, then check the host
#   scripts/agent-setup.sh --host-check  only check (and repair) the host
set -e
# The MAIN checkout, derived rather than hardcoded: in a worktree
# `--git-common-dir` is the main repo's `.git`, so its parent is that checkout;
# in the main checkout it is `.git` and the parent is `.`. A hardcoded default
# silently rots the moment the repo moves, and the failure is a dangling symlink
# rather than an error — every `vl` invocation in the worktree then misses.
MAIN="${MAIN_CHECKOUT:-}"
if [ -z "$MAIN" ]; then
  common="$(git rev-parse --git-common-dir)"
  case "$common" in /*) ;; *) common="$PWD/$common" ;; esac
  MAIN="$(cd "$(dirname "$common")" && pwd)"
fi
VL=scripts/vl-host/target/release/vl

# Whether the host serves this tree's guest protocol: the newest `$VL_IR_SHADOW` mode (6, the
# order check) must print `[ir]` rows, and an invalid module must be refused with no legacy rebuild.
# A host built before a mode landed maps it to off, and every gate row that asks for it reads "no
# `[ir]` rows"; one built before the fallback's removal still answers the claimed fault seam.
host_ok() {
  [ -x "$VL" ] && [ -f build/vl-compiler.wasm ] || return 1
  local d
  d="$(mktemp -d)"
  printf 'function f(x: i32): i32 { return x + 1 }\nprint(f(2))\n' > "$d/t.vl"
  VL_STD="$PWD/std" VL_IR_SHADOW=6 VL_COMPILER_WASM=build/vl-compiler.wasm \
    "$VL" build "$d/t.vl" -o "$d/t.wasm" 2>&1 | grep -q '^\[ir\]'
  local rc=$?
  if [ $rc -eq 0 ]; then
    local out
    out="$(VL_STD="$PWD/std" VL_NO_CACHE=1 VL_FAULT_INJECT_CLAIMED=corrupt-validate-bytes \
      VL_COMPILER_WASM=build/vl-compiler.wasm "$VL" run "$d/t.vl" 2>&1)"
    case "$out" in *"used the legacy emitter"*) rc=1 ;; esac
    VL_STD="$PWD/std" VL_NO_CACHE=1 VL_FAULT_INJECT=corrupt-validate-bytes \
      VL_COMPILER_WASM=build/vl-compiler.wasm "$VL" run "$d/t.vl" > /dev/null 2>&1
    [ $? -eq 70 ] || rc=1
  fi
  rm -rf "$d"
  return $rc
}

# A stale shared host is rebuilt for THIS worktree only: an isolated `--target-dir` under
# `$TMPDIR`, deleted on exit, copied over the worktree's own target in place of the symlink.
# The shared target is never built into (CLAUDE.md); the coordinator rebuilds it after a merge.
host_check() {
  # The probe compiles with the seed; with none there is no reading, and the host is not judged.
  if [ ! -f build/vl-compiler.wasm ]; then
    echo "agent-setup: no seed at build/vl-compiler.wasm, so the host cannot be checked;" >&2
    echo "  build one (bash scripts/refresh-compiler.sh, or scripts/agent-setup.sh without --host-check)" >&2
    return 1
  fi
  if host_ok; then
    echo "agent-setup: host ok (\`VL_IR_SHADOW=6\` prints \`[ir]\` rows, and an invalid module is refused)"
    return 0
  fi
  if [ ! -L scripts/vl-host/target ]; then
    echo "agent-setup: the host at $VL predates this tree's \`\$VL_IR_SHADOW\` modes, or still has the claims-off fallback." >&2
    echo "  This target is not a worktree's symlink, so it is not rebuilt here: force-rebuild it" >&2
    echo "  (rm $VL && touch scripts/vl-host/src/main.rs && cargo build --release)." >&2
    return 1
  fi
  echo "agent-setup: the shared host predates this tree's \`\$VL_IR_SHADOW\` modes, or still has the claims-off fallback; building an isolated one"
  HOST_TGT="$(mktemp -d "${TMPDIR:-/tmp}/vl-host-target.XXXXXX")"
  trap 'rm -rf "$HOST_TGT"' EXIT
  (cd scripts/vl-host && cargo build --release -j "${JOBS:-6}" --target-dir "$HOST_TGT")
  rm scripts/vl-host/target
  mkdir -p scripts/vl-host/target/release
  cp "$HOST_TGT/release/vl" "$VL"
  rm -rf "$HOST_TGT"
  trap - EXIT
  host_ok || { echo "agent-setup: the rebuilt host still fails the \`[ir]\` rows or the invalid-module probe" >&2; return 1; }
  echo "agent-setup: host rebuilt into this worktree's own target (remove the worktree to drop it)"
}

# The disassembler `ir-identity.sh` reads a listed divergence with: without it each reads as a differ.
disasm_check() {
  [ -x node_modules/.bin/wasm-dis ] && return 0
  echo "agent-setup: node_modules/.bin/wasm-dis is not executable here, so ir-identity cannot read" >&2
  echo "  a listed divergence; link it: ln -s \"$MAIN/node_modules\" node_modules" >&2
  return 1
}

if [ "${1:-}" = "--host-check" ]; then
  disasm_check || exit 1
  host_check
  exit $?
fi

[ -d "$MAIN/node_modules" ] || { echo "agent-setup: no node_modules at $MAIN (run npm ci there)" >&2; exit 1; }
[ -e node_modules ] || ln -s "$MAIN/node_modules" node_modules
[ -e scripts/vl-host/target ] || ln -s "$MAIN/scripts/vl-host/target" scripts/vl-host/target
disasm_check
bash scripts/refresh-compiler.sh --allow-refetch
host_check
echo "agent-setup: ready (vl: $VL, seed: build/vl-compiler.wasm)"
