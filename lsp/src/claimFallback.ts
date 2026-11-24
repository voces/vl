// The TS hosts' half of the claims-off fallback (coordinator ruling 2026-11-24; the native host's
// half is `claims_off_rebuild` in scripts/vl-host). A unit the IR claims never runs legacy's
// lowering, so a refusal legacy raises there never fires and the claimed module can fail
// validation. A host then compiles again with every claim off: legacy's answer stands. This
// leaves at I8, with legacy (ir-design-2026-11.md, after the step table).

/** The seed exports the fallback reads; a seed without them never takes a claim it can report. */
export type ClaimExports = {
  irShadowRowCount?: () => number;
  irShadowRowLen?: (i: number) => number;
  irShadowRowAt?: (i: number, j: number) => number;
  irShadowArm?: (mode: number) => number;
};

const CLAIMED = "claimed";

/** Whether the compile that just ran took an IR claim: the guest counts a `claimed …` row per
 * claimed unit even unarmed. */
export const claimsTaken = (exp: ClaimExports): boolean => {
  const { irShadowRowCount: count, irShadowRowLen: len, irShadowRowAt: at } = exp;
  if (count === undefined || len === undefined || at === undefined) return false;
  for (let i = 0; i < count(); i++) {
    if (len(i) < CLAIMED.length) continue;
    let hit = true;
    for (let j = 0; j < CLAIMED.length && hit; j++) hit = at(i, j) === CLAIMED.charCodeAt(j);
    if (hit) return true;
  }
  return false;
};

/** Whether `bytes`, a claimed compile's module, must be compiled again with claims off. */
export const needsClaimsOff = (exp: ClaimExports, bytes: Uint8Array): boolean =>
  claimsTaken(exp) && !WebAssembly.validate(bytes as Uint8Array<ArrayBuffer>);

/** Runs `compile` with every IR claim off (the shadow armed at mode 1, under which legacy writes
 * every function), and disarms after. */
export const withClaimsOff = <T>(exp: ClaimExports, compile: () => T): T => {
  exp.irShadowArm?.(1);
  try {
    return compile();
  } finally {
    exp.irShadowArm?.(0);
  }
};

/** The one line a fallback that shipped legacy's bytes reports, as the native host words it. */
export const FELL_BACK = "IR claim produced an invalid module; used the legacy emitter";
