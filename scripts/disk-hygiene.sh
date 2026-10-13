#!/usr/bin/env bash
# What VL work leaves on disk, and the cleanup of it.
#
#   scripts/disk-hygiene.sh            # report: every place VL work grows, with sizes
#   scripts/disk-hygiene.sh --check    # one line; exit 1 when the total is over $VL_DISK_BUDGET_GB
#   scripts/disk-hygiene.sh --clean    # remove what is safe to remove (listed below)
#
# --clean removes: a worktree that is clean AND whose HEAD is on origin (merged or pushed),
# except the ones the tools depend on ($VL_KEEP_WORKTREES); temp trees older than a day; a
# cargo target over $VL_CARGO_TARGET_GB (cargo never collects old artifacts); old host
# backups beyond the newest three. It never touches a dirty or unpushed worktree.
set -u
cd "$(dirname "$0")/.."
ROOT=$PWD
: "${VL_DISK_BUDGET_GB:=25}" "${VL_CARGO_TARGET_GB:=3}"
: "${VL_KEEP_WORKTREES:=dist-build}"
TOOLS="$HOME/.claude/vl-tools"
MODE=${1:-report}

kb() { du -sk "$@" 2>/dev/null | awk '{s+=$1} END {print s+0}'; }
gb() { awk -v k="$1" 'BEGIN {printf "%.1f", k/1048576}'; }

worktrees() { git -C "$ROOT" worktree list --porcelain | sed -n 's/^worktree //p' | grep -vx "$ROOT"; }
tmp_trees() {
  find "${TMPDIR:-/tmp}" -maxdepth 1 -user "$(id -u)" \
    \( -name 'vl-gate.*' -o -name 'cb-audit*' -o -name 'tmp.*' -o -name 'vl-*' \) "$@" 2>/dev/null
}
targets() { echo "$ROOT/scripts/vl-host/target"; [ -d "$TOOLS/cargo-target" ] && echo "$TOOLS/cargo-target"; }

# Removable: clean, and HEAD is reachable from some origin branch.
removable() {
  local w=$1 name; name=$(basename "$w")
  case " $VL_KEEP_WORKTREES " in *" $name "*) return 1 ;; esac
  [ -z "$(git -C "$w" status --porcelain 2>/dev/null)" ] || return 1
  [ -n "$(git -C "$w" branch -r --contains HEAD 2>/dev/null)" ]
}

report() {
  local total=0 k w
  printf '%-58s %8s  %s\n' PLACE GB NOTE
  while read -r w; do
    [ -d "$w" ] || continue
    k=$(kb "$w"); total=$((total + k))
    if removable "$w"; then note="removable (clean, on origin)"; else note="KEEP (dirty, unpushed or protected)"; fi
    printf '%-58s %8s  %s\n' "${w/#$HOME/~}" "$(gb "$k")" "$note"
  done < <(worktrees)
  while read -r t; do
    k=$(kb "$t"); total=$((total + k))
    printf '%-58s %8s  %s\n' "${t/#$HOME/~}" "$(gb "$k")" "cargo target (cleaned above ${VL_CARGO_TARGET_GB} GB)"
  done < <(targets)
  k=$(tmp_trees -print0 | xargs -0r du -sk 2>/dev/null | awk '{s+=$1} END {print s+0}'); total=$((total + k))
  printf '%-58s %8s  %s\n' "${TMPDIR:-/tmp} (vl-gate.*, cb-audit*, tmp.*, vl-*)" "$(gb "$k")" "temp trees"
  k=$(kb /tmp/claude-"$(id -u)"); total=$((total + k))
  printf '%-58s %8s  %s\n' "/tmp/claude-$(id -u)" "$(gb "$k")" "agent scratchpads (clean only when no agent runs)"
  k=$(kb "$ROOT/build"); total=$((total + k))
  printf '%-58s %8s\n' "build/" "$(gb "$k")"
  echo; echo "VL total: $(gb "$total") GB (budget ${VL_DISK_BUDGET_GB} GB)"
  df -h / | awk 'NR==2 {print "filesystem /: " $3 " used of " $2 " (" $5 ")"}'
}

check() {
  local total
  total=$( { worktrees; targets; echo /tmp/claude-"$(id -u)"; tmp_trees; } | tr '\n' '\0' | xargs -0r du -sk 2>/dev/null | awk '{s+=$1} END {print s+0}')
  if [ "$total" -gt $((VL_DISK_BUDGET_GB * 1048576)) ]; then
    echo "VL disk: $(gb "$total") GB, over the ${VL_DISK_BUDGET_GB} GB budget — run scripts/disk-hygiene.sh for the breakdown, --clean to reclaim"
    return 1
  fi
  echo "VL disk: $(gb "$total") GB of ${VL_DISK_BUDGET_GB} GB budget"
}

clean() {
  local w t
  # A running gate or build reads the trees and the binary this removes.
  if pgrep -u "$(id -u)" -f 'gate\.sh|cb-audit|vl build|cargo build' >/dev/null; then
    echo "a gate or build is running; --clean waits for it (pgrep -af 'gate.sh|cb-audit|vl build|cargo build')" >&2
    return 1
  fi
  while read -r w; do
    [ -d "$w" ] || continue
    if removable "$w"; then echo "remove worktree ${w/#$HOME/~}"; git -C "$ROOT" worktree remove --force "$w"; fi
  done < <(worktrees)
  git -C "$ROOT" worktree prune
  tmp_trees -mmin +1440 -print0 | xargs -0r rm -rf
  while read -r t; do
    if [ "$(kb "$t")" -gt $((VL_CARGO_TARGET_GB * 1048576)) ]; then
      echo "cargo clean ${t/#$HOME/~}"
      # The shared target holds the live `vl`: rebuild it straight away.
      (cd "$ROOT/scripts/vl-host" && cargo clean --target-dir "$t" -q && \
        { [ "$t" != "$ROOT/scripts/vl-host/target" ] || cargo build --release -q; })
    fi
  done < <(targets)
  if [ -d "$TOOLS" ]; then
    ls -1d "$TOOLS"/shared-vl.prev-* 2>/dev/null | sort -V | head -n -3 | xargs -r rm -f
  fi
  report
}

case "$MODE" in
  report|--report) report ;;
  --check) check ;;
  --clean) clean ;;
  *) echo "usage: $0 [--check|--clean]" >&2; exit 2 ;;
esac
