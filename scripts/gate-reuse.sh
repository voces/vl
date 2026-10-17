# Seed-neutral result reuse for scripts/gate.sh (sourced, never run).
#
# A row that declares READS is keyed on the contents of everything its result can depend on:
# the seed, the host binary, std/, gate.sh and this file, the keyed env, its argv and every
# file under its declared paths. A green result stored under that key is reused instead of
# re-running the row.
#
# The declaration is backed by a PROOF: one run under `strace -f` showing the row touched no
# repo path its READS does not cover (an uncovered read is RED, rc 96). The proof is keyed on
# what decides which paths a row opens -- its argv, its code entries, the READS text, gate.sh,
# this file, std, the host and the seed's file-request modules -- and not on the seed or the
# `data:` entries, so a compiler change misses the result but keeps the proof and re-runs the
# row untraced. Soundness of that split: docs/internals/gate-reuse.md.
#
# GATE_REUSE=0 turns it off. GATE_REUSE_VERIFY=1 traces every run, hits included, and fails a
# row whose stored result is green and whose fresh run is red. GATE_REUSE_DIR moves the store
# (default ~/.cache/vl-gate); GATE_REUSE_PROOF_DAYS (default 7) is a proof's lifetime.
# Without strace (macOS, a runner without it) nothing is stored or reused.

# The paths every keyed row depends on, besides its own READS.
REUSE_IMPLICIT="std scripts/gate.sh scripts/gate-reuse.sh scripts/compat build/vl-compiler.wasm build/vl-compiler.wasm.src"
# What every proof is keyed on besides a row's code entries. compiler/cli.vl and
# compiler/driver.vl are where the seed computes every path it asks the host to open.
REUSE_PROOF_IMPLICIT="std scripts/gate.sh scripts/gate-reuse.sh scripts/compat compiler/cli.vl compiler/driver.vl"
REUSE_TRACE="open,openat,openat2,newfstatat,statx,faccessat,faccessat2,access,stat,lstat,readlink,readlinkat,execve,mkdir,mkdirat,chdir,fchdir,clone,clone3,fork,vfork"

reuse_init() {
  REUSE_ON=0
  REUSE_DIR="${GATE_REUSE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/vl-gate}"
  REUSE_ROOT="$(pwd -P)"; REUSE_ROOTL="$PWD"
  if [ "${GATE_REUSE:-1}" = 0 ]; then REUSE_WHY="off (GATE_REUSE=0)"
  elif [ "$(uname -s)" != Linux ]; then REUSE_WHY="off: the read check needs strace, and this is $(uname -s)"
  elif ! command -v strace >/dev/null; then REUSE_WHY="off: strace is not installed, so no read check"
  elif ! strace -f --seccomp-bpf -qq -e trace=openat -o /dev/null true 2>/dev/null; then
    REUSE_WHY="off: strace cannot trace here (ptrace denied?)"
  elif ! mkdir -p "$REUSE_DIR/proof" 2>/dev/null; then REUSE_WHY="off: cannot create $REUSE_DIR"
  else REUSE_ON=1; REUSE_WHY="on ($REUSE_DIR)"; fi
  REUSE_MEMO="$LOGS/reuse-memo"; mkdir -p "$REUSE_MEMO"
}

# A READS entry's path: `data:` and `run:` mark what the proof key leaves out, `@` a listing.
reuse_path() { local p="${1#data:}"; printf '%s' "${p#run:}"; }

# Every file under one declared entry, as `f <path> <sha256>`, or `missing <path>`.
# `$2` = fresh bypasses the per-run memo (the after-run re-key must see the tree as it is).
reuse_entry() {
  local e="$1" m="$REUSE_MEMO/$(printf '%s' "$1" | sha256sum | cut -c1-16)"
  if [ "${2:-}" != fresh ] && [ -f "$m" ]; then cat "$m"; return; fi
  # A directory symlinked inside a declared one (the shared cargo target, node_modules) is not
  # walked: a read under it is covered only by a declaration at or under the link itself.
  local L=; [ "$(readlink -f "${e#@}")" = "$REUSE_ROOT/${e#@}" ] || L=-L
  # `@dir` declares only the directory's own entry names (a row that lists it, then reads
  # declared children), so a file added beside them misses but an edit inside one does not.
  { if [ "${e#@}" != "$e" ]; then echo "ls ${e#@} $(ls -A1p "${e#@}" 2>/dev/null | LC_ALL=C sort | sha256sum | cut -c1-64)"
    elif [ -d "$e" ]; then
      find $L "$e" \( -type f -o -type l -xtype f \) 2>/dev/null | LC_ALL=C sort | xargs -r -d '\n' sha256sum | awk '{h=$1; $1=""; print "f" $0 " " h}'
    elif [ -f "$e" ]; then echo "f $e $(sha256sum < "$e" | cut -c1-64)"
    else echo "missing $e"; fi; } > "$m.$BASHPID"
  mv -f "$m.$BASHPID" "$m"; cat "$m"
}

# The lines both manifests share: row, argv, a function row's body, platform, host, env.
reuse_common() {
  local name="$1" a; shift
  echo "row $name"
  printf 'argv'; for a in "$@"; do a="${a//$REUSE_ROOTL/<root>}"; printf ' %s' "${a//$REUSE_ROOT/<root>}"; done; echo
  # A row given as a shell function is keyed on the function's body too.
  declare -F "$1" >/dev/null 2>&1 && declare -f "$1" | sed "s#$REUSE_ROOT#<root>#g"
  echo "platform $(uname -sm)"
  echo "host $(sha256sum < "$VL" | cut -c1-64)"
  env | LC_ALL=C sort | grep -E '^(VL_|SELFHOST_|LC_ALL=|LANG=|TZ=)' | sed "s#$REUSE_ROOTL#<root>#g; s#$REUSE_ROOT#<root>#g"
}

# The manifest a result key hashes: `reuse_manifest <fresh|memo> <row> <reads> <argv...>`.
reuse_manifest() {
  local mode="$1" name="$2" reads="$3" e; shift 3
  echo "gate-reuse v2"
  reuse_common "$name" "$@"
  echo "seed $(sha256sum < "$SEED" | cut -c1-64)"
  for e in $REUSE_IMPLICIT $reads; do
    case "$e" in '!'*) continue ;; esac
    reuse_entry "$(reuse_path "$e")" "$([ "$mode" = fresh ] && echo fresh)"
  done | reuse_drop_excluded "$reads"
}

# The manifest a proof key hashes, `reuse_proof_manifest <fresh|memo> <row> <reads> <argv...>`:
# the result key without the seed and the `data:`/`run:` entries, plus the READS text, the
# seed's file-request modules and the two scans below.
reuse_proof_manifest() {
  local mode="$1" name="$2" reads="$3" e; shift 3
  echo "gate-reuse proof v1"
  reuse_common "$name" "$@"
  echo "reads $reads"
  for e in $REUSE_PROOF_IMPLICIT $reads; do
    case "$e" in '!'*|data:*|run:*) continue ;; esac
    reuse_entry "$e" "$([ "$mode" = fresh ] && echo fresh)"
  done | reuse_drop_excluded "$reads"
  reuse_scan "$reads"
}

reuse_proof_key() { echo "p$(reuse_proof_manifest "$@" | sha256sum | cut -c1-23)"; }

# The two invariants that stand in for the data entries' content in a proof key.
# `escape <file> <string>`: a quoted string with a `..` segment that, resolved against its own file's
# directory, lands outside every declared path. `capable <file> <sha256>`: a file under a `run:`
# entry (data the row executes) that can open files or start processes.
reuse_scan() {
  local reads="$1" decl="" e p data=() runs=()
  for e in $REUSE_IMPLICIT $reads; do
    case "$e" in '!'*|'@'*) ;; *) decl="$decl $(reuse_path "$e")" ;; esac
  done
  for e in $reads; do
    case "$e" in data:*) data+=("${e#data:}") ;; run:*) data+=("${e#run:}"); runs+=("${e#run:}") ;; esac
  done
  [ ${#data[@]} -gt 0 ] || return 0
  grep -rIHoE '"[^"]*\.\.[^"]*"' -- "${data[@]}" 2>/dev/null | awk -v decl="$decl" '
    function norm(p,   n, a, i, o, k, s) {
      n = split(p, a, "/"); k = 0
      for (i = 1; i <= n; i++) {
        if (a[i] == "" || a[i] == ".") continue
        if (a[i] == "..") { if (k > 0) k--; else o[++k] = ".."; continue }
        o[++k] = a[i]
      }
      s = ""; for (i = 1; i <= k; i++) s = s (i > 1 ? "/" : "") o[i]
      return s
    }
    BEGIN { nd = split(decl, D, " ") }
    {
      c = index($0, ":"); f = substr($0, 1, c - 1); s = substr($0, c + 2); s = substr(s, 1, length(s) - 1)
      d = f; sub(/\/[^\/]*$/, "", d); if (d == f) d = "."
      r = norm(d "/" s); ok = 0
      for (i = 1; i <= nd; i++) if (r == D[i] || index(r, D[i] "/") == 1) ok = 1
      if (!ok) print "escape " f " " s
    }' | LC_ALL=C sort -u
  [ ${#runs[@]} -gt 0 ] || return 0
  grep -rlIE 'std:(fs|process)"|__(fs|proc)_[a-z0-9_]*__' -- "${runs[@]}" 2>/dev/null | LC_ALL=C sort |
    xargs -r -d '\n' sha256sum | awk '{ print "capable " $2 " " $1 }'
}

# Drop the `!path` exclusions (a row's own outputs under a declared directory) from a manifest.
reuse_drop_excluded() {
  local ex="" e
  for e in $1; do case "$e" in '!'*) ex="$ex ${e#!}" ;; esac; done
  [ -z "$ex" ] && { cat; return; }
  awk -v ex="$ex" 'BEGIN { n = split(ex, X, " ") }
    { p = $2; skip = 0; for (i = 1; i <= n; i++) if (p == X[i] || index(p, X[i] "/") == 1) skip = 1; if (!skip) print }'
}

reuse_key() { reuse_manifest "$@" | sha256sum | cut -c1-24; }

# 0 when every outside-the-repo path recorded in <file> is as it was.
reuse_outside_ok() {
  local kind sha p
  while read -r kind sha p; do
    case "$kind" in
      file) [ -f "$p" ] && [ "$(sha256sum < "$p" | cut -c1-64)" = "$sha" ] || return 1 ;;
      present) [ -e "$p" ] && [ ! -f "$p" ] || return 1 ;;
      absent) [ ! -e "$p" ] || return 1 ;;
    esac
  done < "$1"
  return 0
}

# 0 when <key> holds a green result whose outside-the-repo reads are all unchanged.
reuse_hit() {
  local d="$REUSE_DIR/$1"
  [ -f "$d/ok" ] && [ -f "$d/log" ] && [ -f "$d/outside" ] && reuse_outside_ok "$d/outside"
}

# 0 when <pkey> holds a proof younger than GATE_REUSE_PROOF_DAYS whose outside reads hold.
reuse_proof_ok() {
  local d="$REUSE_DIR/proof/$1" days="${GATE_REUSE_PROOF_DAYS:-7}"
  [ -f "$d/ok" ] && [ -f "$d/outside" ] || return 1
  [ -n "$(find "$d/ok" -mmin "-$((days * 1440))" 2>/dev/null)" ] || return 1
  reuse_outside_ok "$d/outside"
}

# The read check. Reads a strace log; prints `undeclared <kind> <path>` for each repo path the
# row touched outside its declaration, and `file <path>` / `absent <path>` for each path outside
# the repo the result depends on.
reuse_audit() {
  local tr="$1" reads="$2" decl="" ex="" links="" e l
  local lsd=""
  for e in $REUSE_IMPLICIT $reads; do
    case "$e" in '!'*) ex="$ex ${e#!}" ;; '@'*) lsd="$lsd ${e#@}" ;; *) decl="$decl $(reuse_path "$e")" ;; esac
  done
  # In-repo symlinks (the shared cargo target, node_modules) map their real path back.
  while IFS= read -r l; do
    links="$links $(readlink -f "$l")=${l#./}"
  done < <(find . -type l -xtype d -not -path './.git/*' 2>/dev/null)
  awk -v root="$REUSE_ROOT" -v rootl="$REUSE_ROOTL" -v decl="$decl" -v ex="$ex" -v lsd="$lsd" -v links="$links" \
      -v vl="$VL" -v path="$PATH" -v tmp="${TMPDIR:-/tmp}" -v store="$REUSE_DIR" -v home="$HOME" '
    function norm(p,   n, a, i, o, k, s) {
      n = split(p, a, "/"); k = 0
      for (i = 1; i <= n; i++) {
        if (a[i] == "" || a[i] == ".") continue
        if (a[i] == "..") { if (k > 0) k--; continue }
        o[++k] = a[i]
      }
      s = ""; for (i = 1; i <= k; i++) s = s "/" o[i]
      return s == "" ? "/" : s
    }
    function under(p, d) { return p == d || index(p, d "/") == 1 }
    # The repo-relative spelling of an absolute path, or "\001" when it is not in the repo.
    function rel(p,   i) {
      if (under(p, rootl)) return p == rootl ? "" : substr(p, length(rootl) + 2)
      if (under(p, root)) return p == root ? "" : substr(p, length(root) + 2)
      for (i = 1; i <= nl; i++) if (under(p, LR[i])) return LL[i] substr(p, length(LR[i]) + 1)
      return "\001"
    }
    # Under an in-repo directory symlink only a declaration at or below the link covers a path,
    # because a declared parent is hashed without walking the link.
    function covered(r,   i, j, ok) {
      for (i = 1; i <= nx; i++) if (under(r, X[i])) return 0
      for (i = 1; i <= nd; i++) {
        if (!under(r, D[i])) continue
        ok = 1
        for (j = 1; j <= nl; j++) if (under(r, LL[j]) && !under(D[i], LL[j])) ok = 0
        if (ok) return 1
      }
      return 0
    }
    function ancestor(r,   i) {
      if (r == "") return 1
      for (i = 1; i <= nd; i++) if (index(D[i], r "/") == 1) return 1
      return 0
    }
    function dirname(p) { sub(/\/[^\/]*$/, "", p); return p == "" ? "/" : p }
    function classify(p, kind,   r, q) {
      if (p == "") return
      if (kind == "write") { if (!(p in seen)) wrote[p] = 1; seen[p] = 1; return }
      if (kind == "mkdir") { if (!(p in seen)) made[++nm] = p; seen[p] = 1; return }
      seen[p] = 1
      if (p in wrote) return
      for (q = 1; q <= nm; q++) if (under(p, made[q])) return
      r = rel(p)
      if (r == "\001") { outside(p, kind); return }
      if (r == vlrel || index(r, "build/vl-compiler.wasm") == 1) return
      # The host lists the directory of the seed only to prune its stale .cwasm sidecars.
      if (r == "build" && kind == "list") return
      if (covered(r)) return
      for (q = 1; q <= nls; q++) {
        if (r == LS[q] && (kind == "list" || kind == "stat" || kind == "probe")) return
        if (dirname(r) == LS[q] && (kind == "stat" || kind == "probe")) return
      }
      if (ancestor(r) && kind != "list") return
      if (!((kind, r) in U)) { U[kind, r] = 1; print "undeclared " kind " " r }
    }
    function outside(p, kind,   z) {
      for (z = 1; z <= nz; z++) if (under(p, Z[z])) return
      if (kind == "read" || kind == "exec") { if (!(p in OF)) { OF[p] = 1; print "file " p } }
      else if (kind == "probe") { if (!(p in OA)) { OA[p] = 1; print "absent " p } }
    }
    BEGIN {
      root = norm(root); rootl = norm(rootl)
      nd = split(decl, D, " "); nx = split(ex, X, " "); nls = split(lsd, LS, " ")
      nl = 0; m = split(links, LK, " ")
      for (i = 1; i <= m; i++) { j = index(LK[i], "="); if (j) { nl++; LR[nl] = norm(substr(LK[i], 1, j - 1)); LL[nl] = substr(LK[i], j + 1) } }
      vlrel = rel(norm(vl))
      np = split(path, PA, ":")
      for (i = 1; i <= np; i++) if (PA[i] != "") { if (PA[i] ~ /^\//) PD[norm(PA[i])] = 1; else PR[PA[i]] = 1 }
      nz = split("/proc /sys /dev /tmp /run " norm(tmp) " " norm(store) " " home "/.cache/vl/modules", Z, " ")
    }
    {
      line = $0; pid = $1
      if (line ~ / <unfinished \.\.\.>$/) { sub(/ <unfinished \.\.\.>$/, "", line); pend[pid] = line; next }
      if (line ~ /^[0-9]+ <\.\.\. [a-z0-9_]+ resumed>/) {
        if (!(pid in pend)) next
        rest = line; sub(/^[0-9]+ <\.\.\. [a-z0-9_]+ resumed>/, "", rest)
        line = pend[pid] rest; delete pend[pid]
      }
      body = substr(line, length(pid) + 2)
      if (!match(body, /^[a-z0-9_]+\(/)) next
      sc = substr(body, 1, RLENGTH - 1); args = substr(body, RLENGTH + 1)
      # A child inherits its parent cwd unless it already reported its own.
      if (sc ~ /^(clone|clone3|fork|vfork)$/) {
        if (match(line, /= [0-9]+$/)) { c = substr(line, RSTART + 2); if (!(c in cwd) && (pid in cwd)) cwd[c] = cwd[pid] }
        next
      }
      if (sc == "fchdir") {
        if (line !~ /\) += 0$/) next
        if (match(args, /^[0-9]+<[^>]*>/)) { b = substr(args, 1, RLENGTH - 1); sub(/^[0-9]+</, "", b); cwd[pid] = norm(b) }
        next
      }
      base = ""
      if (match(args, /^[A-Z_0-9]+<[^>]*>, /)) {
        dfd = substr(args, 1, RLENGTH - 2); args = substr(args, RLENGTH + 1)
        b = dfd; sub(/^[A-Z_0-9]+</, "", b); sub(/>$/, "", b); base = b
        if (dfd ~ /^AT_FDCWD/) cwd[pid] = b
      } else if (sc ~ /at2?$/ || sc == "statx") next
      if (!match(args, /^"([^"\\]|\\.)*"/)) next
      p = substr(args, 2, RLENGTH - 2); after = substr(args, RLENGTH + 1)
      if (p == "") next
      raw = p
      if (substr(p, 1, 1) != "/") {
        if (base == "") base = (pid in cwd) ? cwd[pid] : rootl
        p = base "/" p
      }
      p = norm(p)
      fail = (line ~ /\) += -1 /)
      if (sc == "chdir") { if (!fail) cwd[pid] = p; next }
      if (sc == "execve") kind = fail ? "probe" : "exec"
      else if (sc == "mkdir" || sc == "mkdirat") { if (fail) next; kind = "mkdir" }
      else if (sc ~ /^open/) {
        if (fail) kind = "probe"
        else if (after ~ /O_WRONLY/ || (after ~ /O_CREAT/ && after !~ /O_RDWR/)) kind = "write"
        else if (after ~ /O_DIRECTORY/) kind = "list"
        else if (after ~ /O_PATH/) kind = "stat"
        else kind = "read"
      } else kind = fail ? "probe" : "stat"
      # A PATH lookup (a relative PATH entry such as a literal ~/.local/bin included) is an
      # outside dependency, recorded at the path it resolved to.
      if ((kind == "probe" || kind == "exec") && (dirname(p) in PD || (raw !~ /^\// && dirname(raw) in PR))) {
        outside(p, kind); next
      }
      classify(p, kind)
      # A path the program reached through a symlink is classified at its real path too.
      if (sc ~ /^open/ && !fail && match(line, /\) += [0-9]+<[^>]*>$/)) {
        rp = substr(line, RSTART, RLENGTH); sub(/^\) += [0-9]+</, "", rp); sub(/>$/, "", rp)
        if (rp != p && rp ~ /^\//) classify(norm(rp), kind)
      }
    }' "$tr"
}

# Stores a green result under <key>: `reuse_store <i> <key> <outside-file> <row> <reads> <argv...>`.
# The row is re-keyed from the tree as it is now, so an input edited while it ran is not stored.
reuse_store() {
  local i="$1" key="$2" out="$3" name="$4" reads="$5" k2 d t; shift 5
  k2=$(reuse_key fresh "$name" "$reads" "$@")
  if [ "$k2" != "$key" ]; then echo "gate-reuse: not stored — a declared input changed while the row ran"; return 1; fi
  # The staging dir is named once: `$BASHPID` inside a pipeline is another process.
  d="$REUSE_DIR/$key"; t="$REUSE_DIR/$key.tmp.$BASHPID"
  mkdir -p "$t" && cp "$out" "$t/outside" && cp "$LOGS/$i.log" "$t/log" &&
    reuse_manifest memo "$name" "$reads" "$@" > "$t/manifest" &&
    touch "$t/ok" && rm -rf "$d" && mv "$t" "$d" ||
    { echo "gate-reuse: not stored — $REUSE_DIR could not be written"; rm -rf "$t"; return 1; }
}

# Runs one keyed row under the read check, and on a clean green run stores both its result
# and the proof that its READS is complete. `reuse_run <i> <key> <pkey> <row> <reads> <argv...>`;
# prints the row's own output.
reuse_run() {
  local i="$1" key="$2" pkey="$3" name="$4" reads="$5" rc tr="$LOGS/$1.strace" au="$LOGS/$1.audit" n p t; shift 5
  if declare -F "$1" >/dev/null 2>&1; then
    env VL="$VL" SEED="$SEED" LOGS="$LOGS" strace -f --seccomp-bpf -y -qq -o "$tr" -e trace="$REUSE_TRACE" \
      bash -c "$(declare -f "$1")"'; "$@"' _ "$@"
  else
    strace -f --seccomp-bpf -y -qq -o "$tr" -e trace="$REUSE_TRACE" "$@"
  fi
  rc=$?
  # A red row is red whatever it read; only a green one is checked and stored.
  [ $rc = 0 ] || { rm -f "$tr"; return $rc; }
  reuse_audit "$tr" "$reads" > "$au"; rm -f "$tr"
  n=$(grep -c '^undeclared ' "$au")
  if [ "$n" -gt 0 ]; then
    echo "gate-reuse: READ CHECK FAILED — this row touched $n repo path(s) its READS does not declare."
    echo "  Add each to the row's READS in scripts/gate.sh (or drop READS to leave the row uncached):"
    grep '^undeclared ' "$au" | head -40 | sed 's/^undeclared /  /'
    return 96
  fi
  # Each outside path as it is now: a file with its sha256, a directory as `present`, and a
  # path that does not exist as `absent` (a failed probe can still name a file, e.g. a PATH
  # entry that is not executable). A file read that has since gone is stored so it never hits.
  grep -E '^(file|absent) ' "$au" | while read -r kind p; do
    if [ -f "$p" ]; then echo "file $(sha256sum < "$p" | cut -c1-64) $p"
    elif [ -e "$p" ]; then echo "present - $p"
    elif [ "$kind" = file ]; then echo "file gone $p"
    else echo "absent - $p"; fi
  done > "$LOGS/$i.outside"
  reuse_store "$i" "$key" "$LOGS/$i.outside" "$name" "$reads" "$@" || return 0
  # The proof is re-keyed too: a code entry edited mid-run must not be recorded as proven.
  [ "$(reuse_proof_key fresh "$name" "$reads" "$@")" = "$pkey" ] || return 0
  p="$REUSE_DIR/proof/$pkey"; t="$p.tmp.$BASHPID"
  mkdir -p "$t" && cp "$LOGS/$i.outside" "$t/outside" &&
    reuse_proof_manifest memo "$name" "$reads" "$@" > "$t/manifest" &&
    touch "$t/ok" && rm -rf "$p" && mv "$t" "$p" || rm -rf "$t"
  return 0
}

# Runs one keyed row untraced, its declaration already proven, and stores a green result with
# the proof's outside reads. `reuse_run_plain <i> <key> <pkey> <row> <reads> <argv...>`.
reuse_run_plain() {
  local i="$1" key="$2" pkey="$3" name="$4" reads="$5" rc; shift 5
  "$@"; rc=$?
  [ $rc = 0 ] || return $rc
  reuse_store "$i" "$key" "$REUSE_DIR/proof/$pkey/outside" "$name" "$reads" "$@"
  return 0
}

# One keyed row, start to finish: `reuse_row <i> <row> <reads> <argv...>`. Writes the row's
# output to `$LOGS/<i>.log` and how it was answered to `$LOGS/<i>.mode`; returns its rc.
reuse_row() {
  local i="$1" name="$2" reads="$3" key pkey rc hit=0 verify="${GATE_REUSE_VERIFY:-0}"; shift 3
  key=$(reuse_key memo "$name" "$reads" "$@")
  reuse_hit "$key" && hit=1
  if [ $hit = 1 ] && [ "$verify" != 1 ]; then
    { cat "$REUSE_DIR/$key/log"; echo "gate-reuse: reused $key"; } > "$LOGS/$i.log"
    echo "reused $key" > "$LOGS/$i.mode"; return 0
  fi
  pkey=$(reuse_proof_key memo "$name" "$reads" "$@")
  if [ "$verify" != 1 ] && reuse_proof_ok "$pkey"; then
    reuse_run_plain "$i" "$key" "$pkey" "$name" "$reads" "$@" > "$LOGS/$i.log" 2>&1; rc=$?
    echo "miss, proven $pkey" > "$LOGS/$i.mode"; return $rc
  fi
  reuse_run "$i" "$key" "$pkey" "$name" "$reads" "$@" > "$LOGS/$i.log" 2>&1; rc=$?
  echo "miss, traced" > "$LOGS/$i.mode"
  [ $rc != 0 ] && [ $hit = 1 ] &&
    echo "gate-reuse: VERIFY FAILED — key $key holds a green result for this row and the fresh run is red, so its declaration misses an input" >> "$LOGS/$i.log"
  return $rc
}
