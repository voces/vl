// PER-INSTANCE COMPILER STATE, GRADED — the class every other suite here is blind to.
//
// `tests/cases_wasm_test.ts` builds ONE `WebAssembly.Instance` for the whole file and calls
// `modReset()` / `srcReset()` between cases. Anything a program registers that those resets
// miss survives into the NEXT program, so a pair can fail in company while both members pass
// alone — and a CLI check, which gives every program a fresh instance, is vacuous for the
// whole class. D1380 is the worked instance; D986 and D1003 are the same shape.
//
// The instrument is two arms over the same programs: each on its OWN instance, then all of
// them through one SHARED instance in order. A pair where the arms DISAGREE is a leak.
import { assertSeed, seedExports } from "./support/sharedInstance.ts";

type E = Record<string, (...a: number[]) => number>;

const push = (f: (cp: number) => number, text: string) => {
  for (const ch of text) f(ch.codePointAt(0)!);
};

/** rc for one program on the given instance, after the resets a case driver performs. */
const drive = (e: E, src: string): number => {
  e.modReset();
  e.srcReset();
  push(e.srcPush, src);
  return e.compileSrc();
};

const alone = (src: string) => drive(seedExports(), src);

/** rc of each program driven through ONE instance, in order. */
const shared = (srcs: string[]) => {
  const e = seedExports();
  return srcs.map((s) => drive(e, s));
};

// D1380's minimal poisoner: a declared union AND a nullable module GLOBAL. Neither half does
// it — the types alone are clean, the global without the union is clean, and the same nullable
// as a function RETURN is clean. Kept inline rather than as a fixture so the four-way ablation
// stays next to the thing it explains.
const POISONER = `type Circle = { kind: "circle", r: f64 }
type Rect   = { kind: "rect", w: f64 }
type Shape  = Circle | Rect
const gn: Circle | null = null
`;

const VICTIM = Deno.readTextFileSync(
  new URL("./cases/unions/paren-narrowed-receiver-read.vl", import.meta.url),
);

Deno.test({
  name: "shared-instance: D1380's pair still leaks — pinned so the day it stops is visible",
  ignore: !assertSeed(),
  fn: () => {
    if (alone(POISONER) !== 0) throw new Error("the poisoner must compile clean alone");
    if (alone(VICTIM) !== 0) throw new Error("the victim must compile clean alone");
    const [p, v] = shared([POISONER, VICTIM]);
    if (p !== 0) throw new Error(`poisoner rc ${p} on the shared instance, want 0`);
    // WHEN D1380 CLOSES, CHANGE THIS TO `v !== 0`. Pinned as still-leaking rather than
    // deleted: a test asserting the bug is what makes the fix legible as a fix, and the
    // alternative — no test — is how this survived every gate until now.
    if (v === 0) {
      throw new Error(
        "D1380 appears FIXED: the victim now compiles after the poisoner. " +
          "Flip this assertion to `v !== 0` and close the row.",
      );
    }
  },
});

Deno.test({
  name: "shared-instance: the CONTROL pair agrees across arms, so a green above means something",
  ignore: !assertSeed(),
  fn: () => {
    // Without this, the leak test could pass on an instance that fails everything. The
    // reversed order is the control D1380's ablation already measured as clean.
    const [a, b] = shared([VICTIM, POISONER]);
    if (a !== 0 || b !== 0) {
      throw new Error(`reversed order must be clean, got victim rc ${a}, poisoner rc ${b}`);
    }
  },
});
