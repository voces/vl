// THE TWO KIND-LADDER IMPLEMENTATIONS MUST AGREE.
//
// `compiler/lint.vl` grades one module at a time from the source the driver hands
// it; `scripts/ladder-budget.py` (through `scripts/ladder-census.py`) grades the
// whole tree for the per-file ratchet. They carry the same arm definition, the same
// closed sets, the same two-arm floor and the same brace-walked default region, and
// nothing else ties them together — so a change to either that moves a count
// silently un-ratchets the tree. This runs BOTH over four fixtures and compares the
// hit LINES, not totals.
//
// The fixtures also PIN THE FALSE POSITIVES the rule has to design out: a ladder
// that delegates its default to a sibling, a membership test written as one `||`
// expression, a refusal default, a single-arm guard, and a pair of walkers that
// partition a set and hand back BOTH ways. Each is a shape the tree really has.
//
// `match` is deliberately out of scope for both: the checker already refuses a
// wildcard-less `match` that misses a member, so the language is the gate there.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, like the other native `vl_*` suites.
//
// @test-timing sweep n=30

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/ladder-budget.py`;
const INCOMPLETE = "kind-ladder-incomplete";
const SPLIT = "kind-ladder-split";
const CODES = [INCOMPLETE, SPLIT] as const;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-kind-ladder] skipped — missing vl binary or seed wasm.");
}

type Fixture = {
  name: string;
  src: string;
  /** 1-based lines of the ladder's FIRST arm, one per expected hit. */
  incomplete: number[];
  split: number[];
  /** A substring the ONE message of its code must contain. */
  says?: { code: string; text: string };
};

// Every fixture dispatches on a `string` against `VKind` members, so it needs no type
// declarations to compile while still naming a set the lint knows. Members are chosen
// so the SMALLEST set holding them all is `VKind` and not `RtKind` / `EqCmpKind`,
// which share `i32` / `map` / `struct` with it.
const FIXTURES: Fixture[] = [
  {
    // Nothing fires. Four shapes that must not: a delegating default, a membership
    // test written as ONE `||` expression, a refusal default, and a single-arm guard.
    name: "clean.vl",
    src: `function other(k: string): i32 { k.length }

function delegating(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  other(k)
}

function member(k: string) {
  k == "nulmap" || k == "nulvariant" || k == "strlist" || k == "reflist"
}

function emitFail(m: string): i32 { m.length }

function refusing(k: string): i32 {
  if k == "nulstrlist" { return 1 }
  if k == "nulf64list" { return 2 }
  emitFail("no lowering for " + k)
  -1
}

function guard(k: string): boolean {
  if k == "nuli64list" { return true }
  false
}
`,
    incomplete: [],
    split: [],
  },
  {
    // One silent ladder: three arms of the whole `VKind` set, and a bare `-1`.
    name: "holed.vl",
    src: `function holed(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  -1
}
`,
    incomplete: [2],
    split: [],
    says: { code: INCOMPLETE, text: "tests 3 of 31 VKind kinds and ends without naming the rest" },
  },
  {
    // D981's shape. `walkStmt`'s default hands the rest to `walkExpr`; `walkExpr`
    // hands none back, so the three kinds only `walkStmt` tests fall out of the walk
    // whenever a node of that kind arrives on the expression side.
    //
    // `walkExpr` is ALSO a silent ladder in its own right — the two codes are
    // independent, and the split one is what names the sibling.
    name: "split.vl",
    src: `function walkExpr(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return walkStmt("nulmap") }
  0
}

function walkStmt(k: string): i32 {
  if k == "nulmap" { return 4 }
  if k == "nulvariant" { return 5 }
  if k == "strlist" { return 6 }
  walkExpr(k)
}
`,
    incomplete: [2],
    split: [9],
    says: {
      code: SPLIT,
      text: "3 kinds only `walkStmt` tests fall through it — nulmap nulvariant strlist",
    },
  },
  {
    // THE CONTROL PAIR: two ladders that partition one set and delegate BOTH ways.
    // Every kind either half lacks the other handles, and neither default drops
    // anything — so the split rule must stay silent, and so must the incomplete one,
    // because each default names its sibling.
    name: "partition.vl",
    src: `function ctrlA(k: string): i32 {
  if k == "i64list" { return 1 }
  if k == "f32list" { return 2 }
  ctrlB(k)
}

function ctrlB(k: string): i32 {
  if k == "nulstrlist" { return 3 }
  if k == "nulf64list" { return 4 }
  ctrlA(k)
}
`,
    incomplete: [],
    split: [],
  },
];

type Hits = { lines: Record<string, number[]>; msgs: Record<string, string[]> };

const script = async (path: string): Promise<Hits> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [SCRIPT, "--grade", path],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (code !== 0) {
    throw new Error(
      `ladder-budget.py --grade ${path} exited ${code}: ${new TextDecoder().decode(stderr)}`,
    );
  }
  const raw = JSON.parse(new TextDecoder().decode(stdout)) as Record<string, unknown[][]>;
  const lines: Record<string, number[]> = {};
  for (const c of CODES) {
    lines[c] = raw[c].map((r) => r[0] as number).sort((x, y) => x - y);
  }
  return { lines, msgs: {} };
};

const lint = async (path: string, file: string): Promise<Hits> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--severity", "info", "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (code > 1) {
    throw new Error(`vl check ${path} exited ${code}: ${new TextDecoder().decode(stderr)}`);
  }
  const all = JSON.parse(new TextDecoder().decode(stdout)) as {
    file: string;
    code?: string;
    line: number;
    message: string;
  }[];
  const diags = all.filter((d) => d.file.endsWith(`/${file}`) || d.file === file);
  const lines: Record<string, number[]> = {};
  const msgs: Record<string, string[]> = {};
  for (const c of CODES) {
    const mine = diags.filter((d) => d.code === c);
    lines[c] = mine.map((d) => d.line).sort((x, y) => x - y);
    msgs[c] = mine.map((d) => d.message);
  }
  return { lines, msgs };
};

const eq = (a: number[], b: number[]) => JSON.stringify(a) === JSON.stringify(b);

Deno.test({
  name: "kind-ladder: the lint and the ratchet script agree, both codes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_kind_ladder_" });

    for (const f of FIXTURES) {
      const path = `${dir}/${f.name}`;
      await Deno.writeTextFile(path, f.src);
      const s = await script(path);
      const l = await lint(path, f.name);

      for (const c of CODES) {
        if (!eq(s.lines[c], l.lines[c])) {
          throw new Error(
            `${f.name}: ${c} disagrees — ladder-budget.py wants lines ` +
              `${JSON.stringify(s.lines[c])}, compiler/lint.vl got ` +
              `${JSON.stringify(l.lines[c])}. The two carry the same arm definition, ` +
              `the same closed sets and the same default region; whichever moved has ` +
              `to move back, or both together.`,
          );
        }
      }

      // Pin the fixture's own arithmetic, so an agreeing pair of ZEROS cannot pass.
      const want: Record<string, number[]> = { [INCOMPLETE]: f.incomplete, [SPLIT]: f.split };
      for (const c of CODES) {
        if (!eq(s.lines[c], want[c])) {
          throw new Error(
            `${f.name}: want ${c} at lines ${JSON.stringify(want[c])}, got ` +
              `${JSON.stringify(s.lines[c])}`,
          );
        }
      }

      if (f.says !== undefined) {
        const got = l.msgs[f.says.code];
        if (got.length !== 1 || !got[0].includes(f.says.text)) {
          throw new Error(
            `${f.name}: the ${f.says.code} message must say what the ladder lacks — ` +
              `want one message containing "${f.says.text}", got ${JSON.stringify(got)}`,
          );
        }
      }
    }

    await Deno.remove(dir, { recursive: true });
  },
});

// THE SETS ARE READ FROM THE TREE, NOT COPIED INTO IT. `ladder-budget.py` re-derives
// every closed set from the `export type` that declares it and compares against
// `compiler/lint.vl`'s `const kl<Name>` arrays, exiting non-zero on any drift — the
// same contract `scan-budget.py` enforces on `asPasses`. This runs that check on its
// own, so a drifting set fails HERE and names the set, rather than showing up as a
// mysterious count change in the ratchet.
Deno.test({
  name: "kind-ladder: the lint's closed-set copy still matches the tree",
  ignore: !GATED,
  fn: async () => {
    const { code, stdout, stderr } = await new Deno.Command("python3", {
      args: [SCRIPT, "--check"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (code !== 0) {
      throw new Error(
        `ladder-budget.py --check exited ${code}:\n` +
          new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
      );
    }
  },
});
