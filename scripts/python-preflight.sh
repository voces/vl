#!/usr/bin/env bash
# Names the interpreter the python gate rows will use, and fails with a SENTENCE when it
# cannot run. A broken python3 exits rc=1 in milliseconds, which is exactly what an
# over-budget ratchet returns, so without this ten rows red at once and the cause is in
# none of them. `PYTHON` pins one; no path is hardcoded, because the tree resolves
# `#!/usr/bin/env python3` and CI, the main checkout and a container each answer
# differently. The version is REPORTED, never enforced.
#
#   scripts/python-preflight.sh [diag-file]
set -u
PY="${PYTHON:-python3}"
DIAG="${1:-}"

resolved=$(command -v "$PY" 2>/dev/null)
out=$("$PY" -c 'import json,sys; print(sys.executable); print(".".join(map(str, sys.version_info[:3])))' 2>&1)
rc=$?

if [ $rc -ne 0 ]; then
  msg="python preflight FAILED — every python gate row below will exit rc=1 in milliseconds for THIS reason and not because a ratchet is over its baseline.
  PYTHON=$PY resolved to: ${resolved:-<not found on PATH>}
  \`\$PYTHON -c 'import json,sys'\` exited rc=$rc and said:
$(printf '%s\n' "$out" | sed 's/^/    /')
  Fix: put a working python3 first on PATH, or re-run with PYTHON=/path/to/a/working/python3 (scripts/gate.sh passes it through to every row)."
  printf '%s\n' "$msg"
  [ -n "$DIAG" ] && printf '%s\n' "$msg" > "$DIAG"
  exit 1
fi

exe=$(printf '%s\n' "$out" | sed -n 1p)
ver=$(printf '%s\n' "$out" | sed -n 2p)
# The scripts use str.removeprefix, so 3.9 is the floor. Printed, not enforced: a version
# below it fails in the row that needs it, with that script's own message.
echo "python preflight ok — PYTHON=$PY -> $exe (${ver}; the scripts assume 3.9+)"
