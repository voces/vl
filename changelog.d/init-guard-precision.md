## Codegen, memory & runtime (Track B)

- **Read-before-init guard, three false positives gone:** `initGuardScan` no longer treats a
  member name as a mention of a free function of that name, walks a module lambda's body when its
  binding is first mentioned rather than where it is created, and does not count an assignment's
  target as a read. 4 corpus programs that guarded a global needlessly no longer do (31 → 27); every
  trapping fixture still traps. `tests/vl_init_guard_precision_test.ts` pins three named cells and
  four controls.
