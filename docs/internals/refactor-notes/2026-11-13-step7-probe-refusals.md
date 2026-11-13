# Step 7, lane H: the render-parse probe counts programs that end in a refusal, 2026-11-13

Lane I's render triage found `mapSoftTwinTagFail` listed at 0 programs, while
census 5's witnesses
(`generics/error-literal-union-map-twin-through-one-instance{,-plain-first}.vl`)
refuse through it.

## Cause

`emitFailAt` keeps the first failure only. `render-parse-origins.ts`'s probe
reports what it saw by an `emitFail("HPROBE…")` after `emitProgramRun` returns.
In a program that already refused, the report was dropped. So every site reached
only by refusing programs read as unreached, and every count left those programs
out.

## Change

The probe hook clears `emitFailed` before raising its report, so the report
replaces the refusal. The probe compiler is a scratch copy, so no seed carries
this.

## Effect (master `61b4a983`, 24,212 programs)

- `mapSoftTwinTagFail` (wasmEmit:6183): 0 → 2 programs, the two census-5
  witnesses. Control: red before, green after.
- 135 rows of the sites table gain programs, by 1 to 99 each. No other unreached
  site becomes reached, and no parse site changes grade. The origins file
  regenerated identical apart from rows of deleted sites, so it is left as
  committed, per the fold rule.

## What earlier probes missed

Lane H's earlier probes used the same hook, so they too left out refusing
programs:

- #7770's six floored sites;
- D16062's verdict classes.

The floors stand on other evidence. A refusing program that reached a floor
before its own refusal would have changed its message, and the sweep compares
refusal messages. It found 0 movers. The D16062 class counts are lower bounds.
