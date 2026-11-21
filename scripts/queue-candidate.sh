#!/usr/bin/env bash
# Builds a merge-queue candidate: merges each PR branch onto <base> in order, one merge commit
# each, and prints the candidate sha and every hunk it resolved.
#
#     scripts/queue-candidate.sh <base> <pr-branch>...
#
# A conflict is resolved only when it is purely additive: the base side of the hunk is empty and
# both sides add nothing but list members (one per line: a string or name element, a `| X` union
# member, an `X |` or-pattern, a one-line `{ … },` row). The union keeps the hunk's sorted order
# when the lines around it are sorted, else ours then theirs, and drops a line both sides added.
# Anything else is refused, naming the file and hunk, and nothing is left behind. An arm tail or
# any other shared closing line is never a member, so two arms ending alike are refused, not joined.
# Run from inside the checkout; the merges happen in a temporary worktree.
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: scripts/queue-candidate.sh <base> <pr-branch>..." >&2; exit 2; }
BASE=$1; shift
git rev-parse --verify -q "$BASE^{commit}" > /dev/null || { echo "queue-candidate: no commit $BASE" >&2; exit 2; }
for b in "$@"; do
  git rev-parse --verify -q "$b^{commit}" > /dev/null || { echo "queue-candidate: no commit $b" >&2; exit 2; }
done

WT=$(mktemp -d)
LOG=$(mktemp)
cleanup() { git worktree remove --force "$WT" > /dev/null 2>&1 || rm -rf "${WT:?}"; rm -f "${LOG:?}" "${LOG:?}.r"; }
trap cleanup EXIT
git worktree add -q --detach "$WT" "$BASE"

# Resolves the diff3 conflict hunks of file $1 in place, or fails naming the first refused hunk.
resolve() {
  awk -v file="$1" '
    function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
    function member(s) {
      s = trim(s)
      return s ~ /^"[^"]*",?$/ || s ~ /^[A-Za-z_$][A-Za-z0-9_$]*,?$/ || s ~ /^\| [A-Za-z_][A-Za-z0-9_]*$/ \
        || s ~ /^[A-Za-z_][A-Za-z0-9_]* \|$/ || s ~ /^\{.*\},$/
    }
    function key(s) { s = trim(s); sub(/^\| /, "", s); sub(/ \|$/, "", s); sub(/,$/, "", s); return s }
    function refuse(why) { printf "REFUSED %s:%d: %s\n", file, start, why > "/dev/stderr"; bad = 1 }
    { line[NR] = $0 }
    END {
      n = 0; i = 1
      while (i <= NR) {
        if (line[i] !~ /^<<<<<<< /) { out[++n] = line[i]; i++; continue }
        start = i; no = nb = nt = 0; i++
        while (i <= NR && line[i] !~ /^\|\|\|\|\|\|\| / && line[i] !~ /^=======$/) o[++no] = line[i++]
        if (line[i] ~ /^\|\|\|\|\|\|\| /) { i++; while (i <= NR && line[i] !~ /^=======$/) b[++nb] = line[i++] }
        i++
        while (i <= NR && line[i] !~ /^>>>>>>> /) t[++nt] = line[i++]
        i++
        if (nb > 0) { refuse("the hunk changes a base line, not only adds"); break }
        ok = 1
        for (k = 1; k <= no; k++) if (!member(o[k])) ok = 0
        for (k = 1; k <= nt; k++) if (!member(t[k])) ok = 0
        if (!ok) { refuse("a side adds a line that is not a list member"); break }
        # The union, a line both sides added kept once.
        nu = 0; delete seen
        for (k = 1; k <= no; k++) if (!(o[k] in seen)) { seen[o[k]] = 1; u[++nu] = o[k] }
        for (k = 1; k <= nt; k++) if (!(t[k] in seen)) { seen[t[k]] = 1; u[++nu] = t[k] }
        # Sorted when the lines around the hunk and each side are: then the union is sorted too.
        sorted = 1
        prev = (n > 0 && member(out[n])) ? key(out[n]) : ""
        next_ = (i <= NR && member(line[i])) ? key(line[i]) : ""
        for (k = 2; k <= no; k++) if (key(o[k - 1]) > key(o[k])) sorted = 0
        for (k = 2; k <= nt; k++) if (key(t[k - 1]) > key(t[k])) sorted = 0
        if (prev == "" || next_ == "" || prev > next_) sorted = 0
        if (sorted) {
          for (a = 1; a <= nu; a++) w[a] = u[a]
          for (a = 2; a <= nu; a++) { v = w[a]; c = a - 1; while (c >= 1 && key(w[c]) > key(v)) { w[c + 1] = w[c]; c-- } w[c + 1] = v }
          if (key(w[1]) < prev || key(w[nu]) > next_) sorted = 0
          else for (a = 1; a <= nu; a++) u[a] = w[a]
        }
        printf "resolved %s:%d: %d + %d lines (%s)\n", file, start, no, nt, sorted ? "sorted" : "ours, then theirs" > "/dev/stderr"
        for (k = 1; k <= nu; k++) out[++n] = u[k]
        delete o; delete t; delete b; delete u; delete w
      }
      if (bad) exit 1
      for (k = 1; k <= n; k++) print out[k]
    }
  ' "$WT/$1" > "$WT/$1.resolved" || return 1
  mv "$WT/$1.resolved" "$WT/$1"
}

for b in "$@"; do
  short=$(git rev-parse --short "$b")
  if git -C "$WT" -c merge.conflictStyle=diff3 merge --no-ff --no-edit -q -m "candidate + $b ($short)" "$b" > "$LOG" 2>&1; then
    echo "merged $b ($short): clean"
    continue
  fi
  files=$(git -C "$WT" diff --name-only --diff-filter=U)
  [ -n "$files" ] || { echo "queue-candidate: merging $b failed with no conflicted file:" >&2; cat "$LOG" >&2; exit 1; }
  for f in $files; do
    if ! resolve "$f" 2> "$LOG.r"; then
      cat "$LOG.r" >&2; rm -f "$LOG.r"
      echo "queue-candidate: $b does not merge onto the candidate additively; nothing was written" >&2
      exit 1
    fi
    cat "$LOG.r"; rm -f "$LOG.r"
    git -C "$WT" add -- "$f"
  done
  git -C "$WT" commit -q --no-edit
  echo "merged $b ($short): resolved additively"
done
echo "candidate $(git -C "$WT" rev-parse HEAD)"
