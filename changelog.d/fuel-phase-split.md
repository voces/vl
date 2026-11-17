## Infrastructure (Track F)

- `scripts/self-compile-time.sh` prints the L2 self-compile's fuel per pipeline phase on every run (`--phases` outside the gate's pair): the profile's samples weigh the fuel each burned (`VL_PROFILE_GUEST_FUEL=1`), and `scripts/perf/profile-phases.vl` names today's phases (check, elaboration, emit passes, code payload, the rest of `emitModule`). Printed, not graded.
