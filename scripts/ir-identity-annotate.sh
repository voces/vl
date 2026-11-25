#!/usr/bin/env bash
# Turns the DIFF, BEHAVIOUR and TIMEOUT lines of an `ir-identity.sh` log into GitHub error annotations, the
# first 20 one each and the rest counted in one more, so a mass differ still names its programs
# in the run's summary while the log keeps every line.
#
#     scripts/ir-identity-annotate.sh <mode> <log>
set -uo pipefail
mode=${1:?usage: ir-identity-annotate.sh <mode> <log>}
log=${2:?usage: ir-identity-annotate.sh <mode> <log>}
n=$(grep -cE '^(DIFF|BEHAVIOUR|TIMEOUT) ' "$log" || true)
grep -E '^(DIFF|BEHAVIOUR|TIMEOUT) ' "$log" | head -20 | sed "s/^/::error title=ir-identity $mode::/"
[ "$n" -le 20 ] || echo "::error title=ir-identity $mode::$((n - 20)) more DIFF, BEHAVIOUR or TIMEOUT lines in the step's log"
grep -E '^(cases|witnesses|claimless|behaviour): ' "$log" | sed "s/^/::notice title=ir-identity $mode::/"
exit 0
