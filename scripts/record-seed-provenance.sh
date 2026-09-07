#!/usr/bin/env bash
# Record what a seed was built FROM, or fail LOUD.
#
#   scripts/record-seed-provenance.sh <seed>
#
# `refresh-compiler.sh` used to run `seed_provenance.py` with `|| echo note:`, so an
# interpreter that could not start left the seed with NO recorded identity while the refresh
# still reported success — and a seed with no identity is graded against whatever tree is
# checked out, which is the pairing `seed_provenance.py` exists to refuse. Measured on this
# box: a Homebrew `python3` first on PATH, linked against a newer glibc, exits before it runs
# a line, so every refresh printed the note and every later grade was provenance-blind.
#
# So: try `$PYTHON` (or `python3`), then `$PYTHON_FALLBACK` (or `/usr/bin/python3`) — the
# distro interpreter a `#!/usr/bin/env python3` shebang does NOT reach when a broken build
# shadows it — and exit non-zero naming `PYTHON` when neither runs. `PYTHON_FALLBACK` is a
# seam, not a knob: it is what lets a test drive the refusal, since the branch that only
# fires when two interpreters are broken is otherwise never witnessed.
set -uo pipefail
cd "$(dirname "$0")/.."

SEED="${1:?usage: record-seed-provenance.sh <seed>}"
SIDE="$SEED.src"
PRIMARY="${PYTHON:-python3}"
FALLBACK="${PYTHON_FALLBACK:-/usr/bin/python3}"

# Cleared first: a failure below must leave NO sidecar, never the PREVIOUS seed's identity,
# which a grader would read as this seed's.
rm -f "$SIDE"

record() { "$1" scripts/seed_provenance.py --write --seed "$SEED" > /dev/null 2>&1; }

if record "$PRIMARY"; then exit 0; fi
if [ "$PRIMARY" != "$FALLBACK" ] && record "$FALLBACK"; then
  echo "  note: PYTHON=$PRIMARY could not run; recorded the seed's source identity with $FALLBACK" >&2
  exit 0
fi

echo "ERROR: could not record the seed's source identity ($SIDE)." >&2
echo "  Tried PYTHON=$PRIMARY and $FALLBACK; neither could run scripts/seed_provenance.py." >&2
echo "  A seed with no sidecar is graded against whatever tree is checked out — the pairing" >&2
echo "  failure that made three landed fixes read as MOVED on 2026-09-06. Not a soft note." >&2
echo "  Fix: re-run with PYTHON=/path/to/a/working/python3." >&2
exit 1
