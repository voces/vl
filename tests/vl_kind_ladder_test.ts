// THE KIND-LADDER LINT, GRADED TO THE LINE.
//
// `compiler/lint.vl` grades one module at a time, and `vl check --budget
// scripts/ladder-budget-baseline.json` counts the same findings per file for the
// ratchet, so the lint is the only implementation. This runs it over the fixtures and
// compares the hit LINES with each fixture's pinned ones, not totals.
//
// The fixtures also PIN THE FALSE POSITIVES the rule has to design out: a ladder
// that delegates its default to a sibling, a membership test written as one `||`
// expression, a refusal default, a single-arm guard, and a pair of walkers that
// partition a set and hand back BOTH ways. Each is a shape the tree really has.
//
// A `match` is in scope ONLY through its `_` arm. A wildcard-less one is refused by
// the checker when it misses a member, so the language is the gate there; `_` covers
// every unnamed member and says nothing about them, which is the `if` chain's bare
// `-1` wearing a keyword. The `match-*` fixtures below pin both halves.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, like the other native `vl_*` suites.
//
// @test-timing sweep n=30

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const SETS = `${ROOT}/scripts/ladder-sets.vl`;
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
  /** Sibling modules written beside the fixture before it is graded. */
  deps?: { name: string; src: string }[];
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
    says: { code: INCOMPLETE, text: "tests 3 of 32 VKind kinds and ends without naming the rest" },
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
  {
    // D1642 — the LAST function's range ran to END OF FILE, so a module's trailing
    // top-level statements were read as its tail and `klLineCallsAny` took the call
    // for a naming default. The pair is the control: the same ladder without the
    // trailing line already fired, so only the added line can move the answer.
    name: "tail-control.vl",
    src: `function holed(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  -1
}
`,
    incomplete: [2],
    split: [],
  },
  {
    name: "tail-toplevel.vl",
    src: `function holed(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  -1
}
print(holed("u8list"))
`,
    incomplete: [2],
    split: [],
  },
  {
    // The other half of the same range bug: top-level code BETWEEN two functions was
    // inside the earlier one's body too, so `after`'s call named `before`'s default.
    name: "tail-between.vl",
    src: `function before(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  -1
}
print(before("u8list"))

function after(k: string): i32 {
  k.length
}
print(after("x"))
`,
    incomplete: [2],
    split: [],
  },
  {
    // THE `match` PAIR. `bare`'s `_` returns a sentinel and names nothing, which is
    // the whole hole the keyword can hide; `refusing`'s `_` reaches a refusal channel
    // and `exhaustive` has no `_` at all, so the language is already the gate. Both
    // must stay silent, or the rule would fire on every `match` in the compiler.
    name: "match-wild.vl",
    src: `type K = "nulbool" | "f64list" | "u8list" | "nulmap"

function emitFail(m: string): i32 { m.length }

function bare(k: K): i32 {
  match k {
    "nulbool" => 1
    "f64list" => 2
    _ => 0
  }
}

function refusing(k: K): i32 {
  match k {
    "nulbool" => 1
    "f64list" => 2
    _ => emitFail("no lowering for " + k)
  }
}

function exhaustive(k: K): i32 {
  match k {
    "nulbool" => 1
    "f64list" => 2
    "u8list" => 3
    "nulmap" => 4
  }
}
`,
    incomplete: [6],
    split: [],
    says: {
      code: INCOMPLETE,
      text: "matches 2 of 32 VKind kinds and its `_` arm names none of the rest",
    },
  },
  {
    // The TYPE-pattern face of the same rule, and the two body shapes a `_` can take:
    // `braced` opens a multi-line block (the shape `vl fmt` writes for `_ => {}`) and
    // `orpat` is a one-line value after an or-pattern. `namedBraced` is the control —
    // the same braced shape, with a refusal inside it.
    name: "match-type.vl",
    src: `type TyPrim = { primName: string }
type TyErr = { errAt: i32 }
type TyObj = { objN: i32 }
type Ty = TyPrim | TyErr | TyObj

function emitFail(m: string): i32 { m.length }

function braced(t: Ty): i32 {
  match t {
    TyPrim => {
      return t.primName.length
    }
    TyErr => {
      return t.errAt
    }
    _ => {

    }
  }
  0 - 1
}

function orpat(t: Ty): i32 {
  match t {
    TyPrim | TyErr => 1
    _ => 0
  }
}

function namedBraced(t: Ty): i32 {
  match t {
    TyPrim => {
      return 1
    }
    TyErr => {
      return 2
    }
    _ => {
      return emitFail("no rep for this arena variant")
    }
  }
  0 - 1
}
`,
    incomplete: [9, 24],
    split: [],
  },
  {
    // A one-line function is where a brace walk is easiest to get wrong: its `{` and
    // `}` are both on the header line, so the body must end there and not swallow
    // what follows.
    name: "tail-oneliner.vl",
    src: `function oneLiner(k: string): i32 { k.length }

function holed(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  -1
}
print(oneLiner("x") + holed("u8list"))
`,
    incomplete: [4],
    split: [],
  },
  {
    // A FIELD read is graded against the field's DECLARING type, not the set its literals
    // happen to spell. `c.primName` names three, but the field table (the lint's
    // `klFieldSetOf`, drift-gated against `type X = { f: T }`) resolves it to `PrimName`'s
    // ten, so the ladder is incomplete. Without the table its three would be an exhaustive
    // three-member set and nothing would fire — this is the pin that the field path is live.
    name: "field-prim-ladder.vl",
    src: `type Cell = { primName: string }

function fieldPrimLadder(c: Cell): i32 {
  if c.primName == "i64" { return 1 }
  if c.primName == "f64" { return 2 }
  if c.primName == "f32" { return 3 }
  0
}

const c: Cell = { primName: "i64" }
print(fieldPrimLadder(c))
`,
    incomplete: [4],
    split: [],
    says: { code: INCOMPLETE, text: "PrimName" },
  },
  {
    // A default handing the rest to an IMPORTED function delegates as much as one calling a
    // function of its own module, under the import's own name or an `as` alias — moving a
    // callee to another module (the L9 carves) must not turn its callers into hits. An
    // imported table read is not a call, so the third ladder still fires.
    name: "imported.vl",
    deps: [{
      name: "imported_owner.vl",
      src: `export function owner(k: string): i32 { k.length }
export const table: i32[] = [1]
`,
    }],
    src: `import { owner, owner as handOff, table } from "./imported_owner"

function viaImport(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  owner(k)
}

function viaAlias(k: string): i32 {
  if k == "nulmap" { return 1 }
  if k == "nulvariant" { return 2 }
  handOff(k)
}

function stillHoled(k: string): i32 {
  if k == "strlist" { return 1 }
  if k == "reflist" { return 2 }
  table[0]
}

print(viaImport("x") + viaAlias("x") + stillHoled("x"))
`,
    incomplete: [17],
    split: [],
  },
];

type Hits = { lines: Record<string, number[]>; msgs: Record<string, string[]> };

// The rule grades `compiler/` alone (docs/internals/lint-rule-scope.md), so the fixture
// is checked as `compiler/<file>` relative to its temp root.
const lint = async (dir: string, file: string): Promise<Hits> => {
  const path = `compiler/${file}`;
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--severity", "info", "--json", "--compiler", COMPILER],
    cwd: dir,
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
  const diags = all.filter((d) => d.file.endsWith(`/${path}`) || d.file === path);
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
  name: "kind-ladder: the lint fires on each fixture's pinned lines, both codes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_kind_ladder_" });
    await Deno.mkdir(`${dir}/compiler`);

    for (const f of FIXTURES) {
      const path = `${dir}/compiler/${f.name}`;
      for (const d of f.deps ?? []) {
        await Deno.writeTextFile(`${dir}/compiler/${d.name}`, d.src);
      }
      await Deno.writeTextFile(path, f.src);
      const l = await lint(dir, f.name);

      const want: Record<string, number[]> = { [INCOMPLETE]: f.incomplete, [SPLIT]: f.split };
      for (const c of CODES) {
        if (!eq(l.lines[c], want[c])) {
          throw new Error(
            `${f.name}: want ${c} at lines ${JSON.stringify(want[c])}, ` +
              `compiler/lint.vl got ${JSON.stringify(l.lines[c])}`,
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

// THE SETS ARE READ FROM THE TREE, NOT COPIED INTO IT. `scripts/ladder-sets.vl`
// re-derives every closed set from the `export type` that declares it and compares
// against `compiler/lint.vl`'s `const kl<Name>` arrays, exiting non-zero on any drift —
// the same contract tests/vl_scan_passes_test.ts enforces on `asPasses`. A drifting set
// fails HERE and names the set, rather than showing up as a count change in the ratchet.
// The control is a copy of compiler/ with one new closed set, which the check must name.
const sets = async (args: string[]) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", SETS, "--compiler", COMPILER, "--", ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

Deno.test({
  name: "kind-ladder: the lint's closed-set copy still matches the tree",
  ignore: !ENABLED,
  fn: async () => {
    const tree = await sets([]);
    if (tree.code !== 0) {
      throw new Error(`ladder-sets.vl exited ${tree.code}:\n${tree.out}`);
    }
    const dir = await Deno.makeTempDir({ prefix: "vl_kind_sets_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      for await (const e of Deno.readDir(`${ROOT}/compiler`)) {
        if (e.isFile && e.name.endsWith(".vl")) {
          await Deno.copyFile(`${ROOT}/compiler/${e.name}`, `${dir}/compiler/${e.name}`);
        }
      }
      await Deno.writeTextFile(
        `${dir}/compiler/zz_drift.vl`,
        `export type ZzDrift = "a" | "b" | "c"\n`,
      );
      const drifted = await sets(["--root", dir]);
      const want = "`ZzDrift` (compiler/zz_drift.vl:1) is declared in the tree and missing";
      if (drifted.code !== 1 || !drifted.out.includes(want)) {
        throw new Error(
          `the drifted control must exit 1 naming ZzDrift; got ${drifted.code}:\n${drifted.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
