// THE IR SHADOW (`compiler/ir_build.vl`, ir-design-2026-11.md step I0).
//
// Armed, `emitFuncCode` hands each function to the phase-A builder after its legacy lowering;
// a function inside I1's construct set is built, verified and discarded. TWO HALVES:
//
//   covered — programs in the set build and verify, with a nonzero covered count and no
//             failure, and an armed compile's bytes equal an unarmed one's.
//   fires   — `irShadowCorrupt(1)` swaps a variable's rep and `irShadowCorrupt(2)` deletes a
//             temp's definition: the verifier must fail naming rule 3 and rule 4. Without
//             these a verifier that checked nothing would pass.
//
// A new row is one file, `tests/ir-shadow-rows/<slug>.vl`: line 1 is `// ir shadow: <name>`, then
// `// expect <row key> = N` (or `>= N`) and `// expect no row containing <text>` lines, then the
// program. Every file row also wants rc 0, no `fail` row and matched equal to covered. A name both
// inline and in a file fails the tripwire.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_ir_shadow_test.ts

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[ir-shadow] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** Compiles `src` on a fresh instance; the shadow's rows when `arm` is set, and the output. */
const run = (src: string, arm: boolean | number, corrupt = 0) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.irShadowArm(typeof arm === "number" ? arm : arm ? 1 : 0);
  exp.irShadowCorrupt(corrupt);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  const rows = new Map<string, number>();
  for (let i = 0; i < exp.irShadowRowCount(); i++) {
    const b: number[] = [];
    for (let j = 0; j < exp.irShadowRowLen(i); j++) b.push(exp.irShadowRowAt(i, j));
    rows.set(String.fromCodePoint(...b), exp.irShadowRowN(i));
  }
  const out: number[] = [];
  for (let i = 0; i < exp.rbyteLen(); i++) out.push(exp.rbyteAt(i));
  return { rc, rows, out };
};

const failures = (rows: Map<string, number>) =>
  [...rows.keys()].filter((k) => k.startsWith("fail "));

/** One `tests/ir-shadow-rows/*.vl` file: its name line, its expectations and its program. */
type FileRow = {
  file: string;
  name: string;
  counts: { key: string; op: "=" | ">="; n: number }[];
  absent: string[];
  src: string;
};

const ROWS_DIR = `${ROOT}/tests/ir-shadow-rows`;
const NAME_LINE = /^\/\/ (ir shadow: .+)$/;
const COUNT_LINE = /^\/\/ expect (.+?) (=|>=) (\d+)$/;
const ABSENT_LINE = /^\/\/ expect no row containing (.+)$/;
// Coverage counts are floors: matched = covered is graded in every row, so a floor hides no
// mismatch, and an exact count would red whenever another PR covers one more function.
const FLOOR_KEYS = new Set(["covered", "matched", "start covered", "start matched"]);

/** Parses one row file; a directive line it cannot read is an error, never a skipped check. */
const parseRow = (file: string, text: string): FileRow => {
  const lines = text.split("\n");
  const name = NAME_LINE.exec(lines[0] ?? "")?.[1];
  if (name === undefined) throw new Error(`${file}:1: want \`// ir shadow: <name>\`, got ${JSON.stringify(lines[0])}`);
  const row: FileRow = { file, name, counts: [], absent: [], src: text };
  for (let i = 1; i < lines.length && lines[i].startsWith("// expect"); i++) {
    const count = COUNT_LINE.exec(lines[i]);
    const absent = ABSENT_LINE.exec(lines[i]);
    if (absent) row.absent.push(absent[1]);
    else if (count && FLOOR_KEYS.has(count[1]) && count[2] === "=") {
      throw new Error(`${file}:${i + 1}: want \`// expect ${count[1]} >= ${count[3]}\`, got an exact count: another PR's coverage would break it`);
    } else if (count) row.counts.push({ key: count[1], op: count[2] as "=" | ">=", n: Number(count[3]) });
    else throw new Error(`${file}:${i + 1}: unreadable directive ${JSON.stringify(lines[i])}`);
  }
  return row;
};

const fileRows: FileRow[] = [...(() => {
  try {
    return Deno.readDirSync(ROWS_DIR);
  } catch {
    return [];
  }
})()]
  .filter((e) => e.isFile && e.name.endsWith(".vl"))
  .map((e) => e.name)
  .sort()
  .map((f) => parseRow(`tests/ir-shadow-rows/${f}`, Deno.readTextFileSync(`${ROWS_DIR}/${f}`)));

// A divergence Q57 lets a lane choose: `scripts/ir-divergence-baseline.txt` lists it as
// `program\tfunction\tmechanism\tPR`, the function as a `--names` build spells it (`f@1`).
/** A byte mismatch, or the claim rule's fail for one: informational, since behaviour parity is the
 * gate (ci-ir-identity; ready-check builds and runs the corpus). A spans or other mismatch still reds. */
const bytesRow = (k: string) =>
  k.includes("bytes") && (k.startsWith("mismatch ") || k.startsWith("fail a claimable function did not match: "));

/** The rows without byte mismatches, and how many covered functions those were. */
const dropBytes = (rows: Map<string, number>) => {
  const fns = [...rows.keys()]
    .filter((k) => bytesRow(k) && k.startsWith("mismatch ") && !k.startsWith("mismatch start "))
    .reduce((n, k) => n + rows.get(k)!, 0);
  return { rows: new Map([...rows].filter(([k]) => !bytesRow(k))), expected: fns };
};

/** Grades one file row's armed compile against its expectations and the standing three. */
const gradeRow = (row: FileRow, corrupt = 0) => {
  const armed = run(row.src, true, corrupt);
  const { rc } = armed;
  const { rows, expected } = dropBytes(armed.rows);
  const got = JSON.stringify([...rows]);
  if (rc !== 0) throw new Error(`${row.file}: want compileSrc rc 0, got ${rc}`);
  const fails = failures(rows);
  if (fails.length > 0) throw new Error(`${row.file}: want no failure, got:\n${fails.join("\n")}`);
  if ((rows.get("matched") ?? 0) + expected !== (rows.get("covered") ?? 0)) {
    throw new Error(`${row.file}: want every covered function matched, got ${got}`);
  }
  for (const { key, op, n } of row.counts) {
    const have = rows.get(key) ?? 0;
    if (op === "=" ? have !== n : have < n) throw new Error(`${row.file}: want "${key}" ${op} ${n}, got ${have}; rows ${got}`);
  }
  for (const text of row.absent) {
    const hit = [...rows.keys()].filter((k) => k.includes(text));
    if (hit.length > 0) throw new Error(`${row.file}: want no row containing "${text}", got ${JSON.stringify(hit)}`);
  }
};

for (const row of fileRows) Deno.test({ name: row.name, ignore, fn: () => gradeRow(row) });

// The byte-divergence control. `irShadowCorrupt(3)` adds a byte to every lowering, so each covered
// function (and the start body) is a byte mismatch, which passes; a spans mismatch (control 4) reds.
const DIVERGED: FileRow = {
  file: "tests/ir-shadow-rows/divergence-control.vl",
  name: "ir shadow: divergence control",
  counts: [],
  absent: [],
  src: "function f(x: i32): i32 { return x + 1 }\nfunction g(x: i32): i32 { return x * 2 }\n" +
    "function h(x: i32): i32 { return x - 3 }\nprint(f(2))\nprint(g(3))\nprint(h(4))\n",
};
const reds = (f: () => void, want: string) => {
  try {
    f();
  } catch (e) {
    if ((e as Error).message.includes(want)) return;
    throw new Error(`want a red containing "${want}", got: ${(e as Error).message}`);
  }
  throw new Error(`want a red containing "${want}", got a pass`);
};

Deno.test({
  name: "ir shadow: a byte divergence is informational, and a spans divergence reds",
  ignore,
  fn: () => {
    gradeRow(DIVERGED, 3);
    reds(() => gradeRow(DIVERGED, 4), "did not match: spans");
  },
});

// Verifier rule 2's reference niche pairs: a list's, closure's and map's niche read verifies at its
// own `A | null`, and reds at either other shape's (`irShadowCorrupt(10)` forward, `(11)` back).
Deno.test({
  name: "ir shadow: a reference niche read verifies at its own shape and at no other",
  ignore,
  fn: () => {
    const kinds = [
      "type U = i32[] | null | string\nfunction f(u: U) {\n  if u is string { return 0 }\n  const l = u\n" +
      "  return if l == null { 1 } else { l.length }\n}\nprint(f([1]))\n",
      "type F = (a: i32) => i32\ntype U = F | null | string\nfunction f(u: U) {\n  if u is string { return 0 }\n" +
      "  const c = u\n  return if c == null { 1 } else { c(2) }\n}\nprint(f((a: i32) => a))\n",
      "type M = {[string]: i32}\ntype U = M | null | i32\nfunction f(u: U) {\n  if u is i32 { return 0 }\n" +
      "  const m = u\n  return if m == null { 1 } else { m.length }\n}\nconst mm: M = Map()\nprint(f(mm))\n",
    ];
    const want = "a niche read is at its niche's rep";
    for (const src of kinds) {
      const ok = run(src, true);
      const m = ok.rows.get("matched") ?? 0;
      if (failures(ok.rows).length > 0 || m < 1 || m !== ok.rows.get("covered")) {
        throw new Error(`want every covered function matched, got ${JSON.stringify([...ok.rows])}\n${src}`);
      }
      for (const k of [10, 11]) {
        const { rows } = run(src, true, k);
        if (!failures(rows).some((r) => r.includes(want))) {
          throw new Error(`want control ${k} to red with "${want}", got ${JSON.stringify([...rows])}\n${src}`);
        }
      }
    }
  },
});

// Verifier rule 10's call head: a closure call whose argument writes a statement stages its head
// (`RCallRefHead`) ahead of it, and that head is read only as its call's callee. Read as a plain
// callee (`irShadowCorrupt(12)`), it reds.
Deno.test({
  name: "ir shadow: a staged call_ref head is read only by its call",
  ignore,
  fn: () => {
    const src = "function mk() {\n  print(\"mk\")\n  return 2.5\n}\nfunction m() {\n" +
      "  let f: (f64) => f64 = (x) => x * 2.0\n  let b: f64 = 0.5\n  print(f(b = mk()))\n  print(b)\n}\nm()\n";
    const ok = run(src, true);
    const m = ok.rows.get("matched") ?? 0;
    if (failures(ok.rows).length > 0 || m < 1 || m !== ok.rows.get("covered")) {
      throw new Error(`want every covered function matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const want = "a call_ref head read anywhere but as its call's callee";
    const { rows } = run(src, true, 12);
    if (!failures(rows).some((r) => r.includes(want))) {
      throw new Error(`want control 12 to red with "${want}", got ${JSON.stringify([...rows])}`);
    }
  },
});

// A nullable record compare's element side banks the element-read rows of its null tests and
// fields: with them dropped (control 5) the row's spans count reds.
Deno.test({
  name: "ir shadow: a nullable record compare's element side banks its element-read rows",
  ignore,
  fn: () => {
    const row = fileRows.find((r) => r.file.endsWith("/nullable-record-compare-element-side.vl"));
    if (row === undefined) throw new Error("want the nullable-record-compare-element-side row, got none");
    gradeRow(row);
    reds(() => gradeRow(row, 5), "spans");
  },
});

// Verifier rule 2's nullable-compare pair: an element side counts at its list's element rep, so a
// bare record against a nullable element verifies; a compare with no nullable side, marked
// nullable (`irShadowCorrupt(9)`), is refused.
Deno.test({
  name: "ir shadow: a nullable record compare needs a nullable side, an element side's at its element rep",
  ignore,
  fn: () => {
    const held = "type C = { r: i32 }\nfunction f(xs: (C | null)[], y: C) { return y == xs[0] }\n" +
      "print(f([{ r: 1 }], { r: 1 }))\n";
    const ok = run(held, true);
    if (failures(ok.rows).length > 0 || ok.rows.get("matched") !== 1) {
      throw new Error(`want f matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const bare = "type C = { r: i32 }\nfunction f(xs: C[], y: C) { return y == xs[0] }\n" +
      "print(f([{ r: 1 }], { r: 1 }))\n";
    const { rows } = run(bare, true, 9);
    const want = "a nullable record compare has a nullable operand";
    if (!failures(rows).some((k) => k.includes(want))) {
      throw new Error(`want a fail row naming "${want}", got ${JSON.stringify([...rows])}`);
    }
  },
});

// A record compare's element side over a place receiver banks the element-read rows legacy's
// own root writes at each field: with them dropped (control 5) the row's spans count reds.
Deno.test({
  name: "ir shadow: a record compare's place element side banks its element-read rows",
  ignore,
  fn: () => {
    const row = fileRows.find((r) => r.file.endsWith("/record-compare-element-place.vl"));
    if (row === undefined) throw new Error("want the record-compare-element-place row, got none");
    gradeRow(row);
    reds(() => gradeRow(row, 5), "spans");
  },
});

// The tripwire: a row name is one row, inline or in a file, never both and never two files.
Deno.test({
  name: "ir shadow: no row name is both inline and a file, or two files",
  fn: () => {
    const self = Deno.readTextFileSync(new URL(import.meta.url));
    const inline = new Set([...self.matchAll(/^\s*name: ["`](ir shadow: [^"`$]+)["`],$/gm)].map((m) => m[1]));
    const seen = new Map<string, string>();
    const clash: string[] = [];
    for (const row of fileRows) {
      if (inline.has(row.name)) clash.push(`${row.file} and an inline row are both "${row.name}"`);
      const other = seen.get(row.name);
      if (other !== undefined) clash.push(`${other} and ${row.file} are both "${row.name}"`);
      seen.set(row.name, row.file);
    }
    if (inline.size < 50) throw new Error(`want the inline row names read (at least 50), got ${inline.size}`);
    if (clash.length > 0) throw new Error(`want each row name once, got:\n${clash.join("\n")}`);
  },
});

// A const cell's fragment under the dual emit's control 3 must report a bytes mismatch, the class
// the corpus baseline and the bytes veto read; unbroken, it matches.
Deno.test({
  name: "ir shadow: a const cell whose fragment differs is a bytes mismatch",
  ignore,
  fn: () => {
    const src = `const xs = [1, 2]\nconst s = "hi"\nprint(xs[1])\nprint(s)\n`;
    const ok = run(src, true);
    if (ok.rows.get("const cell plain array: matched") !== 2 || ok.rows.get("const cell plain string: matched") !== 2) {
      throw new Error(`want both cells matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const { rows } = run(src, true, 3);
    const bad = [...rows.keys()].filter((k) => k.startsWith("mismatch bytes: const cell "));
    if (bad.length !== 2 || [...rows.keys()].some((k) => k.startsWith("const cell ") && k.endsWith(": matched"))) {
      throw new Error(`want each cell a "mismatch bytes: const cell" row, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A record literal whose row drops an effectful field (D1696) is built through legacy's stash, the
// dropped initialiser run for its effect in source order: at a struct row and at a union arm, a
// partial literal at its destination's row, each matching legacy's bytes.
Deno.test({
  name: "ir shadow: a literal that drops or omits fields is built at its destination's row and matches",
  ignore,
  fn: () => {
    const src = `type Plain = { legs: i64 }\ntype Shallow = { pet: Plain }\n` +
      `type A = { k: i32, legs: i64 }\ntype B = { s: string }\ntype Pet = A | B\n` +
      `type Cfg = { verbose: boolean | null, out: string | null }\n` +
      `let n = 0\nfunction f() { n = n + 1\n  return true }\n` +
      `function mk(): Shallow {\n  const sv = { pet: { legs: 4, purr: f() } }\n  return sv\n}\n` +
      `function arm(): Pet {\n  const sv = { k: 1, legs: 4, purr: f() }\n  return sv\n}\n` +
      `function cfg(): Cfg {\n  const c: Cfg = { out: "x" }\n  return c\n}\n` +
      `print(mk().pet.legs)\nconst p = arm()\nif p is A { print(p.legs) }\nprint(cfg().out ?? "none")\nprint(n)\n`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    const unc = [...rows.keys()].filter((k) => k.startsWith("uncovered ") || k.startsWith("mismatch"));
    if (unc.length > 0 || (rows.get("matched") ?? 0) < 4) {
      throw new Error(`want mk, arm, cfg and f matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A closure thunk's IR lowering under the dual emit's control 3 must report a bytes mismatch;
// unbroken, each thunk matches legacy's `emitCloThunkCode` (a valued and a void target).
Deno.test({
  name: "ir shadow: a closure thunk whose lowering differs is a bytes mismatch",
  ignore,
  fn: () => {
    const src = `function sq(x: i32): i32 { return x * x }\nfunction say(x: i32) { print(x) }\n` +
      `const f: (x: i32) => i32 = sq\nconst g: (x: i32) => void = say\nprint(f(3))\ng(4)\n`;
    const ok = run(src, true);
    if (ok.rows.get("thunk fns") !== 2 || ok.rows.get("thunk matched") !== 2) {
      throw new Error(`want 2 thunks matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const { rows } = run(src, true, 3);
    if (rows.get("mismatch bytes: thunk") !== 2 || rows.has("thunk matched")) {
      throw new Error(`want each thunk a "mismatch bytes: thunk" row, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A thunk whose target's result type is open is typed by its rep's own type where that is closed
// and round-trips to the rep (`thunkRetTy`); where it does not, by legacy's declared result
// descriptor (`resultDescTy`). Each matches.
Deno.test({
  name: "ir shadow: a thunk's open result type stands as its rep's own where that round-trips, else at its declared result",
  ignore,
  fn: () => {
    const fits = `export function id<T>(x: T): T { return x }\nconst k = () => id\nprint(k()(9))\n`;
    const ok = run(fits, true);
    if (ok.rows.get("thunk fns") !== 1 || ok.rows.get("thunk matched") !== 1) {
      throw new Error(`want the thunk matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const open = `function inc(x) { return x + 1 }\nfunction run(f) { return f()(41) }\n` +
      `print(run(() => inc) + run(() => inc))\n`;
    const { rows } = run(open, true);
    if (rows.has("thunk uncovered thunk open result type") || (rows.get("thunk matched") ?? 0) < 2) {
      throw new Error(`want both open-result thunks matched at the declared result, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A folded constant's cell is its folded value, the one `*.const` legacy's `emitConstFoldValue`
// writes, at both integer widths; under the dual emit's control 3 each is a bytes mismatch.
Deno.test({
  name: "ir shadow: a folded const cell whose value differs is a bytes mismatch",
  ignore,
  fn: () => {
    // Read from a function, so neither cell is promoted into the start body.
    const src = `const A = 3\nconst B: i32 = A << 4\nconst C: i64 = (1 as i64) << 40\n` +
      `function show() {\n  print(B)\n  print(C)\n}\nshow()\n`;
    const ok = run(src, true);
    const folded = [...ok.rows].filter(([k]) => k.startsWith("const cell folded "));
    if (folded.length === 0 || folded.some(([k]) => !k.endsWith(": matched"))) {
      throw new Error(`want every folded cell matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const { rows } = run(src, true, 3);
    const bad = [...rows.keys()].filter((k) => k.startsWith("mismatch bytes: const cell folded "));
    if (bad.length === 0 || [...rows.keys()].some((k) => k.startsWith("const cell folded ") && k.endsWith(": matched"))) {
      throw new Error(`want each folded cell a "mismatch bytes: const cell folded" row, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A nullable map coalesced into a wider map that stores alike yields that map; under control 7 the
// join's out sits at an unrelated map's rep, which the verifier must refuse.
Deno.test({
  name: "ir shadow: a map join's out at an unrelated map's rep fails the nullable-reference rule",
  ignore,
  fn: () => {
    const src = `function pick(m: {[string]: string} | null, d: {[string]: string | null}, z: {[string]: i32}) {\n` +
      `  const x = m ?? d\n  print(x.length + z.length)\n}\n` +
      `const w: {[string]: string | null} = Map()\nconst q: {[string]: i32} = Map()\npick(null, w, q)\n`;
    const ok = run(src, true);
    if (failures(ok.rows).length > 0 || ok.rows.get("matched") !== 1) {
      throw new Error(`want pick matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const { rows } = run(src, true, 7);
    const want = "a map whose value widens the inner's";
    if (!failures(rows).some((k) => k.includes(want))) {
      throw new Error(`want a fail row naming "${want}", got ${JSON.stringify([...rows])}`);
    }
  },
});

// The operand re-read's control: a union compare off its null leg marked as reading its operand
// again (`irShadowCorrupt(8)`), which the verifier must refuse; the re-read is a null leg's alone.
Deno.test({
  name: "ir shadow: a union compare's operand read again off its null leg fails the verifier",
  ignore,
  fn: () => {
    const src = `type U = i32 | string\nfunction f(u: U) { return u == "s" }\nprint(f("s"))\n`;
    const ok = run(src, true);
    if (failures(ok.rows).length > 0 || ok.rows.get("matched") !== 1) {
      throw new Error(`want f matched, got ${JSON.stringify([...ok.rows])}`);
    }
    const { rows } = run(src, true, 8);
    const want = "operand is read again off a null leg";
    if (!failures(rows).some((k) => k.includes(want))) {
      throw new Error(`want a fail row naming "${want}", got ${JSON.stringify([...rows])}`);
    }
  },
});

// The file rows' controls: an unreadable directive is refused, and a row whose expectation the
// compile cannot meet fails its grade. Without these a reader that checked nothing would pass.
Deno.test({
  name: "ir shadow: a file row's bad directive and unmet expectation each fail",
  ignore,
  fn: () => {
    const src = `function sq(x: i32): i32 { return x * x }\nprint(sq(3))\n`;
    let refused = false;
    try {
      parseRow("control.vl", `// ir shadow: control\n// expect covered ~ 1\n${src}`);
    } catch {
      refused = true;
    }
    if (!refused) throw new Error("want a bad directive refused, got it parsed");
    for (const key of ["covered", "matched", "start covered", "start matched"]) {
      let exact = false;
      try {
        parseRow("control.vl", `// ir shadow: control\n// expect ${key} = 1\n${src}`);
      } catch {
        exact = true;
      }
      if (!exact) throw new Error(`want an exact "${key}" count refused, got it parsed`);
    }
    gradeRow(parseRow("control.vl", `// ir shadow: control\n// expect covered >= 1\n// expect fns = 1\n${src}`));
    for (const bad of ["// expect fns = 2", "// expect matched >= 5", "// expect no row containing covered"]) {
      let failed = false;
      try {
        gradeRow(parseRow("control.vl", `// ir shadow: control\n${bad}\n${src}`));
      } catch {
        failed = true;
      }
      if (!failed) throw new Error(`want "${bad}" to fail its grade, got a pass`);
    }
  },
});

// Scalars, locals, every control form, direct calls and a global: all inside I1's set.
const COVERED = `let total = 0
function sq(x: i32): i32 { return x * x }
function wide(a: i64, b: i64): i64 { return a * b + 7 }
function pos(x: f64): boolean { return x > 0.0 }
function above(x: f64): boolean { return x > -1.5 }
function sum(n: i32): i32 {
  let s = 0
  let i = 0
  while i < n {
    i = i + 1
    if i % 3 == 0 { continue }
    if i > 50 { break }
    s = s + sq(i)
  }
  return s
}
function pick(a: i32, b: i32): i32 {
  if a > b && b >= 0 || a == 0 { return a }
  return -b
}
function bump() { total = total + 1 }
bump()
print(sum(10))
print(pick(3, 2))
print(wide(3, 4))
print(pos(1.5))
print(above(-2.0))
print(total)
`;

Deno.test({
  name: "ir shadow: I1's constructs build and verify, and arming moves no byte",
  ignore,
  fn: () => {
    const armed = run(COVERED, true);
    if (armed.rc !== 0) throw new Error(`want compileSrc rc 0, got ${armed.rc}`);
    const fails = failures(armed.rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    const covered = armed.rows.get("covered") ?? 0;
    const verified = armed.rows.get("verified") ?? 0;
    const fns = armed.rows.get("fns") ?? 0;
    console.log(`[ir-shadow] covered ${covered} of ${fns}; rows ${JSON.stringify([...armed.rows])}`);
    // sq, wide, pos, above, sum, pick and bump are each inside the set.
    if (covered < 7 || verified !== covered) {
      throw new Error(`want at least 7 covered, all verified; got covered ${covered}, verified ${verified}`);
    }
    const matched = armed.rows.get("matched") ?? 0;
    if (matched !== covered) {
      throw new Error(`want every covered function to match legacy's bytes, got ${matched} of ${covered}`);
    }
    const plain = run(COVERED, false);
    // Unarmed, the shipped claim records only its `claimed` rows (a function's, the start's);
    // nothing else, and no fallback.
    const other = [...plain.rows.keys()].filter((k) => k !== "claimed" && k !== "claimed start" && k !== "claimed const cell");
    if (other.length !== 0) throw new Error(`want only claimed rows unarmed, got ${other.join(", ")}`);
    if (plain.out.length !== armed.out.length || plain.out.some((b, i) => b !== armed.out[i])) {
      throw new Error(`want byte-identical output armed and unarmed (${plain.out.length} vs ${armed.out.length} bytes)`);
    }
  },
});

for (const [mode, rule] of [[1, 3], [2, 4]] as const) {
  Deno.test({
    name: `ir shadow: the failing control ${mode} makes the verifier name rule ${rule}`,
    ignore,
    fn: () => {
      const { rc, rows } = run(COVERED, true, mode);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      const named = fails.filter((k) => k.startsWith(`fail rule ${rule} `));
      if (named.length === 0) {
        throw new Error(`want a rule ${rule} failure, got: ${JSON.stringify([...rows.keys()].map((k) => k.split("\n")[0]))}`);
      }
      if (named.length !== fails.length) {
        throw new Error(`want only rule ${rule}, got: ${fails.map((k) => k.split("\n")[0]).join("; ")}`);
      }
    },
  });
}

// The dual emit's controls: a byte added to the lowering, and a span row dropped from it, must
// each turn every match into a mismatch of that class. Without these a comparison that compared
// nothing would pass.
for (const [mode, cls] of [[3, "mismatch bytes"], [4, "mismatch spans"]] as const) {
  Deno.test({
    name: `ir shadow: the dual emit's control ${mode} reports a ${cls.slice(9)} mismatch`,
    ignore,
    fn: () => {
      const { rc, rows } = run(COVERED, true, mode);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const got = [...rows].filter(([k]) => k.startsWith(cls) && !k.includes(": const cell "))
        .reduce((n, [, c]) => n + c, 0);
      const covered = rows.get("covered") ?? 0;
      if ((rows.get("matched") ?? 0) !== 0 || got !== covered) {
        throw new Error(`want all ${covered} covered as "${cls}", got ${JSON.stringify([...rows])}`);
      }
    },
  });
}

// The element-read rows' control: a list read banks a row of its own (kind 6), and dropping the
// lowering's must turn the match into a span mismatch.
Deno.test({
  name: "ir shadow: the dual emit's control 5 reports a list read's missing row",
  ignore,
  fn: () => {
    const src = `function at(xs: i32[], i: i32): i32 { return xs[i] + 1 }\nprint(at([1, 2, 3], 1))\n`;
    const ok = run(src, true);
    if ((ok.rows.get("matched") ?? 0) !== 1) throw new Error(`want the read matched, got ${JSON.stringify([...ok.rows])}`);
    const { rows } = run(src, true, 5);
    const got = [...rows].filter(([k]) => k.startsWith("mismatch spans")).reduce((n, [, c]) => n + c, 0);
    if (got !== 1 || (rows.get("matched") ?? 0) !== 0) {
      throw new Error(`want one "mismatch spans", got ${JSON.stringify([...rows])}`);
    }
  },
});

// Outside the set: a store whose index holds an `if` (the receiver and index wait on the stack below
// it, so no stage holds them) and a radix literal assigned through an
// if-expression into a nullable wide cell each leave their function uncovered, named. A closure
// parameter, its baked callback clone's included, is inside it and covered.
Deno.test({
  name: "ir shadow: a construct outside the set leaves its function uncovered, by reason",
  ignore,
  fn: () => {
    const src = `type J = { a: i32 }
type P = { j: J, k: i32 }
type Q = { j: null, k: i32 }
function mk(b: boolean): P | Q {
  return if b { { j: { a: 3 }, k: 1 } } else { { j: null, k: 2 } }
}
const g = mk(true)
function greet(a: boolean, x: i32): i32 {
  const xs: i32[] = [0, 0]
  xs[if a { 0 } else { 1 }] = x
  return xs[0]
}
function ap(f: (x: i32) => i32): i32 { return f(4) }
function wr(c: boolean): i64 | null {
  let x: i64 | null = null
  return x = if c { 0xfffffffe } else { 1 }
}
print(greet(true, 1))
print(ap((x: i32) => x + 1))
print(wr(true) ?? 0)
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    for (const why of ["box ladder"]) {
      if (!rows.has(`uncovered ${why}`)) {
        throw new Error(`want an "uncovered ${why}" row, got ${JSON.stringify([...rows])}`);
      }
    }
    const unc = [...rows.keys()].filter((k) => k.startsWith("uncovered "));
    if (unc.length < 2) throw new Error(`want two uncovered reasons, got ${JSON.stringify([...rows])}`);
    if ((rows.get("covered") ?? 0) < 3) throw new Error(`want the closure parameter's functions covered, got ${JSON.stringify([...rows])}`);
  },
});

// The decisions legacy and the lowering share (I1b): a reference global's read and its
// `ref.as_non_null`, a never-returning callee's `call; unreachable`, and an instance's parameter
// read; string operators, a char literal, a string list read and a void call's tail form (C2h);
// an atom result and its literals (C2i); string `.slice` and `.cpLen` (C2j); a list push (C2k);
// an atom `!=` against a literal and between two atoms, each `i32.eq` then `i32.eqz` (N2b-1);
// a `.pop()` statement past the list's end (N2b-2a); an atom of id 0 and a `null` into its
// `K | null`, and a call retagged into it in tail form, as legacy tail-calls it (N2b-2c-1); a
// `K | null` holding atom id 0 tested `!= null`, `null ==` and `== "a"` (N2b-2c-1b); a global
// map read with an i32 default through legacy's helper, by an i32 key, a built string key, and a
// key holding another such read (M1); a `print` of a built string, of f64 values that are `-0`,
// `NaN` and `2e+300`, and of an f32, an i64, a boolean and an i32 (P1); the four bitcasts, f64
// and f32 float intrinsics, and i32 and i64 integer intrinsics (N3); a `string | null` built from
// `null` and from a string, passed through, assigned, and coalesced with a string literal to a
// string and inside a `print` (N2b-2c-2a); a `string | null` tested `== null`, `!= null` and
// `null !=`, and printed (N2b-2c-2b); list literals of i32s, of f64s with an i32 element widened,
// of i64s, f32s, strings and booleans, and an empty one (A1); a plain walk over an i32 list and a
// string list, and one whose body holds a loop with its own `break` (F1); a string from one code
// point and from a local code-point list (S1); a box's `is` test of a record variant, plain and
// told apart by a literal field (B1); a narrowed box's field read, of an i32 and of a string
// (B2); a struct parameter's field reads, a list of records' length, and a global record's list
// field's length (B3); a narrowed box read whole at its variant, and a `string | null`
// parameter read at its string (narrowed read); a value `if` bound and one widened into an
// `f64` binding (B4a).
// Each witness holds a covered function that must match legacy's bytes, as must a covered helper.
const SHARED = [
  `let name = "vl"\nfunction who(): string { return name }\nprint(who())\n`,
  `function stop(code: i32): never { return __trap__() }
function guard(x: i32): i32 {
  if x < 0 { stop(x) }
  return x + 1
}
print(guard(2))
`,
  `function id<T>(v: T): T { return v }\nprint(id(3))\n`,
  `function cmp(a: string, b: string): boolean { return a + "x" == b || a > b }\nprint(cmp("a", "b"))\n`,
  `function dig(c: i32): boolean { return c >= '0' && c <= '9' }\nprint(dig(53))\n`,
  `function at(xs: string[], i: i32): string { return xs[i] }\nprint(at(["a", "b"], 1))\n`,
  `type K = "p" | "q"\nfunction pick(c: boolean): K {\n  if c { return "p" }\n  return "q"\n}\nprint(pick(true) == "p")\n`,
  `function tl(s: string, n: i32): string { return s.slice(n, s.length) }\nprint(tl("hello", 2))\n`,
  `function cps(s: string): i32 { return s.cpLen() + 1 }\nprint(cps("ab"))\n`,
  `let gs: i32[] = []\nfunction add(x: i32): i32 {\n  gs.push(x)\n  return gs.push(x + 1)\n}\nprint(add(1))\n`,
  `let ns: string[] = ["a", "b"]\nfunction put(i: i32, s: string) { ns[i] = s + "!" }\nput(1, "z")\nprint(ns[1])\n`,
  `let fs: f64[] = [0.0, 0.0]\nfunction wid(i: i32, x: i32): f64 {\n  fs[i] = x\n  const y: f64 = x\n  return y\n}\nprint(wid(1, 3))\n`,
  `function pick(c: boolean, x: i64): i64 | null {\n  if c { return x }\n  return x + 1\n}\nprint(pick(true, 3) ?? 0)\n`,
  `function pn(c: boolean): i32 | null {\n  if c { return 3 }\n  return null\n}\nprint(pn(false) ?? 7)\n`,
  `function pf(c: boolean): f32 | null {\n  if c { return null }\n  return 1.5\n}\nprint(pf(false) ?? 0.0)\n`,
  `type K = "a" | "b"\nfunction nb(k: K): boolean { return "b" != k }\nconst ks: K[] = ["a", "b"]\nprint(nb(ks[0]))\n`,
  `type K = "a" | "b"\nfunction df(x: K, y: K): boolean { return x != y }\nconst ks: K[] = ["a", "b"]\nprint(df(ks[0], ks[1]))\n`,
  `let gs: f64[] = [1.5, 2.5]\nfunction d() { gs.pop() }\nd()\nd()\nd()\nprint(gs.length)\n`,
  `type K = "a" | "b"\nfunction pick(c: i32, k: K): K | null {\n  if c > 0 { return k }\n  return null\n}\nconst ks: K[] = ["a", "b"]\nprint(pick(1, ks[0]) == "a")\n`,
  `type K = "a" | "b"\nfunction k0(): K {\n  const xs: K[] = ["a"]\n  return xs[0]\n}\nfunction pk(c: boolean): K | null {\n  if c { return null }\n  return k0()\n}\nprint(pk(false) == "a")\n`,
  `type K = "a" | "b"\nfunction ne(x: K | null): boolean { return x != null }\nconst ks: (K | null)[] = ["a", null]\nprint(ne(ks[0]))\n`,
  `type K = "a" | "b"\nfunction nf(x: K | null): boolean { return null == x }\nconst ks: (K | null)[] = ["a", null]\nprint(nf(ks[0]))\n`,
  `type K = "a" | "b"\nfunction ea(x: K | null): boolean { return x == "a" }\nconst ks: (K | null)[] = ["a", null]\nprint(ea(ks[0]))\n`,
  `let ix: {[i32]: i32} = Map()\nfunction look(k: i32): i32 { return ix[k] ?? -1 }\nix[3] = 4\nprint(look(3) + look(5))\n`,
  `let tys: {[string]: i32} = Map()\nfunction ty(s: string): i32 { return tys[s + "!"] ?? 0 }\ntys["a!"] = 2\nprint(ty("a") + ty("b"))\n`,
  `let ix: {[i32]: i32} = Map()\nfunction hop(k: i32): i32 { return ix[(ix[k] ?? 0) + 1] ?? -1 }\nix[3] = 4\nix[5] = 9\nprint(hop(3) + hop(7))\n`,
  `function ps(s: string) { print(s + "!") }\nps("a")\n`,
  `function pf(x: f64) {\n  print(-x)\n  print(x / x)\n  print(x * 1.0e300 + 2.0e300)\n}\npf(0.0)\n`,
  `function pg(x: f32) { print(x + 1.5) }\npg(2.0)\n`,
  `function pl(x: i64) { print(x * 3) }\npl(5)\n`,
  `function pb(x: i32) { print(x > 2) }\npb(3)\n`,
  `function pv(x: i32) {\n  print(x + 1)\n  return\n}\npv(3)\n`,
  `function fb(x: i64): f64 { return f64fromBits(x) }\nprint(fb(f64bits(1.5)))\n`,
  `function bf(x: f64): i64 { return f64bits(x * 2.0) }\nprint(bf(-0.0))\n`,
  `function g32(x: f32): i32 { return f32bits(x) }\nprint(g32(1.0))\n`,
  `function h32(x: i32): f32 { return f32fromBits(x) }\nprint(h32(1065353216))\n`,
  `function sq(x: f64, y: f64): f64 { return min(sqrt(x), copysign(y, -1.0)) }\nprint(sq(9.0, 2.0))\n`,
  `function fl(x: f32): f32 { return floor(x) }\nconst h: f32 = 2.5\nprint(fl(h))\n`,
  `function cz(x: i32): i32 { return clz(x) + rotl(x, 3) }\nprint(cz(16))\n`,
  `function dz(x: i64): i64 { return divU(x, 3) }\nprint(dz(-1))\n`,
  `function nm(c: boolean, s: string): string | null {\n  if c { return null }\n  return s + "!"\n}\nprint(nm(false, "a") ?? "z")\n`,
  `function id(x: string | null): string | null { return x }\nconst xs: (string | null)[] = ["a", null]\nprint(id(xs[0]) ?? "z")\n`,
  `function lc(s: string): string | null {\n  let t: string | null = null\n  if s.length > 0 { t = s }\n  return t\n}\nprint(lc("q") ?? "z")\n`,
  `function dn(x: string | null): string { return x ?? "n" }\nconst xs: (string | null)[] = [null, "a"]\nprint(dn(xs[0]) + dn(xs[1]))\n`,
  `function pd(x: string | null) { print(x ?? "n") }\nconst xs: (string | null)[] = [null, "a"]\npd(xs[0])\npd(xs[1])\n`,
  `function isn(x: string | null): boolean { return x == null }\nconst xs: (string | null)[] = [null, "a"]\nprint(isn(xs[0]))\nprint(isn(xs[1]))\n`,
  `function has(x: string | null): boolean { return x != null }\nconst xs: (string | null)[] = [null, "a"]\nprint(has(xs[0]))\nprint(has(xs[1]))\n`,
  `function hr(x: string | null): boolean { return null != x }\nconst xs: (string | null)[] = [null, "a"]\nprint(hr(xs[1]))\n`,
  `function pn(x: string | null) { print(x) }\nconst xs: (string | null)[] = [null, "a"]\npn(xs[0])\npn(xs[1])\n`,
  `function li(x: i32): i32[] { return [x, x + 1, 3] }\nconst xs = li(4)\nprint(xs[0] + xs[1] + xs[2] + xs.length)\n`,
  `function lf(x: i32, y: f64): f64[] { return [x, y] }\nconst xs = lf(2, 0.5)\nprint(xs[0] + xs[1])\n`,
  `function ll(x: i64): i64[] { return [x, x * 2] }\nconst xs = ll(5)\nprint(xs[1])\n`,
  `function lg(x: f32): f32[] { return [x] }\nconst h: f32 = 1.5\nprint(lg(h)[0])\n`,
  `function ls(s: string): string[] { return [s, s + "!"] }\nprint(ls("a")[1])\n`,
  `function lb(x: i32): boolean[] { return [x > 1, x > 5] }\nprint(lb(3)[0])\n`,
  `function le(): i32[] { return [] }\nprint(le().length)\n`,
  `function sum(xs: i32[]): i32 {\n  let t = 0\n  for x in xs {\n    print(x)\n    t = t + x\n  }\n  return t\n}\nprint(sum([1, 2, 3]))\n`,
  `function all(xs: string[]): i32 {\n  let n = 0\n  for s in xs {\n    print(s + "!")\n    n = n + s.length\n  }\n  return n\n}\nprint(all(["ab", "c"]))\n`,
  `function inner(xs: i32[]): i32 {\n  let t = 0\n  for x in xs {\n    let k = 0\n    while k < x {\n      if k > 1 { break }\n      k = k + 1\n    }\n    print(k)\n    t = t + k\n  }\n  return t\n}\nprint(inner([1, 5]))\n`,
  `function cs(s: string): i32 {\n  let n = 0\n  for c in s {\n    print(c)\n    n = n + c\n  }\n  return n\n}\nprint(cs("h\u00e9llo"))\n`,
  `function one(c: i32): string { return fromCodePoint(c) }\nprint(one(233))\n`,
  `function many(n: i32): string {\n  const xs: i32[] = [104, 233, n]\n  return fromCodePoints(xs)\n}\nprint(many(108))\n`,
  `type P = { x: i32 }\ntype Q = { y: string }\nfunction isP(u: P | Q): boolean { return u is P }\nprint(isP({ x: 1 }))\nprint(isP({ y: "a" }))\n`,
  `type Lit = { kind: "lit", v: i32 }\ntype Add = { kind: "add", l: i32, r: i32 }\nfunction isLit(e: Lit | Add): boolean { return e is Lit }\nprint(isLit({ kind: "lit", v: 1 }))\n`,
  `type P = { x: i32 }\ntype Q = { y: string }\nfunction px(u: P | Q): i32 {\n  if u is P { return u.x }\n  return 0\n}\nprint(px({ x: 4 }))\nprint(px({ y: "a" }))\n`,
  `type P = { x: i32, s: string }\ntype Q = { y: string }\nfunction ps(u: P | Q): string {\n  if u is P { return u.s }\n  return u.y\n}\nprint(ps({ x: 4, s: "p" }))\nprint(ps({ y: "q" }))\n`,
  `type P = { x: i32, y: i32 }\nfunction sum(p: P): i32 { return p.x + p.y }\nprint(sum({ x: 1, y: 2 }))\n`,
  `type P = { x: i32 }\nfunction n(ps: P[]): i32 { return ps.length }\nprint(n([{ x: 1 }, { x: 2 }]))\n`,
  `type S = { xs: i32[], name: string }\nconst s: S = { xs: [1, 2, 3], name: "s" }\nfunction cnt(): i32 { return s.xs.length }\nprint(cnt())\n`,
  `type P = { x: i32 }\ntype Q = { y: string }\nfunction viaP(u: P | Q): i32 {\n  if u is P {\n    const p: P = u\n    return p.x\n  }\n  return 0\n}\nprint(viaP({ x: 4 }))\nprint(viaP({ y: "a" }))\n`,
  `function orEmpty(s: string | null): string {\n  if s == null { return "" }\n  return s\n}\nprint(orEmpty("a"))\nprint(orEmpty(null))\n`,
  `function f(c: boolean, x: i32): i32 {\n  const y = if c { x + 1 } else { 0 }\n  return y * 2\n}\nprint(f(true, 2))\nprint(f(false, 2))\n`,
  `function w(c: boolean, x: i32): f64 {\n  const y: f64 = if c { x } else { 2.5 }\n  return y\n}\nprint(w(true, 3))\n`,
];
Deno.test({
  name: "ir shadow: each shared decision's witness is covered and matches legacy",
  ignore,
  fn: () => {
    for (const src of SHARED) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      // A helper the witness calls may be covered too; every covered function must match.
      const covered = rows.get("covered") ?? 0;
      if (covered < 1 || (rows.get("matched") ?? 0) !== covered) {
        throw new Error(`want the witness covered and matched, got ${JSON.stringify([...rows])}\n${src}`);
      }
    }
  },
});

// A code-point list that is no local is legacy's spill through a scratch slot, read once into
// it (`fcpSpillTail`): covered and matched.
Deno.test({
  name: "ir shadow: a spilled code-point list is read once into its spill slot",
  ignore,
  fn: () => {
    const src = `function sp(n: i32): string { return fromCodePoints([n, 33]) }\nprint(sp(111))\n`;
    const { rows } = run(src, true);
    if (rows.get("covered") !== 1 || rows.get("matched") !== 1) {
      throw new Error(`want the spill covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A `[]` binding its pushes follow is legacy's list reserve, built at its final size through
// locals and closed after its last push. A list literal whose elements each box into its union by
// their own record (`arrLitUnionBoxSlot`) is built at the box rep. Both are covered and matched.
Deno.test({
  name: "ir shadow: a reserved list binding and a union-element list literal are built and matched",
  ignore,
  fn: () => {
    const src = `function rv(x: i32): i32 {
  const a: i32[] = []
  a.push(x)
  return a.length
}
function ln(x: i32): (i32 | string)[] { return [x, "s"] }
print(rv(2) + ln(2).length)
`;
    const { rows } = run(src, true);
    if (rows.has("uncovered array ref")) {
      throw new Error(`want the union-element list built, got ${JSON.stringify([...rows])}`);
    }
    if (rows.get("covered") !== 2 || rows.get("matched") !== 2) {
      throw new Error(`want both functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A read off a ref list at a string-list element, and a string concat delivered as an argument:
// both functions covered and matched, along `refListGetTail` and the concat's shared tail.
Deno.test({
  name: "ir shadow: a ref list read at a non-scalar element is covered and matched",
  ignore,
  fn: () => {
    const src = `function note(s: string) {
  const xs = [[s]]
  print(xs[0][0])
}
function tw(s: string) { return note(s + "!") }
tw("a")
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 2 || rows.get("covered") !== 2) {
      throw new Error(`want both functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A nested list literal whose elements build as themselves is a plain ref list, built along
// `emitArrRef`'s shared decision and tail, and matches legacy's bytes.
Deno.test({
  name: "ir shadow: a plain nested list literal is covered and matched",
  ignore,
  fn: () => {
    const src = `function ln(x: i32): i32[][] { return [[x], [x, x]] }
print(ln(2)[1].length)
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 1 || rows.get("covered") !== 1) {
      throw new Error(`want the one function covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A short packed list literal builds along `emitArrU8`'s shared tail and matches legacy's bytes;
// an empty one returned at its destination is the self-compile's common spelling.
Deno.test({
  name: "ir shadow: a short u8 list literal is covered and matched",
  ignore,
  fn: () => {
    const src = `function e(): u8[] { return [] }
print(e().length)
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 1 || rows.get("covered") !== 1) {
      throw new Error(`want the one function covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// An append and a prepend site in a loop build their right side through `emitStrSiteCat`'s
// shared tail and match legacy's bytes.
Deno.test({
  name: "ir shadow: a string append site is covered and matched",
  ignore,
  fn: () => {
    const src = `function ap(n: i32): string {
  const xs = ["x", "y"]
  let s = "q"
  let i = 0
  while i < n {
    s = "a" + xs[0] + s
    xs[0] = xs[0] + "b" + s
    i = i + 1
  }
  return xs[0]
}
print(ap(3))
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 1 || rows.get("covered") !== 1) {
      throw new Error(`want the one function covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A `.pop()` over a number or boolean list, at a value position or as a statement, along legacy's
// scalar pop tail: the element when the checker proved it, else its null box or niche.
Deno.test({
  name: "ir shadow: a scalar list pop, value or statement, is covered and matched",
  ignore,
  fn: () => {
    const src = `function last(xs: i32[]): i32 {
  if xs.length > 0 { return xs.pop() }
  return 0
}
function opt(xs: f64[]): f64 | null { return xs.pop() }
function drop(bs: boolean[]): i32 {
  bs.pop()
  return bs.length
}
print(last([1, 2]))
print(opt([]) == null)
print(drop([true]))
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 3 || rows.get("covered") !== 3) {
      throw new Error(`want the three functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A packed byte list's element reads unsigned into an i32 along legacy's scalar read tail.
Deno.test({
  name: "ir shadow: a packed byte element read is covered and matched",
  ignore,
  fn: () => {
    const src = `function at(bs: u8[], i: i32): i32 { return bs[i] + 1 }
const bs: u8[] = [200, 7]
print(at(bs, 0))
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 1 || rows.get("covered") !== 1) {
      throw new Error(`want the one function covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A proven loop accumulator, local or module, appends its parts through `emitStrAccAppend`'s
// shared tail and matches legacy's bytes.
Deno.test({
  name: "ir shadow: a string accumulator append is covered and matched",
  ignore,
  fn: () => {
    const src = `let g = ""
function acc(xs: string[]): string {
  let s = "<"
  for x in xs { s = s + x + "," }
  return s
}
function bump(n: i32) {
  let i = 0
  while i < n {
    g = g + "g"
    i = i + 1
  }
}
bump(2)
print(acc(["p", "q"]) + g)
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 2 || rows.get("covered") !== 2) {
      throw new Error(`want both functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A `.pop()` over a record or string list, at a value position or as a statement, along legacy's
// ref pop tail: the element when the checker proved it, else the checked nullable read.
Deno.test({
  name: "ir shadow: a ref or string list pop is covered and matched",
  ignore,
  fn: () => {
    const src = `type P = { x: i32 }
function a(ps: P[]): i32 {
  if ps.length > 0 {
    const p = ps.pop()
    return p.x
  }
  return -1
}
function b(ss: string[]): i32 {
  ss.pop()
  return ss.length
}
print(a([{ x: 3 }]))
print(b(["p", "q"]))
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 2 || rows.get("covered") !== 2) {
      throw new Error(`want both functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// `print` of a value-union box, plain or nullable, dispatches on its tag along legacy's union
// print tail, the stash slot taken before the box is written as legacy takes it.
Deno.test({
  name: "ir shadow: a print of a value-union box is covered and matched",
  ignore,
  fn: () => {
    const src = `function show(u: i32 | string) { print(u) }
function opt(u: i32 | null) { print(u) }
show(3)
opt(null)
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 2 || rows.get("covered") !== 2) {
      throw new Error(`want both functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A `??` over a boxed operand along each arm the IR builds (a binding at a scalar or a box result,
// a list element, a call at a scalar or a box result) and a nested `??` in a default: each default
// is built into the null arm, so it runs only there, and every function matches legacy's bytes.
Deno.test({
  name: "ir shadow: a boxed coalesce on each built arm is covered and matched",
  ignore,
  fn: () => {
    const src = `let calls = 0
function d(): i32 {
  calls = calls + 1
  return 7
}
function db(): i32 | null {
  calls = calls + 1
  return 9
}
function mk(n: i32): i32 | null {
  if n > 0 { return n }
  return null
}
function valScalar(x: i32 | null): i32 { return x ?? d() }
function valBox(x: i32 | null): i32 | null { return x ?? db() }
function elem(xs: (i32 | null)[], i: i32): i32 { return xs[i] ?? d() }
function callScalar(n: i32): i32 { return mk(n) ?? d() }
function callBox(n: i32): i32 | null { return mk(n) ?? db() }
function nested(x: i32 | null, y: i32 | null): i32 { return x ?? (y ?? d()) }
print(valScalar(null) + elem([null], 0) + callScalar(0) + nested(null, null))
print(valBox(null) ?? 0)
print(callBox(0) ?? 0)
print(calls)
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    const miss = [...rows.keys()].filter((k) => k.includes("coalesce"));
    if (miss.length > 0) throw new Error(`want no coalesce miss, got ${JSON.stringify([...rows])}`);
    if (!(rows.get("matched")! >= 9) || rows.get("matched") !== rows.get("covered")) {
      throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A `??` whose left operand an instance closed to a type with no `null` writes the left operand.
Deno.test({
  name: "ir shadow: a closed coalesce is covered and matched",
  ignore,
  fn: () => {
    const src = `function orD<T>(x: T, d: T): T { return x ?? d }
print(orD(3, 4))
`;
    const { rows } = run(src, true);
    if ((rows.get("matched") ?? 0) < 1 || rows.get("matched") !== rows.get("covered")) {
      throw new Error(`want the instance covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A `.push` onto a packed `u8` list takes its value as a plain i32, which the backing truncates,
// as a packed list literal's elements do.
Deno.test({
  name: "ir shadow: a push of an i32 onto a u8 list is covered and matched",
  ignore,
  fn: () => {
    const src = `function put(out: u8[], b: i32) { out.push(b) }
function put2(out: u8[], b: i32) { out.push(b & 255) }
const bs: u8[] = []
put(bs, 300)
put2(bs, 7)
print(bs.length)
print(bs[0])
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (!(rows.get("matched")! >= 2) || rows.get("matched") !== rows.get("covered")) {
      throw new Error(`want both pushes covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A `.push` onto a literal-union, `(boolean | null)`, `(string | null)` or union-box list, and of a
// narrowed arm onto its own record list, delivers the value at the element rep as legacy writes it.
Deno.test({
  name: "ir shadow: a push onto each element arm legacy writes as itself is covered and matched",
  ignore,
  fn: () => {
    const src = `type Dir = "n" | "s"
type Sq = { k: "sq", w: i32 }
type Ci = { k: "ci", r: i32 }
type Sh = Sq | Ci
function lit(xs: Dir[], d: Dir) { xs.push(d) }
function nb(xs: (boolean | null)[], b: boolean | null) { xs.push(b) }
function ns(xs: (string | null)[], s: string | null) { xs.push(s) }
function bx(xs: (i32 | string)[], v: i32) { xs.push(v) }
function arm(xs: Sq[], s: Sh) { if s is Sq { xs.push(s) } }
const a: Dir[] = []
lit(a, "s")
const b: (boolean | null)[] = []
nb(b, null)
const c: (string | null)[] = []
ns(c, "x")
const u: (i32 | string)[] = []
bx(u, 4)
const q: Sq[] = []
arm(q, { k: "sq", w: 3 })
print(q.length)
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 5 || rows.get("covered") !== 5) {
      throw new Error(`want all five pushes covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A `.push` of a short-circuit value onto a list held in its own local reads the receiver by index
// after the value, as legacy does; a staged receiver (a global) is staged by its own
// `RListStage` ahead of the value. All three are covered.
Deno.test({
  name: "ir shadow: a short-circuit push onto a held or a staged list is covered",
  ignore,
  fn: () => {
    const src = `let xs: boolean[] = []
function a(out: boolean[], p: boolean, q: boolean) { out.push(p && q) }
function b(out: boolean[], p: boolean, q: boolean, r: boolean) { out.push(p && (q || r)) }
function c(p: boolean, q: boolean) { xs.push(p && q) }
const o: boolean[] = []
a(o, true, false)
b(o, true, false, true)
c(true, true)
print(o.length + xs.length)
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 3 || rows.get("covered") !== 3) {
      throw new Error(`want the held and staged pushes covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A short-circuit arm that reassigns the held receiver: both sides read the local after the value,
// so the push lands on the list the arm assigned, and the IR matches legacy's bytes.
Deno.test({
  name: "ir shadow: a held push whose value reassigns the receiver reads it after the value",
  ignore,
  fn: () => {
    const src = `function h(p: boolean): i32 {
  let xs: boolean[] = []
  const other: boolean[] = []
  xs.push(p && (xs = other).length == 0)
  return xs.length * 10 + other.length
}
print(h(true))
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 1 || rows.get("covered") !== 1) {
      throw new Error(`want the function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A fused `xs.pop() ?? d` on a held, a staged (global), a staged (field) and an f64 receiver, with
// a variable default, and a default that reassigns the receiver: legacy's shared open, then its
// default in the empty arm, every function matching legacy's bytes.
Deno.test({
  name: "ir shadow: a fused pop with a default is covered and matched",
  ignore,
  fn: () => {
    const src = `let g: i32[] = [1, 2]
function a(xs: i32[]): i32 { return xs.pop() ?? -1 }
function b(): i32 { return g.pop() ?? 0 }
function c(xs: f64[]): f64 { return xs.pop() ?? 0.5 }
function d(xs: i32[], k: i32): i32 { return xs.pop() ?? k }
type Box = { xs: i32[] }
function f(o: Box): i32 { return o.xs.pop() ?? 0 }
function e(p: i32): i32 {
  let xs: i32[] = []
  const other: i32[] = [7, 8, 9]
  const v = xs.pop() ?? (xs = other).length
  return v * 10 + xs.length
}
print(a([3]) + b() + d([], 6) + e(1) + f({ xs: [4] }))
print(c([]))
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 6 || rows.get("covered") !== 6) {
      throw new Error(`want all six covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// `l ?? d` over a nullable reference along legacy's `br_on_non_null` block: a record with a name
// default and with a nullable one, a call default that runs only on `null` (`calls` prints 1), a
// union arm's variant, and a nullable list: every function covered and matching legacy's bytes.
Deno.test({
  name: "ir shadow: a nullable reference's coalesce is covered and matched",
  ignore,
  fn: () => {
    const src = `type S = { a: i32 }
type C = { k: "c", r: i32 }
type Q = { k: "q", s: i32 }
type U = C | Q
let calls = 0
function mk(): S {
  calls = calls + 1
  return { a: 9 }
}
function s2(x: S | null, d: S): S { return x ?? d }
function n1(x: S | null, d: S | null): S | null { return x ?? d }
function e1(x: S | null): S { return x ?? mk() }
function v1(x: C | null, d: C): C { return x ?? d }
function l1(xs: i32[] | null, d: i32[]): i32[] { return xs ?? d }
const u: U = { k: "q", s: 1 }
const one: S = { a: 1 }
print(s2(null, one).a + s2({ a: 2 }, one).a)
print(n1(null, null) == null)
print(e1({ a: 3 }).a + e1(null).a)
print(calls)
print(v1(null, { k: "c", r: 4 }).r)
print(l1(null, [5, 6]).length)
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 6 || rows.get("covered") !== 6) {
      throw new Error(`want all six covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// An element store into a packed `u8` list takes its value as a plain i32, which the backing
// truncates (300 reads back as 44), as a push onto one does.
Deno.test({
  name: "ir shadow: an i32 stored into a u8 list element is covered and matched",
  ignore,
  fn: () => {
    const src = `function set(out: u8[], i: i32, v: i32) { out[i] = v }
function setMasked(out: u8[], i: i32, v: i32) { out[i] = v & 255 }
const bs: u8[] = [0, 0]
set(bs, 0, 300)
setMasked(bs, 1, 7)
print(bs[0])
print(bs[1])
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (!(rows.get("matched")! >= 2) || rows.get("matched") !== rows.get("covered")) {
      throw new Error(`want both stores covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A field store whose value is a short-circuit (a valued `if`): legacy reads the receiver, then
// the value. A local, a parameter, a global and a call result as the receiver are each staged
// below the `if`, and every store function is covered and matches legacy's bytes.
Deno.test({
  name: "ir shadow: a field store of a short-circuit value is covered and matched",
  ignore,
  fn: () => {
    const src = `type R = { a: boolean, n: i32 }
let g: R = { a: false, n: 0 }
const box: R[] = [{ a: false, n: 0 }]
function get(): R { return box[0] }
function loc(p: boolean, q: boolean): boolean {
  const r: R = { a: false, n: 0 }
  r.a = p && q
  return r.a
}
function par(r: R, p: boolean, q: boolean): boolean {
  r.a = p || q
  return r.a
}
function glob(p: boolean, q: boolean): boolean {
  g.a = p && q
  return g.a
}
function tmp(p: boolean, q: boolean): boolean {
  get().a = p || q
  return box[0].a
}
function coal(r: R, x: i32 | null): i32 {
  r.n = if x != null { x } else { 7 }
  return r.n
}
print(loc(true, true))
print(par({ a: false, n: 0 }, false, true))
print(glob(true, false))
print(tmp(false, false))
print(coal({ a: false, n: 0 }, null) + coal({ a: false, n: 0 }, 2))
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    // `coal`'s `x != null` over `i32 | null` is a union box's null tag test.
    if (rows.get("matched") !== 6 || rows.get("covered") !== 6) {
      throw new Error(`want all six covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// `l ?? d` whose default joins a nullable union arm into the union's box (legacy's staged `if`):
// a name and a call operand (the call default runs once: `calls` prints 1), and a join nested in
// the default, which re-stages the shared `?.` slot only on the outer null path. Each `??` function
// is covered and matches legacy's bytes; `show` and the start are other classes.
Deno.test({
  name: "ir shadow: a nullable reference joined into a union box is covered and matched",
  ignore,
  fn: () => {
    const src = `type C = { k: "c", r: i32 }
type Q = { k: "q", s: i32 }
type U = C | Q
let calls = 0
function mkq(): Q {
  calls = calls + 1
  return { k: "q", s: 7 }
}
function getc(b: boolean): C | null {
  if b { return { k: "c", r: 3 } }
  return null
}
function name(x: C | null, d: Q): U { return x ?? d }
function call(b: boolean): U { return getc(b) ?? mkq() }
function nested(x: C | null, y: C | null, d: Q): U { return x ?? (y ?? d) }
function show(u: U): i32 {
  if u is C { return u.r }
  return u.s * 10
}
const q: Q = { k: "q", s: 5 }
print(show(name(null, q)) + show(name({ k: "c", r: 2 }, q)))
print(show(call(true)) + show(call(false)))
print(calls)
print(show(nested(null, null, q)) + show(nested(null, { k: "c", r: 4 }, q)) + show(nested({ k: "c", r: 1 }, null, q)))
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (!((rows.get("covered") ?? 0) >= 4) || rows.get("matched") !== rows.get("covered")) {
      throw new Error(`want the four coalescing functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// `n is A` over a local `U | null` box, a valued `if` joining an arm with `null`: the same box
// legacy tests by its tag, `null` one more tag, read raw past the narrowing. Covered and matched.
Deno.test({
  name: "ir shadow: an is test over a local nullable union box is covered and matched",
  ignore,
  fn: () => {
    const src = `type A = { k: "a", v: i32 }
type B = { k: "b", w: i32 }
type U = A | B
const us: U[] = [{ k: "a", v: 3 }, { k: "b", w: 4 }]
function at(i: i32): U { return us[i] }
function f(x: i32): i32 {
  const n = if x >= 0 && x < us.length { at(x) } else { null }
  if !(n is A) && !(n is B) { return -1 }
  if n is A { return n.v }
  return 0
}
print(f(0) + f(1) + f(9))
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 2 || rows.get("covered") !== 2) {
      throw new Error(`want both functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A walk's own `break` and `continue` branch to the frames legacy's loop opens, and a walk whose
// body is hoist-safe reads its header once and may unroll its body: all covered and matched.
Deno.test({
  name: "ir shadow: a walk's own branch and a hoisted walk are matched",
  ignore,
  fn: () => {
    const src = `function fb(xs: i32[]): i32 {
  for x in xs {
    print(x)
    if x > 1 { break }
  }
  return 0
}
function fc(xs: i32[]): i32 {
  for x in xs {
    if x > 1 { continue }
    print(x)
  }
  return 0
}
function fh(xs: i32[]): i32 {
  let t = 0
  for x in xs { t = t + x }
  return t
}
print(fb([1, 2, 3]) + fc([1, 2]) + fh([4]))
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 3 || rows.get("covered") !== 3) {
      throw new Error(`want the three walks covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// An integer `abs` is legacy's staged `select` (`intSelTail`), not one instruction: the IR writes
// the same tail after its operand, so the function is covered and matches.
Deno.test({
  name: "ir shadow: an integer abs is covered by the shared select tail and matches",
  ignore,
  fn: () => {
    const { rows } = run(`function ab(x: i32): i32 { return abs(x) }\nprint(ab(-4))\n`, true);
    const want = "matched";
    if (rows.get(want) !== 1) throw new Error(`want one "${want}" row, got ${JSON.stringify([...rows])}`);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// Legacy writes a short-circuit argument's `if` in place, above the arguments before it, whether
// they are locals, globals or temps: the lowering stages each earlier one below the `if`, in order,
// so each function lowers and matches. `re` reads `n` before a condition that writes it.
Deno.test({
  name: "ir shadow: a short-circuit argument after another is staged below its `if` and matches",
  ignore,
  fn: () => {
    const src = `let g: i32[] = [1]
function pair(a: i32, b: boolean): i32 { return if b { a } else { 0 - a } }
function h(a: i32[], b: boolean): i32 { return a.length + pair(1, b) }
function k(a: i32, c: boolean, d: boolean): i32 {
  const r = pair(a, c && d)
  return r
}
function f(x: boolean, y: boolean): i32 { return h(g, x || y) }
function f2(x: boolean, y: boolean): i32 { return h([1], x && y) }
let n = 1
function bump(): boolean {
  n = n + 1
  return true
}
function re(q: boolean): i32 { return pair(n, bump() && q) }
print(k(2, true, false) + f(true, false) + f2(false, true) + re(true))
`;
    const { rows } = run(src, true);
    const miss = "uncovered short-circuit argument after another";
    if (rows.has(miss)) throw new Error(`want no "${miss}" row, got ${JSON.stringify([...rows])}`);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (!(rows.get("fns")! >= 7) || rows.get("matched") !== rows.get("fns")) {
      throw new Error(`want every function matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// Every node that writes a receiver or an earlier operand before a later one names a valued `if`
// in that later operand; one in the first operand written stays covered, and an intrinsic's
// earlier argument, an operator's left operand, or an element store's receiver and index, is
// staged below the `if` (`intr`, `bin`, `eq`, `st`), so only `stIx`'s `if` in the index is a
// store miss.
Deno.test({
  name: "ir shadow: a short-circuit operand below a node's lead is a named miss, not a fallback",
  ignore,
  fn: () => {
    const src = `let m: Map<i32, boolean> = Map()
let g: boolean[] = [true]
function st(a: boolean, b: boolean, x: i32): boolean {
  const xs: boolean[] = [false, false]
  xs[x] = a && b
  return xs[x]
}
function stIx(a: boolean, x: i32): i32 {
  const xs: i32[] = [0, 0]
  xs[if a { 0 } else { 1 }] = x
  return xs[0]
}
function bin(a: boolean, x: i32): i32 { return x + (if a { 1 } else { 2 }) }
function eq(a: boolean, b: boolean): boolean { return a == (b || a) }
function meth(a: boolean, s: string): string { return s.slice(0, if a { 1 } else { 2 }) }
function intr(a: boolean, x: f64): f64 { return max(x, if a { 1.0 } else { 2.0 }) }
function push(a: boolean, b: boolean): i32 {
  g.push(a && b)
  return g.length
}
function first(a: boolean, b: boolean, x: i32): i32 { return (if a && b { 1 } else { 2 }) + x }
m[1] = st(true, true, 0) || stIx(true, 5) > 0
print(bin(true, 1) + push(true, false) + first(true, true, 3))
print(eq(true, false))
print(meth(true, "hello"))
print(intr(true, 0.5))
`;
    const { rows } = run(src, true);
    const want: [string, number][] = [
      ["uncovered store short-circuit operand", 1],
    ];
    for (const [k, n] of want) {
      if (rows.get(k) !== n) throw new Error(`want ${n} "${k}" rows, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.has("uncovered method short-circuit operand")) {
      throw new Error(`want \`meth\` staged, got ${JSON.stringify([...rows])}`);
    }
    if (rows.has("uncovered short-circuit argument after another")) {
      throw new Error(`want \`intr\` staged, got ${JSON.stringify([...rows])}`);
    }
    if (rows.has("uncovered short-circuit right operand")) {
      throw new Error(`want \`bin\` and \`eq\` staged, got ${JSON.stringify([...rows])}`);
    }
    if (!(rows.get("matched")! >= 4)) throw new Error(`want \`first\`, \`intr\`, \`bin\` and \`eq\` matched, got ${JSON.stringify([...rows])}`);
    // The start's map store stages its global receiver and key below the value's `if`.
    if (rows.get("start matched") !== 1) throw new Error(`want the start's map store matched, got ${JSON.stringify([...rows])}`);
  },
});

// An instance's `is` test over a box: a tag the box holds is compared off the raw slot, even
// narrowed, and a tag it lacks is a decided guard whose then arm is not written. Elsewhere the
// decided constant is `false` with the receiver unread, as legacy writes it.
Deno.test({
  name: "ir shadow: an instance's arm-tag and decided `is` guards build, and a decided test elsewhere",
  ignore,
  fn: () => {
    const src = `function kind<T>(v: T): string {
  if v is i32 { return "i32" }
  if v is f32 { return "f32" }
  if v is f64 { return "f64" }
  return "other"
}
function neg<T>(v: T): boolean { return !(v is i32) }
function run(q: f32 | f64) {
  print(kind(q))
  print(neg(q))
}
run(1.5 as f32)
run(2.5)
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 3 || rows.get("covered") !== 3) {
      throw new Error(`want kind, neg and run covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A record literal on legacy's layout path builds field by field and matches, a widened `f64`
// field included; a box handed to a box field whose union retags a member (`i32` to `f64`) builds
// as the box and its retag (`RCoerce`).
Deno.test({
  name: "ir shadow: a record literal builds, a widened field too, and a box retagged into a wider union",
  ignore,
  fn: () => {
    const src = `type P = { x: i32, y: string }
type Q = { w: f64 }
type D = { v: f64 | string }
function mk(a: i32, s: string): P { return { x: a + 1, y: s } }
function mkq(a: i32): Q { return { w: a } }
function mkd(u: i32 | string): D { return { v: u } }
const p = mk(2, "k")
print(p.x)
print(p.y)
print(mkq(3).w)
const d = mkd(4)
if d.v is f64 { print(d.v) }
`;
    const { rows } = run(src, true);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("matched") !== 3 || rows.get("covered") !== 3) {
      throw new Error(`want mk, mkq and mkd covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A block body's last statement is a statement: `f(-1)` runs past `put(9)` and returns `null`
// (prints 5). The IR once returned `put(9)`'s value there; it now builds `put(9)` as a statement
// and falls into the lowering's `null` pad, matching legacy.
Deno.test({
  name: "ir shadow: a block body that runs past its last statement pads its null and matches",
  ignore,
  fn: () => {
    const src = `function put(x: i32) { return x * 2 }
function f(b: i32) {
  if b >= 0 { return 0 }
  put(9)
}
print(f(-1) ?? 5)
`;
    const { rows } = run(src, true);
    if (rows.has("uncovered block body falls off")) {
      throw new Error(`want no falls-off miss, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (rows.get("covered") !== 2 || rows.get("matched") !== 2) {
      throw new Error(`want put and f covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// Only a `null` literal boxes with its value unread. A `null`-typed call has an effect that must
// run once, so it is the box's payload (`RNulNoneBox`, legacy's ladder's first rung), and the
// function returning it boxed builds and matches.
Deno.test({
  name: "ir shadow: a null-typed call delivered into a box is its payload, never left unread",
  ignore,
  fn: () => {
    const src = `function mk(): null {
  print("effect")
  return null
}
function f(b: boolean): i32 | null {
  if b { return 1 }
  return mk()
}
print(f(false) ?? 5)
`;
    const { rows } = run(src, true);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want mk and f covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// An unannotated parameter's type stays open until a call instances it. One holding a function
// set's i32 id builds at that rep; the builder never hands the verifier an open-typed variable.
Deno.test({
  name: "ir shadow: an open-typed parameter at a function set's id builds, never a verifier failure",
  ignore,
  fn: () => {
    const src = `function k<T>(x: T): T { return x }
function fw(f) { return f }
function main() {
  const o = fw(k)
  print(o(6))
  print(o("s"))
}
main()
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    const covered = rows.get("covered") ?? 0;
    if (rows.get("fns") !== covered || (rows.get("matched") ?? 0) !== covered) {
      throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// The claim path (`irClaimFn`): mode 3 claims every I1 family, so legacy does not run for a
// covered function and the lowering's code entry ships. The output must be byte-identical.
Deno.test({
  name: "ir claim: claiming every I1 family ships the same bytes legacy does",
  ignore,
  fn: () => {
    const claimed = run(COVERED, 3);
    if (claimed.rc !== 0) throw new Error(`want compileSrc rc 0, got ${claimed.rc}`);
    const n = claimed.rows.get("claimed") ?? 0;
    // sq, wide, pos, sum, pick and bump are each claimable.
    if (n < 6) throw new Error(`want at least 6 claimed, got ${JSON.stringify([...claimed.rows])}`);
    const fell = [...claimed.rows.keys()].filter((k) => k.startsWith("claim fell back"));
    if (fell.length > 0) throw new Error(`want no claim to fall back, got ${fell.join(", ")}`);
    const plain = run(COVERED, false);
    if (plain.out.length !== claimed.out.length || plain.out.some((b, i) => b !== claimed.out[i])) {
      throw new Error(`want byte-identical output claimed and not (${plain.out.length} vs ${claimed.out.length} bytes)`);
    }
  },
});

// The shipped claim (`CLAIMED`, report-only mode 5): a covered function ships the IR's bytes, which
// match legacy's (armed, legacy always runs); a verifier failure on the claim path falls back to
// legacy and is counted, which the gate's `ir claims` row reds on.
Deno.test({
  name: "ir claim: the shipped claim emits legacy's bytes, and a broken claim falls back loudly",
  ignore,
  fn: () => {
    const shipped = run(COVERED, 5);
    if (shipped.rc !== 0) throw new Error(`want compileSrc rc 0, got ${shipped.rc}`);
    const n = shipped.rows.get("claimed") ?? 0;
    if (n < 6) throw new Error(`want at least 6 claimed, got ${JSON.stringify([...shipped.rows])}`);
    const fell = [...shipped.rows.keys()].filter((k) => k.startsWith("claim fell back"));
    if (fell.length > 0) throw new Error(`want no claim to fall back, got ${fell.join(", ")}`);
    const legacy = run(COVERED, 1);
    if (legacy.out.length !== shipped.out.length || legacy.out.some((b, i) => b !== shipped.out[i])) {
      throw new Error(`want the shipped claim byte-identical to legacy (${legacy.out.length} vs ${shipped.out.length} bytes)`);
    }
    const broken = run(COVERED, 5, 1);
    if ((broken.rows.get("claim fell back: verifier") ?? 0) < 1) {
      throw new Error(`want a verifier fallback under the control, got ${JSON.stringify([...broken.rows])}`);
    }
    if (broken.out.length !== legacy.out.length || broken.out.some((b, i) => b !== legacy.out[i])) {
      throw new Error(`want a fallen-back claim to ship legacy's bytes`);
    }
  },
});

// The verifier's own cases (`compiler/ir_selftest.vl`): hand-built IR breaking each of rules
// 1-7 is refused under that rule, as are a fall-through and a mismatched global store, and the
// unbroken function holds.
Deno.test({
  name: "ir shadow: each hand-built case fails the rule it breaks, and the control holds",
  ignore,
  fn: () => {
    const exp = new WebAssembly.Instance(compiled!, {})
      .exports as unknown as Exports;
    // Any compile initialises the checker's primitives the cases are typed at.
    exp.modReset();
    exp.srcReset();
    for (const ch of "print(1)\n") exp.srcPush(ch.codePointAt(0)!);
    if (exp.compileSrc() !== 0) throw new Error("want the priming compile to pass");
    // Each case's id and the rule the verifier must name for it (0: the function holds). Rules 1
    // to 7 each have the case named for them; the rest break rule 2 (a store, an effectful
    // immediate, a pop, map read, shared read, niche read, unbox, numeric conversion, result pick,
    // retag or `??` of the wrong operand or out, a stashed record's order, a held global read off
    // its rep), rule 5 (a fall-through, an out left unwritten), rule 8 (a bounds check with the
    // bounds rule uninstalled) or rule 10 (a valued block outside a helper whose out is a temp).
    const want: Record<string, number> = {
      "holds": 0,
      "var-rep-outside-tree": 1,
      "compare-into-i32": 2,
      "var-rep-not-its-type": 3,
      "read-before-definition": 4,
      "branch-to-unenclosed-label": 5,
      "call-arity": 6,
      "switch-over-i32": 7,
      "if-falls-off-end": 5,
      "i32-into-bool-global": 2,
      "bounds-rule-uninstalled": 8,
      "box-immediate-for-call": 2,
      "box-at-union-type-into-i32": 2,
      "if-at-box-writes-i32": 2,
      "if-at-box-arm-delivers-i32": 2,
      "nul-none-box-of-i32": 2,
      "pop-or-of-i32": 2,
      "pop-or-bool-out": 2,
      "pop-or-out-unwritten": 5,
      "list-get-or-holds": 0,
      "list-get-or-record-list": 2,
      "record-field-read-twice": 2,
      "stored-read-of-i32-field": 2,
      "stored-read-of-boxed-nullable-field": 0,
      "field-read-at-receiver-type-kid": 2,
      "field-read-at-operand-row-kid": 0,
      "map-read-probe-of-i32": 2,
      "map-read-on-pop-arm": 2,
      "map-read-out-unwritten": 5,
      "shared-read-of-temp": 2,
      "map-read-mv-into-wrong-out": 2,
      "null-none-into-bool-niche": 2,
      "null-none-into-ref-niche": 0,
      "nul-ref-of-i32": 2,
      "nul-ref-of-non-null-list": 2,
      "nul-ref-list-into-i32": 2,
      "shared-read-global-not-box": 2,
      "niche-read-of-i32": 2,
      "arm-unbox-of-i32": 2,
      "record-arms-unbox-at-its-record": 0,
      "record-arms-unbox-at-another-record": 2,
      "asg-arm-unbox-at-its-record": 0,
      "asg-arm-unbox-without-dest": 2,
      "led-box-follows-its-dispatch": 0,
      "led-box-past-a-node": 10,
      "box-list-retag-into-i32-list": 2,
      "list-of-lists-retag-into-nullable-lists": 0,
      "list-of-lists-retag-into-other-lists": 2,
      "box-list-retag-into-niche-record-list": 2,
      "num-union-conversion-of-non-box": 2,
      "num-union-conversion-off-result-kind": 2,
      "held-global-read-off-noted-rep": 2,
      "null-into-nullable-record-global": 0,
      "null-into-bool-niche-global": 2,
      "record-into-its-niche-global": 0,
      "other-record-into-niche-global": 2,
      "result-pick-of-i32": 2,
      "result-pick-record-into-i32": 2,
      "record-retag-of-i32": 2,
      "record-retag-into-i32": 2,
      "record-retag-field-other-valtype": 2,
      "record-retag-two-noted-heaps": 2,
      "record-retag-one-noted-heap": 0,
      "value-retag-built-heap": 0,
      "value-retag-other-heap": 2,
      "value-retag-field-other-valtype": 2,
      "width-retag-noted-leading": 0,
      "width-retag-field-not-leading": 2,
      "width-retag-pair-unnoted": 2,
      "hand-pick-of-i32": 2,
      "hand-pick-record-into-i32": 2,
      "holder-pick-of-i32": 2,
      "holder-pick-record-into-i32": 2,
      "holder-pick-record-into-closure": 0,
      "eq-helper-of-records": 0,
      "eq-helper-of-i32": 2,
      "eq-helper-into-bool": 2,
      "rep-typed-thunk-forwards": 0,
      "rep-typed-thunk-forwards-env": 1,
      "rep-typed-result-not-thunk": 1,
      "init-progress-as-value": 2,
      "init-progress-effect": 0,
      "literal-cast-of-record": 2,
      "literal-cast-of-i32": 0,
      "hole-opt-box-of-record": 2,
      "hole-opt-box-of-i32": 0,
      "retag-closures-of-differing-arity": 2,
      "retag-closures-of-differing-arity-noted": 0,
      "map-delete-of-map": 0,
      "map-delete-of-i32": 2,
      "retag-field-alike-records-two-heaps": 2,
      "push-many-of-i32": 2,
      "global-read-off-store-type": 2,
      "return-not-stored-alike": 2,
      "return-stored-alike": 0,
      "return-stored-unlike": 2,
      "niche-return-not-stored-alike": 2,
      "niche-return-stored-alike": 0,
      "valued-block-temp-out": 10,
      "atom-sole-into-i32": 2,
      "atom-tower-i32-read": 2,
      "atom-tower-zero-reads": 2,
      "atom-staged-of-i32": 2,
      "map-get-boxed-scalar-into-bool": 2,
      "map-get-atom-niche-narrowed": 0,
      "map-get-atom-niche-into-string": 2,
      "field-coalesce-of-i32-receiver": 2,
      "bool-join-coalesce-of-i32": 2,
      "trunc-sat-operand-off-plan": 2,
      "atomic-value-off-plan": 2,
      "memory-store-value-off-plan": 2,
      "simd-operand-off-plan": 2,
      "call-write-back-not-a-capture": 2,
      "coal-str-default-off-rep": 2,
      "coal-atom-str-default-off-rep": 2,
      "atom-decode-nullable-into-string": 2,
      "atom-decode-nullable-into-nullable-string": 0,
      "nullable-records-compared-nullable": 0,
      "plain-records-compared-nullable": 2,
      "captured-atom-param-decoded-at-string": 0,
      "captured-atom-param-typed-as-string": 3,
      "get-of-list": 0,
      "get-index-of-string": 2,
      "bytes-into-i32-list": 2,
      "bytes-of-i32": 2,
      "opt-read-of-i32": 2,
      "dead-return-after-returning-call": 5,
      "pop-or-default-returning-call": 5,
      "pop-or-default-never-call": 0,
      "dead-return-after-never-call": 0,
      "never-call-value-at-consumer-rep": 0,
      "dead-never-temp-at-consumer-rep": 0,
      "dead-never-bound-to-non-temp": 3,
      "identity-eq-of-records": 0,
      "identity-eq-of-string": 2,
      "identity-eq-of-i32": 2,
      "returning-call-temp-typed-never": 3,
      "never-call-value-into-bool": 2,
      "print-open-pair": 0,
      "print-open-unclosed": 10,
      "print-opened-unopened": 10,
      "print-open-arm-mismatch": 10,
      "print-open-left-by-return": 10,
      "union-cast-of-box": 0,
      "union-cast-of-boxed-nullable": 0,
      "union-cast-of-niche-nullable": 2,
      "union-cast-of-i32": 2,
      "never-closure-call-value-at-consumer-rep": 0,
      "returning-closure-call-temp-typed-never": 3,
      "never-field-read-at-its-storage": 0,
      "never-field-read-off-its-storage": 3,
      "str-field-read-at-its-storage": 0,
      "str-field-read-typed-as-atom": 3,
      "str-field-read-into-atom-decode": 2,
      "nulbool-field-read-at-its-boolean": 0,
      "nulbool-field-read-at-i32": 2,
      "nulbool-field-read-at-string": 2,
      "walk-pair-map-value-record": 0,
      "walk-pair-map-value-off-type": 3,
      "walk-pair-string-index": 0,
      "walk-pair-string-index-of-bool": 2,
      "walk-map-value-record": 0,
      "walk-map-value-off-rep": 2,
      "walk-map-key-i32": 0,
      "walk-map-key-off-rep": 2,
      "walk-map-key-i64": 0,
      "walk-map-key-width-mismatch": 2,
      "walk-map-key-record": 2,
      "map-scalar-join-of-i32": 0,
      "map-scalar-join-of-string": 2,
      "map-scalar-box-of-i32": 0,
      "map-scalar-box-into-union-box": 2,
      "asg-unwiden-wrap-of-i64": 0,
      "asg-unwiden-trunc-of-i64": 2,
      "asg-unwiden-non-null-of-nullable-record": 0,
      "asg-unwiden-non-null-of-record": 2,
      "map-print-of-i32": 0,
      "map-print-of-string": 2,
      "after-effects-at-value-rep": 0,
      "after-effects-off-value-rep": 2,
      "null-of-plain": 0,
      "null-of-place-with-read": 0,
      "null-of-read-off-place": 2,
      "null-of-place-without-read": 2,
      "spread-boxed-at-box-list": 0,
      "spread-boxed-at-scalar-list": 2,
    };
    const ids: string[] = [];
    for (let i = 0; i < exp.irSelfTestIdCount(); i++) {
      const b: number[] = [];
      for (let j = 0; j < exp.irSelfTestIdLen(i); j++) b.push(exp.irSelfTestIdAt(i, j));
      ids.push(String.fromCodePoint(...b));
    }
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length > 0) throw new Error(`want unique case ids, got duplicates ${dup.join(", ")}`);
    const unlisted = Object.keys(want).filter((id) => !ids.includes(id));
    if (unlisted.length > 0) throw new Error(`want every expected case listed, missing ${unlisted.join(", ")}`);
    for (let i = 0; i < ids.length; i++) {
      if (!(ids[i] in want)) throw new Error(`case ${ids[i]}: want an expected rule, got none`);
      const got = exp.irVerifySelfTest(i);
      if (got !== want[ids[i]]) throw new Error(`case ${ids[i]}: want rule ${want[ids[i]]}, got rule ${got}`);
    }
    // Rule 8 pairs a check and a read of one string-literal node, never two of equal text.
    if (exp.irBoundsStrSelfTest(0) !== 1) throw new Error("want one literal node to pair");
    if (exp.irBoundsStrSelfTest(1) !== 0) throw new Error("want two literal nodes refused");
    // An arm unbox routes on its `uaAsg` flag, never on its read's node kind: a record arms unbox over an
    // assignment node still takes the record arms cast.
    if (exp.irArmUnboxRouteSelfTest(0) !== 1) throw new Error("want a record arms unbox over an assignment node routed recordArms");
    if (exp.irArmUnboxRouteSelfTest(1) !== 1) throw new Error("want an uaAsg unbox routed asg");
    if (exp.irArmUnboxRouteSelfTest(2) !== 1) throw new Error("want an unbox naming no destination routed arm");
    // A staged root reads above a run of roots on the stack, never above a value that is no root
    // (`rootsFloor`, D17089): the floor cannot hide a real order violation.
    for (const [k, want, what] of [[0, 1, "above a run of roots"], [1, 0, "above a non-root"], [2, 0, "above a non-root over a root"]] as const) {
      const got = exp.irStageFloorSelfTest(k);
      if (got !== want) throw new Error(`stage floor ${what}: want ${want}, got ${got}`);
    }
    // A door fragment lowered while a root is staged gives the staging's root run back.
    if (exp.irRootRunFrameSelfTest() !== 1) throw new Error("want the fragment frame to restore the root run");
    // A fit tail that misses leaves legacy's receiver read in place (`fitRecvReadHook`).
    if (exp.irFitTailSelfTest() !== 1) throw new Error("want the fit hook restored after a miss");
    // Each kind legacy's descriptor names alone maps to a type that describes back at that kind.
    const rd = exp.repDescSelfTest();
    if (rd !== 0) throw new Error(`want every descriptor kind to round-trip, got kind ${rd} off`);
    // The map niche's kind lies above every box tag a list niche reads as its kind.
    const nk = exp.nicheKindSelfTest();
    if (nk !== 0) throw new Error(`want NICHE_NUL_MAP above every niche kind, got kind ${nk} at or above it`);
  },
});


// The blocker census (mode 4): a function's build goes on past a missed statement, so its row names
// every class it missed, sorted into one key; a covered function reads `blockers none`.
Deno.test({
  name: "ir shadow: the blocker census names every class a function missed, and moves no byte",
  ignore,
  fn: () => {
    const src = `type J = { a: i32 }
type P = { j: J, k: i32 }
type Q = { j: null, k: i32 }
function mk(b: boolean): P | Q {
  return if b { { j: { a: 3 }, k: 1 } } else { { j: null, k: 2 } }
}
const g = mk(true)
function ok(x: i32): i32 { return x + 1 }
function two(k: i32): i32 {
  const xs = [1, 2]
  xs[if k > 0 { 0 } else { 1 }] = k
  return xs[0] + k
}
print(ok(1))
print(two(3))
`;
    const census = run(src, 4);
    if (census.rc !== 0) throw new Error(`want compileSrc rc 0, got ${census.rc}`);
    const want = "blockers store short-circuit operand";
    if ((census.rows.get(want) ?? 0) !== 1) {
      throw new Error(`want one row ${want}, got ${JSON.stringify([...census.rows])}`);
    }
    if ((census.rows.get("blockers none") ?? 0) !== 2) {
      throw new Error(`want two covered functions (ok, mk), got ${JSON.stringify([...census.rows])}`);
    }
    const plain = run(src, false);
    if (plain.out.length !== census.out.length || plain.out.some((b, i) => b !== census.out[i])) {
      throw new Error(`want byte-identical output under the census (${plain.out.length} vs ${census.out.length} bytes)`);
    }
  },
});

// A start the census builds on past a miss is uncovered at that class, as the armed shadow reports
// it, never covered and lowered with the miss inside it.
Deno.test({
  name: "ir shadow: the blocker census names a start's classes instead of lowering past them",
  ignore,
  fn: () => {
    const src = `type J = { f: i32 | null }
function mk2() { return { f: null } }
const dA: J = mk2()
let xs = [mk2()]
xs.push(mk2())
print(xs[1].f)
print(dA.f ?? 1)
`;
    const armed = run(src, true);
    const census = run(src, 4);
    const starts = (rows: Map<string, number>) => [...rows.keys()].filter((k) => k.startsWith("start uncovered"));
    const want = starts(armed.rows);
    if (want.length !== 1) throw new Error(`want one armed start miss, got ${JSON.stringify([...armed.rows])}`);
    if (JSON.stringify(starts(census.rows)) !== JSON.stringify(want)) {
      throw new Error(`want the census's start rows ${JSON.stringify(want)}, got ${JSON.stringify([...census.rows])}`);
    }
    if (census.rows.has("start covered")) throw new Error(`want no covered start, got ${JSON.stringify([...census.rows])}`);
  },
});

// A join of an atom binding whose arms are a literal-bound const and a one-literal const, which the
// atom hook writes at the destination (`emitIfExprAs`): covered and matched.
Deno.test({
  name: "ir shadow: a join the atom hook writes at its destination is built and matched",
  ignore,
  fn: () => {
    const src = `const JX = "x"\nconst B: "y" = "y"\nfunction join(c: boolean) {\n  const M: "x" | "y" | "z" = if c { JX } else { B }\n  return M == "z"\n}\nprint(join(true))\n`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.get("covered") !== 1 || rows.get("matched") !== 1) {
      throw new Error(`want the join covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A function-tag leaf is its member's id (`fnTagLeafEmitted`), which the IR builds as an i32
// immediate: no node misses at the leaf, and every function built matches legacy's bytes.
const TAG_LEAF =
  `function inc0(a) { return a + 1 }\nfunction dbl(a) { return a * 2 }\nfunction half(a) { return a / 2.0 }\nfunction pick(b: boolean) { if b { return [inc0] } return [dbl] }\nprint(pick(true)[0](3))\nprint(pick(false)[0](3))\n`;
Deno.test({
  name: "ir shadow: a function-tag leaf builds as its member's id and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(TAG_LEAF, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.has("uncovered pre-path tag leaf")) {
      throw new Error(`want no tag-leaf miss, got ${JSON.stringify([...rows])}`);
    }
    const covered = rows.get("covered") ?? 0;
    if (covered === 0 || (rows.get("matched") ?? 0) !== covered) {
      throw new Error(`want every covered function matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A call through a function set dispatches on the stashed id (`tagIsTail`) over its arms: several
// arms at i32, f64, bool and string results, and one arm, whose call legacy never tail-calls.
const TAG_DISPATCH = `let f = inc0
f = dbl
print(w(f, 3))
print(w(f, 3.5))
let fi = idg
fi = kg
print(w(fi, 2.5))
print(w(fi, true))
let fg = idg
fg = idh
print(fg(3))
print(app(fg, "s"))
function inc0(a) { return a + 1 }
function dbl(a) { return a * 2 }
function w(h, x) { return h(x) }
function idg<T>(t: T): T { return t }
function kg<T>(t: T): T { return t }
function idh<T>(t: T): T { return t }
function app(g, v) { return g(v) }
`;
Deno.test({
  name: "ir shadow: a call through a function set builds as its dispatch and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(TAG_DISPATCH, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.has("uncovered pre-path tag dispatch")) {
      throw new Error(`want no tag-dispatch pre-path miss, got ${JSON.stringify([...rows])}`);
    }
    const covered = rows.get("covered") ?? 0;
    if (covered < 15 || (rows.get("matched") ?? 0) !== covered) {
      throw new Error(`want 15 or more covered, every one matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A record whose field holds a generic function is typed open, but legacy holds the function as
// its tagged set's id, so the record's rep is closed (`irTyHeldOpen`): the local builds and every
// covered function matches. The program is distilled cell d15117_fw_alias_one_f64_str_ab_fn_bound.
const OPEN_CONTAINER = `function id0(a) { return a }
function id1(a) { return a }
function run() {
  const r = { f: id0 }
  const q = r
  q.f = id0
  const g = r.f
  print(g(2.5))
  print(g("s"))
}
run()
`;
Deno.test({
  name: "ir shadow: a record of a tagged set's function is held open and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(OPEN_CONTAINER, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.has("uncovered open local type")) {
      throw new Error(`want no open-local miss, got ${JSON.stringify([...rows])}`);
    }
    const covered = rows.get("covered") ?? 0;
    if (covered === 0 || rows.get("fns") !== covered || (rows.get("matched") ?? 0) !== covered) {
      throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A generic function used as a value inside a returned record is typed at its open function type,
// but legacy writes the member's id there as an `i32.const`: the leaf builds at `i32` and every
// function matches. The program is distilled cell d15119_fw_ret_two_fn.
const TAG_LEAF_OPEN = `function id0(a) { return a }
function id1(a) { return a }
function mk() { return { f: id1 } }
function run() {
  const r = mk()
  r.f = id0
  const g = r.f
  print(g(2))
  print(g(2.5))
}
run()
`;
Deno.test({
  name: "ir shadow: a tag leaf at an open function type builds at the set's id and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(TAG_LEAF_OPEN, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.has("uncovered tag leaf rep")) {
      throw new Error(`want no tag-leaf-rep miss, got ${JSON.stringify([...rows])}`);
    }
    const covered = rows.get("covered") ?? 0;
    if (covered === 0 || rows.get("fns") !== covered || (rows.get("matched") ?? 0) !== covered) {
      throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A list delivery whose copy owes nothing past the value (`listCopyOwesNothing`) is the value as
// built, so the builder takes it as a plain node: no coercion miss, and every covered function
// matches legacy's bytes. The program is distilled cell b004880.
const LIST_COPY_NONE = `function mkc(): {r: i32 | null}[][] {
  const lv1 = [{ r: 7 }]
  const cc = []
  return cc
}
function rd() {
  const c = mkc()
  const g0 = c
  if g0.length > 0 {
    const g1 = g0[0]
    if g1.length > 0 {
      if (g1[0]).r != null { print(7) } else { print(0) }
    } else { print(0) }
  } else { print(0) }
}
rd()
`;
Deno.test({
  name: "ir shadow: a list copy that owes nothing builds as its value and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(LIST_COPY_NONE, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.has("uncovered pre-path coercion")) {
      throw new Error(`want no coercion pre-path miss, got ${JSON.stringify([...rows])}`);
    }
    const covered = rows.get("covered") ?? 0;
    if (covered === 0 || (rows.get("matched") ?? 0) !== covered) {
      throw new Error(`want every covered function matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// The start body under the shadow (stage 1, S1a): a top-level statement, a global's plain
// initializer and a promoted global each build and match legacy's entry, counted under `start `
// rows, a top-level string accumulator among them; a widened initializer is a named miss.
const START_MATCHED = [
  `let s = ""\nlet i = 0\nwhile i < 3 {\n  s = s + "x"\n  i = i + 1\n}\nprint(s)\n`,
  `let i = 0\nwhile i < 3 { i = i + 1 }\nprint(i)\n`,
  `function sq(x: i32): i32 { return x * x }\nconst k = sq(3)\nprint(k + 1)\n`,
  `let n = 2\nn = n + 3\nprint(n)\n`,
];
Deno.test({
  name: "ir shadow: a start body inside the set is covered and matches legacy",
  ignore,
  fn: () => {
    for (const src of START_MATCHED) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      if ((rows.get("start covered") ?? 0) !== 1 || (rows.get("start matched") ?? 0) !== 1) {
        throw new Error(`want the start covered and matched, got ${JSON.stringify([...rows])}\n${src}`);
      }
      if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    }
  },
});
Deno.test({
  name: "ir shadow: a start widening an initializer to its cell covers and matches",
  ignore,
  fn: () => {
    const { rows } = run(`const w: f64 = 3\nprint(w)\n`, true);
    if (rows.get("start covered") !== 1 || rows.get("start matched") !== 1) {
      throw new Error(`want the start covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// The start body's claim (`irClaimStart`, family `start`, stage 1 S1b): a start inside the set is
// claimed and ships legacy's bytes; under the verifier control the claim falls back to legacy,
// loudly. A start appending to a top-level string accumulator is claimed and ships legacy's bytes.
const START_CLAIMED = `function note(s: string, v: i32): i32 {
  print(s)
  return v
}
const a = note("a", 1)
let n = 2
while n < 5 { n = n + a }
print(n)
`;
Deno.test({
  name: "ir claim: a start body inside the set is claimed and ships legacy's bytes",
  ignore,
  fn: () => {
    const shipped = run(START_CLAIMED, 5);
    if (shipped.rc !== 0) throw new Error(`want compileSrc rc 0, got ${shipped.rc}`);
    if ((shipped.rows.get("claimed start") ?? 0) !== 1) {
      throw new Error(`want the start claimed, got ${JSON.stringify([...shipped.rows])}`);
    }
    const fell = [...shipped.rows.keys()].filter((k) => k.startsWith("claim fell back"));
    if (fell.length > 0) throw new Error(`want no claim to fall back, got ${fell.join(", ")}`);
    const legacy = run(START_CLAIMED, 1);
    if (legacy.out.length !== shipped.out.length || legacy.out.some((b, i) => b !== shipped.out[i])) {
      throw new Error(`want the claimed start byte-identical to legacy (${legacy.out.length} vs ${shipped.out.length} bytes)`);
    }
    const broken = run(START_CLAIMED, 5, 1);
    if ((broken.rows.get("claim fell back: verifier") ?? 0) < 1) {
      throw new Error(`want a verifier fallback under the control, got ${JSON.stringify([...broken.rows])}`);
    }
    if (broken.out.length !== legacy.out.length || broken.out.some((b, i) => b !== legacy.out[i])) {
      throw new Error(`want a fallen-back start claim to ship legacy's bytes`);
    }
    const accSrc = `let s = ""\nlet i = 0\nwhile i < 3 {\n  s = s + "x"\n  i = i + 1\n}\nprint(s)\n`;
    const acc = run(accSrc, 5);
    const accLegacy = run(accSrc, 1);
    if (!acc.rows.has("claimed start")) {
      throw new Error(`want a start owing the string accumulator claimed, got ${JSON.stringify([...acc.rows])}`);
    }
    if (acc.out.length !== accLegacy.out.length || acc.out.some((b, i) => b !== accLegacy.out[i])) {
      throw new Error(`want the claimed accumulator start byte-identical to legacy`);
    }
  },
});

// A value `if` and a returned `if` whose condition is an `is` tag test: legacy writes the test
// and both arms as they are, so each function builds and matches legacy's bytes.
const IS_COND_IF =
  `function f(v: i32 | string): i32 {\n  const w = if v is i32 { 1 } else { 2 }\n  return w + 1\n}\nfunction g(v: i32 | string): i32 {\n  return if v is string { 3 } else { 4 }\n}\nprint(f(5))\nprint(f("x"))\nprint(g(5))\nprint(g("x"))\n`;
Deno.test({
  name: "ir shadow: an if on an is condition, valued or returned, builds and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(IS_COND_IF, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want both functions covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A value `if` joined at a string or a list builds under legacy's ref blocktype and matches; one
// that is a later operand of a string `+` stages the earlier operand below it, and matches too.
const REF_IF =
  `function s(b: boolean, x: string, y: string): string {\n  const r = if b { x } else { y }\n  return r\n}\nfunction t(b: boolean, x: string): string {\n  return x + (if b { x } else { "no" })\n}\nfunction l(b: boolean, xs: i32[], ys: i32[]): i32 {\n  const r = if b { xs } else { ys }\n  return r.length\n}\nprint(s(true, "a", "b"))\nprint(s(false, "a", "b"))\nprint(t(false, "a"))\nprint(l(true, [1, 2], [3]))\n`;
Deno.test({
  name: "ir shadow: a value if joined at a string or a list builds and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(REF_IF, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 3 || (rows.get("matched") ?? 0) !== 3) {
      throw new Error(`want s, t and l covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (rows.has("uncovered string operand after another")) {
      throw new Error(`want t's earlier operand staged, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A union binding whose `if` initializer legacy writes into a seeded box, one arm at a time,
// builds and matches, a nullable union binding included, and so does one legacy writes through
// its binding sink (every arm a construction).
const LET_IF_BOX =
  `function f(b: boolean, v: i32 | string, w: i32 | string): boolean {\n  const u = if b { v } else { w }\n  return u is i32\n}\nfunction g(b: boolean, v: i32 | string): boolean {\n  const u: i32 | string | null = if b { v }\n  return u is i32\n}\nfunction s(b: boolean): boolean {\n  const u: i32 | string = if b { 1 } else { "x" }\n  return u is i32\n}\nprint(f(true, 1, "y"))\nprint(g(false, 1))\nprint(s(true))\n`;
Deno.test({
  name: "ir shadow: a union binding's if initializer builds into a seeded box and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(LET_IF_BOX, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 3 || (rows.get("matched") ?? 0) !== 3) {
      throw new Error(`want f, g and s covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A valued `if` whose arms run statements before their value, a direct `else if` chain and a
// literal `true` whose dead `else` legacy writes as `unreachable` all build and match.
const IF_ARM_PRELUDE =
  `function c3(a: i32): i32 {\n  const r = if a < 0 { 1 } else if a == 0 { 2 } else { 3 }\n  return r\n}\nfunction p2(a: i32): i32 {\n  const r = if a < 0 {\n    const t = a * 2\n    t + 1\n  } else {\n    a\n  }\n  return r\n}\nfunction t1(a: i32): i32 {\n  const r = if true { a + 1 } else { 0 }\n  return r\n}\nprint(c3(-1))\nprint(c3(0))\nprint(p2(-3))\nprint(t1(4))\n`;
Deno.test({
  name: "ir shadow: an if expression's arm prelude, else-if chain and literal true build and match",
  ignore,
  fn: () => {
    const { rc, rows } = run(IF_ARM_PRELUDE, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 3 || (rows.get("matched") ?? 0) !== 3) {
      throw new Error(`want c3, p2 and t1 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A literal `true`'s dead `else` binds a local, and a local declared after the `if` is read: the
// `STrap` arm must keep the slots legacy's dead arm keeps, so the function matches or misses.
const IF_DEAD_ELSE_LOCAL =
  `function d1(a: i32): i32 {\n  const r = if true {\n    const y = a + 1\n    y * 2\n  } else {\n    const z = a * 3\n    z\n  }\n  const w = r + a\n  return w\n}\nprint(d1(4))\n`;
Deno.test({
  name: "ir shadow: a literal true's dead else binding a local keeps a later local's slot",
  ignore,
  fn: () => {
    const { rc, rows } = run(IF_DEAD_ELSE_LOCAL, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 1 || (rows.get("matched") ?? 0) !== 1) {
      throw new Error(`want d1 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A map read's default that computes is a body the probe's miss arm writes: a call, a nested
// read, and the narrowing rewrite's `if true` default, with a key that is itself a temp.
const MAP_DEFAULT_BODY =
  `let m: {[string]: i32} = Map()\nfunction g(k: string): i32 { return k.length }\nfunction f(k: string): i32 { return m[k] ?? g(k) }\nfunction n2(k: string, j: string): i32 { return m[k] ?? (m[j] ?? 7) }\nfunction h(k: string): i32 {\n  const hit = m[k]\n  if hit is i32 { return hit }\n  return 0\n}\nfunction h2(s: string, a: i32, b: i32): i32 {\n  const hit = m[s.slice(a, b)]\n  if hit is i32 { return hit }\n  return 0\n}\nm["a"] = 1\nprint(f("a"))\nprint(f("bcd"))\nprint(n2("x", "a"))\nprint(h("q"))\nprint(h2("xa", 1, 2))\n`;
Deno.test({
  name: "ir shadow: a map read's computing default builds as its miss arm's body and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(MAP_DEFAULT_BODY, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 5 || (rows.get("matched") ?? 0) !== 5) {
      throw new Error(`want g, f, n2, h and h2 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A returned value `if` whose result bears a `null` pads its `end` with the function's own null,
// returned (`emitNullForRet`): a record and a string result build and match legacy.
const RET_IF_NULL_PAD =
  `type P = { v: i32 }\nfunction f(c: boolean, p: P): P | null {\n  return if c { p } else { null }\n}\nfunction g(n: i32): string | null {\n  return if n > 0 { "pos" } else if n < 0 { "neg" } else { null }\n}\nconst p: P = { v: 4 }\nconst a = f(true, p)\nif a != null { print(a.v) }\nprint(g(0) ?? "z")\n`;
Deno.test({
  name: "ir shadow: a returned value if's null pad returns the function's own null and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(RET_IF_NULL_PAD, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want f and g covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A union-returning function that took the return sink and falls off its end into a `null` exits
// that `null` through the sink as any return there does (`emitFallThroughPad`), and matches.
const SINK_NULL_FALLTHROUGH =
  `function pk2(c: boolean, a: i32): i32 | string | null {\n  if c {\n    if a > 0 { return a } else { return "neg" }\n  } else {\n    return null\n  }\n}\nconst z = pk2(true, -1)\nif z is string { print(z) }\nprint(pk2(false, 1) == null)\n`;
Deno.test({
  name: "ir shadow: a null fall-through in a return-sink function exits through the sink and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(SINK_NULL_FALLTHROUGH, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 1 || (rows.get("matched") ?? 0) !== 1) {
      throw new Error(`want pk2 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// An else-less tail `if` writes no `else`, its fall-through padded by the caller: a returned
// `if` with no `else` and a chain ending in one, each at a nullable result, build and match.
const ELSE_LESS_TAIL_IF =
  `type P = { v: i32 }\nfunction f(c: boolean, p: P): P | null {\n  return if c { p }\n}\nfunction g(n: i32): string | null {\n  return if n > 0 { "pos" } else if n < 0 { "neg" }\n}\nconst p: P = { v: 4 }\nconst a = f(true, p)\nif a != null { print(a.v) }\nprint(g(0) ?? "z")\n`;
Deno.test({
  name: "ir shadow: an else-less tail if writes no else and its caller pads the fall-through",
  ignore,
  fn: () => {
    const { rc, rows } = run(ELSE_LESS_TAIL_IF, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want f and g covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A reference join's `else if` chain is built link by link into each link's `else`, at the head's
// rep: a string chain and a list chain build and match legacy.
const REF_IF_CHAIN =
  `function s3(n: i32, a: string): string {\n  const r = if n > 0 { a } else if n < 0 { "neg" } else { "zero" }\n  return r\n}\nfunction l3(n: i32, xs: i32[]): i32[] {\n  const r = if n > 1 { xs } else if n == 1 { [1] } else { [] }\n  return r\n}\nprint(s3(-1, "pos"))\nprint(l3(1, []).length)\n`;
Deno.test({
  name: "ir shadow: a reference join's else-if chain builds link by link and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(REF_IF_CHAIN, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want s3 and l3 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A returned value `if` in a function taking the union return sink builds one return per arm,
// each arm's box written to the sink pair: an `i32 | string` and an `i32 | boolean` result match.
const UNION_SINK_RET =
  `function u2(n: i32): i32 | string {\n  return if n > 0 { n } else { "neg" }\n}\nfunction u4(n: i32): i32 | boolean {\n  return if n > 0 { n } else { false }\n}\nprint(u2(3))\nprint(u4(-3))\n`;
Deno.test({
  name: "ir shadow: a returned value if under the union return sink builds per-arm returns and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(UNION_SINK_RET, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want u2 and u4 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A returned `if` under the sink that adapts to one wider number with a literal arm is built at
// that number and boxed once (`retIfIsOneNumber`); here its literal arm at the instance's `i64`
// is a named miss (`widen instLit`), never a per-arm build.
const UNION_SINK_ONE_NUMBER =
  `function lit<A, B>(k: i32, a: A, b: B) {\n  if k == 0 { return a }\n  return if k == 1 { b } else { 5 }\n}\nconst z: i64 = 9\nprint(lit(2, z, z) + 1)\n`;
Deno.test({
  name: "ir shadow: a returned if boxed once as one wider number under the sink, its instance literal arm built at that width",
  ignore,
  fn: () => {
    const { rc, rows } = run(UNION_SINK_ONE_NUMBER, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 1 || (rows.get("matched") ?? 0) !== 1) {
      throw new Error(`want lit covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// The statement spelling of an else-less chain of returns falls through to the body's own tail.
const RET_CHAIN_ELSELESS =
  `function c3(n: i32, a: string): string {\n  if n > 0 { return a } else if n < 0 { return "neg" }\n  return "zero"\n}\nprint(c3(0, "p"))\nprint(c3(-1, "p"))\n`;
Deno.test({
  name: "ir shadow: an else-less chain of statement returns builds and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(RET_CHAIN_ELSELESS, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 1 || (rows.get("matched") ?? 0) !== 1) {
      throw new Error(`want c3 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A value `if` joined at an atom (a literal union, or one nullable at the `-1` niche) is an `i32`
// `if`, each arm its atom: a plain, a nullable and an `else if` chain join build and match.
const ATOM_JOIN =
  `type Op = "add" | "sub" | "mul"\nfunction a1(n: i32, d: Op, e: Op): Op {\n  const o: Op = if n > 0 { d } else { e }\n  return o\n}\nfunction a2(n: i32, d: Op): Op | null {\n  const o: Op | null = if n > 0 { d } else { null }\n  return o\n}\nfunction a3(n: i32, d: Op): Op {\n  const o: Op = if n > 0 { d } else if n < 0 { "mul" } else { d }\n  return o\n}\nprint(a1(1, "add", "sub"))\nprint(a2(0, "add") ?? "none")\nprint(a3(-1, "sub"))\n`;
Deno.test({
  name: "ir shadow: a value if joined at an atom builds as an i32 if and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(ATOM_JOIN, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 3 || (rows.get("matched") ?? 0) !== 3) {
      throw new Error(`want a1, a2 and a3 covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A packed `u8[]` literal builds its elements as plain i32s, which its backing truncates: the
// verifier admits them at a `u8` element rep, and the door's fragment matches legacy's bytes.
Deno.test({
  name: "ir shadow: a packed list literal's i32 elements verify at its u8 element rep",
  ignore,
  fn: () => {
    const { rows } = run(`const lit: u8[] | i32 = [1, 2, 255]
if lit is u8[] { print(lit[2]) }
`, true);
    const bad = [...rows.keys()].filter((k) => k.startsWith("node-in") && (k.includes("verifier") || k.includes("differ")));
    if (bad.length > 0 || (rows.get("node-in array: matched") ?? 0) < 1) {
      throw new Error(`want the packed literal matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A nullable union (`A | B | null`, discipline 4) is held in the value union's box, so a field
// read off it once `is A` narrows it is a narrowed box read that builds and matches.
const NUL_UNION_FIELD =
  `type A = { kind: "a", x: i32 }\ntype B = { kind: "b", y: i32 }\nfunction r(u: A | B | null): i32 {\n  if u is A { return u.x }\n  return 0\n}\nconst a: A | B | null = { kind: "a", x: 7 }\nconst n: A | B | null = null\nprint(r(a))\nprint(r(n))\n`;
Deno.test({
  name: "ir shadow: a narrowed field read off a nullable union's box builds and matches legacy",
  ignore,
  fn: () => {
    const { rc, rows } = run(NUL_UNION_FIELD, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 1 || (rows.get("matched") ?? 0) !== 1) {
      throw new Error(`want r covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A literal-union list's elements are its interned atoms, which the IR delivers itself: the
// literal takes the short build and its fragment matches legacy's bytes.
Deno.test({
  name: "ir shadow: a literal-union list literal builds at the short tail and matches",
  ignore,
  fn: () => {
    const { rows } = run(`function pick(i: i32): string {
  const xs: ("a" | "b")[] = ["a", "b", "a"]
  return xs[i]
}
print(pick(1))
`, true);
    const bad = [...rows.keys()].filter((k) => k.startsWith("node-in") && !k.endsWith("matched"));
    if (bad.length > 0 || (rows.get("node-in array: matched") ?? 0) < 1) {
      throw new Error(`want the atom list literal matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// Two spread literals in one function, a one-group `[...a]` and a many-group one, each built along
// the shared spread plan into its own recorded slots: both functions are covered and matched.
Deno.test({
  name: "ir shadow: a one-group spread matches beside a many-group one",
  ignore,
  fn: () => {
    const { rc, rows } = run(`function f(a: i32[], b: i32[]): i32 {
  const x = [...a]
  const y = [...a, 1, ...b]
  return x.length + y.length
}
function g(a: i32[]): i32 {
  const x = [...a]
  return x.length
}
print(f([1, 2], [3]) + g([4]))
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want f and g covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A push whose value is a short-circuit (a valued `if`): legacy stages a non-local receiver, then
// writes the value. A global, a field and an index receiver, at statement and value position, are
// staged by their own `RListStage` ahead of the `if`, covered and matched. A push whose value
// pushes (D1280's late receiver) and one in a later call argument stay legacy's, by name.
Deno.test({
  name: "ir shadow: a push of a short-circuit value stages its receiver ahead of the if",
  ignore,
  fn: () => {
    const src = `type Box = { bs: boolean[] }
let gb: boolean[] = []
let gn: i32[] = []
let gm: i32[] = []
function two(a: i32, b: i32): i32 { return a * 10 + b }
function glob(a: boolean, c: boolean) {
  gb.push(a && c)
}
function field(x: Box, a: boolean, c: boolean) {
  x.bs.push(c || a)
}
function index(rs: boolean[][], a: boolean, c: boolean): i32 {
  return rs[0].push(a && c)
}
function nest() {
  gn.push(gm.push(4))
}
function arg(a: boolean, c: boolean) {
  print(two(7, gb.push(a || c)))
}
const x: Box = { bs: [] }
const rs: boolean[][] = [[]]
glob(true, false)
field(x, false, true)
print(index(rs, true, true))
nest()
arg(false, false)
print(gb[0])
print(x.bs[0])
print(gn[0])
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.get("matched") !== 5 || rows.get("covered") !== 5) {
      throw new Error(`want two, glob, field, index, nest covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (rows.get("uncovered short-circuit argument after another") !== 1) {
      throw new Error(`want arg left to legacy by name, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A list literal walked by `for` is built as any literal is, its constant form read off its module
// list, and the walk around it is the IR's: each function is covered and matched.
Deno.test({
  name: "ir shadow: a for walk over a list literal is covered and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(`function consts(): i32 {
  let s = 0
  for x in [1, 2, 3] { s = s + x }
  return s
}
function vars(n: i32): i32 {
  let s = 0
  for x in [n, n * 2, 3] { s = s + x }
  return s
}
function strs(): string {
  let r = ""
  for t in ["a", "b"] { r = r + t }
  return r
}
print(consts() + vars(3))
print(strs())
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 3 || (rows.get("matched") ?? 0) !== 3) {
      throw new Error(`want the three walks covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// The walk around an empty literal, a literal of records, one literal walked twice, one inside
// another walk, and each generic instance's walk of f64 elements are covered and matched.
Deno.test({
  name: "ir shadow: list-literal walks of each shape match, an f64 walk included",
  ignore,
  fn: () => {
    const { rc, rows } = run(`function empty(): i32 {
  let s = 0
  for y in [] { s = s + 1 }
  return s
}
function recs(): i32 {
  let s = 0
  for p in [{ a: 1 }, { a: 2 }] { s = s + p.a }
  return s
}
function twice(): i32 {
  let s = 0
  for x in [1, 2] { s = s + x }
  for x in [1, 2] { s = s + x }
  return s
}
function nested(): i32 {
  let s = 0
  for x in [1, 2] {
    for y in [10, 20] { s = s + x * y }
  }
  return s
}
function gen<T>(_v: T): i32 {
  let n = 0
  for x in [1.5] { n = n + 1 }
  return n
}
print(empty() + recs() + twice() + nested() + gen(1) + gen("s"))
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 6 || (rows.get("matched") ?? 0) !== 6) {
      throw new Error(`want the six walks covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// An `__array_new__` inside another's fill is written inside the outer's fill bracket, so it takes
// the stash of depth one as legacy's does: matched byte for byte, with a constant and a computed
// inner length. A fill boxed into a union element stays a named miss.
Deno.test({
  name: "ir shadow: a nested __array_new__ fill matches at legacy's fill depth, and a boxed fill at its union",
  ignore,
  fn: () => {
    const { rc, rows } = run(`function sq(n: i32): i32[][] { return __array_new__(n, __array_new__(n, 0)) }
function wide(n: i32, m: i32): i32[][] { return __array_new__(n, __array_new__(m + 1, m * 2)) }
function deep(n: i32): i32[][][] { return __array_new__(n, __array_new__(n, __array_new__(n + 1, 7))) }
function un(n: i32): (i32 | string)[] { return __array_new__(n, 5) }
const a = sq(2)
const b = wide(2, 3)
const c = deep(2)
const d = un(2)
const d0 = d[0]
print(a[1].length + b[1][3] + b[0].length + c[1][1][2])
if d0 is i32 { print(d0) }
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 4 || (rows.get("matched") ?? 0) !== 4) {
      throw new Error(`want sq, wide, deep and un (its fill boxed) covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A map walk over a receiver that is no global builds the receiver as its operand, written where
// legacy's stash writes it: a local, a parameter, a field read, a call (run once), nested walks
// over two maps, a body writing another map, and a narrowed nullable parameter. Every function is
// covered and matched.
Deno.test({
  name: "ir shadow: a map walk over a non-global receiver is covered and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(`type O = { m: {[string]: i32} }
let calls = 0
function mk(): {[string]: i32} {
  calls = calls + 1
  const m: {[string]: i32} = Map()
  m["a"] = 1
  m["b"] = 2
  return m
}
function local(): i32 {
  const m: {[string]: i32} = Map()
  m["x"] = 3
  m["y"] = 4
  let s = 0
  for k in m.keys() { s = s + (m[k] ?? 0) }
  return s
}
function param(m: {[string]: i32}): i32 {
  let s = 0
  for v in m.values() { s = s + v }
  return s
}
function field(o: O): i32 {
  let n = 0
  for k in o.m.keys() { n = n + k.length }
  return n
}
function call(): i32 {
  let s = 0
  for v in mk().values() { s = s + v }
  return s + calls * 100
}
function nested(a: {[string]: i32}, b: {[string]: i32}): i32 {
  let s = 0
  for x in a.values() {
    for y in b.values() { s = s + x * y }
  }
  return s
}
function mutates(a: {[string]: i32}): i32 {
  const other: {[string]: i32} = Map()
  let n = 0
  for k in a.keys() {
    other[k] = n
    n = n + 1
  }
  return n + other.length
}
function nullable(m: {[string]: i32} | null): i32 {
  let s = 0
  if m != null {
    for v in m.values() { s = s + v }
  }
  return s
}
const g: {[string]: i32} = Map()
g["p"] = 5
print(local())
print(param(g))
print(field({ m: g }))
print(call())
print(nested(g, mk()))
print(mutates(mk()))
print(nullable(g))
print(nullable(null))
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 8 || (rows.get("matched") ?? 0) !== 8) {
      throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A map store whose value is a short-circuit (a valued `if`): legacy writes the receiver and key,
// then the value. A global receiver (staged as its read), a local and a parameter, with a
// variable, a call-result or a literal key, are staged below the `if`, covered and matched; so are
// values that run a map op of the same or of another shape, and a boxed binding's `??`, whose tag
// test the staged leads sit below (`coalArmStagesLeads`).
Deno.test({
  name: "ir shadow: a map store of a short-circuit value stages its receiver and key below the if",
  ignore,
  fn: () => {
    const src = `let gb: {[string]: boolean} = Map()
let gn: {[string]: boolean} = Map()
let gq: {[string]: i32} = Map()
let gi: {[string]: i32} = Map()
function key(s: string): string { return s }
function glob(a: boolean, c: boolean, k: string) { gb[k] = a && c }
function loc(a: boolean, c: boolean, k: string): boolean {
  const m: {[string]: boolean} = Map()
  m[key(k)] = c || a
  return m[k] ?? false
}
function par(m: {[string]: boolean}, a: boolean, k: string) { m[k] = gn.has(k) && a }
function other(a: boolean, k: string) { gb[k] = gq.has(k) || a }
function boxed(p: i32 | null, k: string) { gi[k] = p ?? 7 }
function lit(a: boolean, c: boolean) { gb["x"] = a && c }
gn["k"] = true
gq["q"] = 1
glob(true, true, "k")
print(loc(false, true, "k"))
par(gb, true, "p")
other(false, "q")
boxed(null, "k")
lit(true, false)
print(gb["k"] ?? false)
print(gb["p"] ?? false)
print(gb["q"] ?? false)
print(gi["k"] ?? 0)
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if (rows.get("matched") !== 7 || rows.get("covered") !== 7) {
      throw new Error(`want key, glob, loc, par, other, boxed and lit covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// `__array_copy__` is written as legacy's arm writes it: each list operand followed by its backing,
// then the copy. An i32, a string, an f64 and a record list each match byte for byte.
Deno.test({
  name: "ir shadow: an __array_copy__ statement matches over each list kind",
  ignore,
  fn: () => {
    const { rc, rows } = run(`function grow(xs: i32[], n: i32): i32[] {
  const out: i32[] = __array_new__(n, 0)
  __array_copy__(out, 0, xs, 0, xs.length)
  return out
}
function tail(xs: string[], from: i32): string[] {
  const out: string[] = __array_new__(xs.length - from, "")
  __array_copy__(out, 0, xs, from, xs.length - from)
  return out
}
function fl(xs: f64[]): f64[] {
  const out: f64[] = __array_new__(xs.length * 2, 0.0)
  __array_copy__(out, xs.length, xs, 0, xs.length)
  return out
}
type P = { x: i32 }
function rs(xs: P[]): P[] {
  const out: P[] = __array_new__(xs.length, { x: 0 })
  __array_copy__(out, 0, xs, 0, xs.length)
  return out
}
print(grow([1, 2, 3], 5)[2] + rs([{ x: 4 }, { x: 5 }])[1].x)
print(tail(["a", "b", "c"], 1)[1])
print(fl([1.5, 2.5])[3])
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 4 || (rows.get("matched") ?? 0) !== 4) {
      throw new Error(`want all four covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// `__array_copy__`'s operands are each written in place at its use, between the backing reads:
// computed offsets and counts, a call as the count and a call as the source list all match.
Deno.test({
  name: "ir shadow: an __array_copy__ over computed and called operands matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(`function cnt(n: i32): i32 { return n - 1 }
function pick(xs: i32[]): i32[] { return xs }
function comp(d: i32[], s: i32[], i: i32, j: i32, n: i32) { __array_copy__(d, i + 1, s, j * 2, n - 1) }
function callCount(d: i32[], s: i32[], n: i32) { __array_copy__(d, 0, s, 0, cnt(n)) }
function callSrc(d: i32[], s: i32[], n: i32) { __array_copy__(d, 0, pick(s), 0, n) }
function mixed(d: i32[], s: i32[], i: i32, n: i32) {
  __array_copy__(d, i + i * 2, pick(s), cnt(i) + 1, cnt(n))
}
const d: i32[] = __array_new__(8, 0)
const s = [1, 2, 3, 4, 5, 6]
comp(d, s, 0, 1, 3)
callCount(d, s, 3)
callSrc(d, s, 2)
mixed(d, s, 1, 3)
print(d[0] + d[3])
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 6 || (rows.get("matched") ?? 0) !== 6) {
      throw new Error(`want all six covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A valued `match` lowers to an if chain whose later links the checker never types: every link
// takes the head's rep, as legacy writes every link at the head's kind, and a lowered `is` or
// wildcard test is boolean. A literal-union chain, a type-pattern chain, a wildcard arm and two
// widening chains are each covered and matched.
Deno.test({
  name: "ir shadow: a valued match chain's links take the head's rep and match",
  ignore,
  fn: () => {
    const { rc, rows } = run(`type A = { a: i32 }
type B = { b: i32 }
type C = { c: i32 }
type U = A | B | C
type Op = "add" | "sub" | "neg" | "divide"
function linkKind(op: Op, n: i32): boolean {
  const ok = match op {
    "add" | "sub" => true
    "neg" => false
    "divide" => n > 3
  }
  return ok
}
function isArm(u: U): i32 {
  const v = match u {
    A => u.a
    B => u.b * 2
    C => u.c * 3
  }
  return v
}
function wildArm(u: U): i32 {
  const v = match u {
    A => u.a
    _ => 7
  }
  return v
}
print(linkKind("sub", 0))
print(linkKind("divide", 5))
print(isArm({ b: 4 }))
print(wildArm({ c: 1 }))
type W = "i" | "f" | "z"
function widen(w: W, n: i32): f64 {
  const v: f64 = match w {
    "i" => n
    "f" => 2.5
    "z" => 0
  }
  return v
}
function elseIfWiden(n: i32): f64 {
  const v: f64 = if n > 2 { n } else if n > 1 { 1.5 } else { 0 }
  return v
}
print(widen("i", 3) + widen("f", 0))
print(elseIfWiden(3) + elseIfWiden(2))
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 5 || (rows.get("matched") ?? 0) !== 5) {
      throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A null test over a `U | null` union box (a call's result and a local, `==` and `!=`) reads its
// null tag; over a scalar map read (a global and a local map) it is the has probe.
const NULL_TEST_BOX_MAP =
  `type A = { a: i32 }\ntype B = { b: string }\nfunction pick(k: i32): A | B | null {\n  return if k == 1 { { a: 1 } } else if k == 2 { { b: "x" } } else { null }\n}\nfunction isNul(k: i32) { return if pick(k) == null { 1 } else { 0 } }\nfunction notNul(k: i32) {\n  const u = pick(k)\n  return if u != null { 1 } else { 0 }\n}\nconst m: {[string]: i32} = Map()\nm["here"] = 4\nfunction miss(k: string) { return if m[k] == null { 1 } else { 0 } }\nfunction hit(k: string) {\n  const l: {[string]: i32} = Map()\n  l["here"] = 5\n  return if l[k] != null { 1 } else { 0 }\n}\nprint(isNul(3) + notNul(2) + miss("gone") + hit("here"))\n`;
Deno.test({
  name: "ir shadow: a null test of a union box or a scalar map read is covered and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(NULL_TEST_BOX_MAP, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 5 || (rows.get("matched") ?? 0) !== 5) {
      throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A lambda-lifted local function reads each capture as its own parameter after the environment:
// a parameter, a string and a record of its encloser, read where legacy's capture arm reads them.
const LIFTED_CAPTURE_READ =
  `type P = { x: i32 }\nfunction outer(n: i32, s: string): i32 {\n  const p: P = { x: n + 1 }\n  function inner(k: i32): i32 {\n    print(s)\n    return n + p.x + k\n  }\n  return inner(2)\n}\nprint(outer(3, "hi"))\n`;
Deno.test({
  name: "ir shadow: a lifted function's capture reads build as its parameters and match",
  ignore,
  fn: () => {
    const { rc, rows } = run(LIFTED_CAPTURE_READ, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 2 || (rows.get("matched") ?? 0) !== 2) {
      throw new Error(`want outer and inner covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A nullable record field takes its value at the field's rep where no arm unbox is owed, for a
// plain record and a union arm: a nullable parameter and a narrowed local. An arm narrowed out of
// a union arrives boxed, and its unbox is a named miss; an explicit `null` takes the field's typed null.
Deno.test({
  name: "ir shadow: a nullable record field's value matches, and an owed arm unbox is a named miss",
  ignore,
  fn: () => {
    const { rc, rows } = run(`type Node = { v: i32, next: Node | null }
type Pt = { x: f64, y: f64 }
type Holder = { p: Pt | null, n: i32 }
type O = { n: i32, next: O | null }
type P = { m: i32 }
type U = O | P
type Q = { o: O | null }
function cons(v: i32, rest: Node | null): Node { return { v: v, next: rest } }
function hold(p: Pt | null, n: i32): Holder { return { p: p, n: n } }
function moved(h: Holder): Holder {
  const p = h.p
  if p != null { return { p: p, n: h.n + 1 } }
  return hold(null, 0)
}
function hbox(u: Pt | i32): Holder {
  if u is Pt { return { p: u, n: 1 } }
  return hold(null, u)
}
function hnull(n: i32): Holder { return { p: null, n: n } }
function qplain(x: O | null): Q { return { o: x } }
function qnarrow(u: U): Q {
  if u is O { return { o: u } }
  return qnull()
}
function qnull(): Q { return { o: null } }
function lead(u: U) {
  if u is P { return u.m }
  return 0
}
const l = cons(1, cons(2, null))
const g = moved(hold({ x: 1.5, y: 2.5 }, 4))
print(l.v + (l.next?.v ?? 0) + g.n)
print(g.p?.y ?? 0.0)
print(hbox({ x: 3.5, y: 0.0 }).p?.x ?? 0.0)
print(hbox(6).n + hnull(1).n)
const o1: O = { n: 2, next: null }
print((qplain(o1).o?.n ?? 0) + (qnarrow(o1).o?.n ?? 0) + lead({ m: 4 }))
print(qnull().o == null)
`, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    const cov = rows.get("covered") ?? 0;
    if (cov < 4 || (rows.get("matched") ?? 0) !== cov) {
      throw new Error(`want at least cons, hold, moved and qplain covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if ((rows.get("uncovered object field arm unbox") ?? 0) !== 2) {
      throw new Error(`want hbox and qnarrow a named miss, got ${JSON.stringify([...rows])}`);
    }
    if (rows.has("uncovered object field explicitNull typed null")) {
      throw new Error(`want hnull and qnull's typed null built, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A shared field read off a `U | null` parameter narrowed past `null` reads the box itself, held
// at discipline 4, as legacy reads it.
const SHARED_READ_NULLABLE_BOX =
  `type A = { k: i32, a: i32 }\ntype B = { k: i32, b: string }\nfunction f(u: A | B | null): i32 {\n  if u != null { return u.k }\n  return 0\n}\nprint(f({ k: 3, a: 1 }) + f({ k: 4, b: "x" }) + f(null))\n`;
Deno.test({
  name: "ir shadow: a shared field read off a narrowed U | null box is covered and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(SHARED_READ_NULLABLE_BOX, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 1 || (rows.get("matched") ?? 0) !== 1) {
      throw new Error(`want f covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// An assignment whose value is its number literal (`asgValueArmOf` "lit") stores, then builds the
// literal again at the reading position's width: negated, at i64 and f64, and widened past it.
const ASG_VALUE_LIT =
  `let g32 = 0\nlet g64: i64 = 0\nlet gf = 0.0\nfunction a(): i32 { return g32 = -1 }\nfunction b(): i64 { return g64 = 7 }\nfunction c(): f64 { return gf = -2.5 }\nfunction w(): f64 { return g32 = 9 }\nprint(a())\nprint(b())\nprint(c())\nprint(w())\n`;
Deno.test({
  name: "ir shadow: an assignment valued as its number literal builds and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(ASG_VALUE_LIT, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 4 || (rows.get("matched") ?? 0) !== 4) {
      throw new Error(`want a, b, c and w covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A stored literal boxed into a union builds with the box's tag written ahead of the store, as
// legacy writes it; one after a call operand builds and matches, the call's value staged below the
// store as legacy writes it first.
const ASG_VALUE_LIT_MISSES =
  `function boxed(c: boolean) {\n  let x: i32 | null = null\n  return if c { x = 5 }\n}\nfunction k() { return 3 }\nfunction h(p: i32, q: i32) { return p + q }\nlet f: f32 = 0.5\nfunction lead() { return h(k(), f = 4) }\nprint(boxed(true) ?? 0)\nprint(lead())\n`;
Deno.test({
  name: "ir shadow: a boxed stored literal and one after a call operand build and match",
  ignore,
  fn: () => {
    const { rc, rows } = run(ASG_VALUE_LIT_MISSES, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 4 || (rows.get("matched") ?? 0) !== 4) {
      throw new Error(`want boxed, lead, k and h covered and matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A returned `__trap__()` is the trap, then the bare `return` legacy writes after it: at an i32, a
// string with a message, a record and a union result it builds and matches. At a wider number
// legacy also widens the dead value and the IR does not (D17667): it builds, and its bytes differ
// only on that dead code, which behaviour parity admits.
const RETURNED_TRAP =
  `type Pt = { x: i32, y: i32 }\nfunction ti(_n: i32): i32 { return __trap__() }\nfunction ts(_n: i32): string { return __trap__("unset") }\nfunction tp(): Pt { return __trap__() }\nfunction tu(): i32 | string { return __trap__() }\nfunction tl(): i64 { return __trap__() }\nexport let hi: (n: i32) => i32 = ti\nexport let hs: (n: i32) => string = ts\nexport let hp: () => Pt = tp\nexport let hu: () => i32 | string = tu\nexport let hl: () => i64 = tl\nprint(1)\n`;
Deno.test({
  name: "ir shadow: a returned trap builds as the trap and a dead bare return, and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(RETURNED_TRAP, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows).filter((f) => !/^fail a claimable function did not match: bytes: .* in tl$/.test(f));
    if (fails.length > 0) throw new Error(`want no failure but tl's bytes, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== 5 || (rows.get("matched") ?? 0) !== 4) {
      throw new Error(`want all five covered and ti, ts, tp and tu matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A returned bundle's record held by a `const` and used at one signature takes that member
// (`holderMemberTy`), in a plain and a generic function, and matches. A call straight off the
// result takes its member too (`resultMemberCallRhs`).
const ONE_MEMBER_HOLDER =
  `function lap(f) {\n  print(f(2.5))\n  print(f(3))\n  return f\n}\nfunction plain(k: i32) {\n  const r = lap((a) => a + k)\n  print(r(4))\n}\nfunction gen<T>(x: T, k: i32) {\n  const r = lap((a) => a + k)\n  print(r(1))\n  print(x)\n}\nfunction direct(k: i32) {\n  print(lap((a) => a + k)(7))\n}\nplain(5)\ngen("s", 20)\ndirect(1)\n`;
Deno.test({
  name: "ir shadow: a bundle record held at one signature takes its member and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(ONE_MEMBER_HOLDER, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("uncovered open local type") ?? 0) !== 0) {
      throw new Error(`want no open local type, got ${JSON.stringify([...rows])}`);
    }
    if ((rows.get("covered") ?? 0) !== (rows.get("matched") ?? 0)) {
      throw new Error(`want every covered function matched, got ${JSON.stringify([...rows])}`);
    }
    if ((rows.get("uncovered indirect call") ?? 0) !== 0 || (rows.get("covered") ?? 0) !== (rows.get("fns") ?? -1)) {
      throw new Error(`want every function covered, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A record argument on its parameter's own struct heap goes in retagged (`recRowRetag`) where its
// fields lower alike by name: a reordered spelling, a recursive structural twin, and a field holding
// a generic's open closure (every closure lowers to the one closure struct).
const ROW_RETAG_ARG =
  `type AB = { a: i32, b: f64 }\ntype BA = { b: f64, a: i32 }\nfunction takeAB(v: AB): i32 { return v.a }\nconst y: BA = { b: 3.5, a: 7 }\nprint(takeAB(y))\ntype L1 = { n: L1 | null, v: i32 }\ntype L2 = { n: L2 | null, v: i32 }\nfunction headV(x: L1) { return x.v }\nconst t2: L2 = { n: null, v: 9 }\nprint(headV(t2))\n`;
const ROW_RETAG_OPEN =
  `type G = { g: i32 }\nfunction k<T>(x: T): T { return x }\nfunction show(o: G) { print(o.g) }\nconst r = { f: k, g: 7 }\nshow(r)\n`;
Deno.test({
  name: "ir shadow: a record argument on its parameter's struct heap is retagged where its fields lower alike",
  ignore,
  fn: () => {
    for (const src of [ROW_RETAG_ARG, ROW_RETAG_OPEN]) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
      if ((rows.get("start uncovered argument coercion") ?? 0) !== 0 || (rows.get("start matched") ?? 0) !== 1) {
        throw new Error(`want the start body covered and matched, got ${JSON.stringify([...rows])}`);
      }
    }
  },
});

// A record delivered by width (`Cat` to `Animal`) is its value as it stands, the supertype legacy's
// type section declares (`recSubRetag`): at a module initializer, a local declaration and an
// argument.
const WIDTH_RETAG =
  `type Animal = { legs: i32 }\ntype Cat = { legs: i32, purr: boolean }\nfunction mkCat(): Cat { return { legs: 4, purr: true } }\nfunction take(a: Animal) { print(a.legs) }\nfunction local(c: Cat) {\n  const a: Animal = c\n  print(a.legs)\n}\nconst asAnimal: Animal = mkCat()\nprint(asAnimal.legs)\nlocal(mkCat())\ntake(mkCat())\n`;
Deno.test({
  name: "ir shadow: a record delivered at a declared supertype is retagged and matches",
  ignore,
  fn: () => {
    const { rc, rows } = run(WIDTH_RETAG, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    if ((rows.get("covered") ?? 0) !== (rows.get("fns") ?? -1) || (rows.get("start matched") ?? 0) !== 1) {
      throw new Error(`want every function and the start body covered, got ${JSON.stringify([...rows])}`);
    }
  },
});

// A field typed by one bare string literal reps at the storage of the row its record is stored at
// (`rowFieldStorage`): the string where an anonymous literal built from a binding keeps it, the
// atom where a declared record's row does. One program per position the literal reaches (a read,
// a binding, a return, a list element, a comparison, a module global) and a union-arm spelling.
const ROW_FIELD_STORAGE_POSITIONS: string[] = [
  "function h(x: \"a\") {\n  const w = { f: x, g: 1 }\n  print(w.f)\n}\nh(\"a\")\n",
  "function h(x: \"a\") {\n  const w = { f: x, g: 1 }\n  const y = w.f\n  print(y)\n}\nh(\"a\")\n",
  "function mk(x: \"a\") { return { f: x, g: 1 } }\nfunction h() {\n  const w = mk(\"a\")\n  print(w.f)\n}\nh()\n",
  "function h(x: \"a\") {\n  const w = { f: x, g: 1 }\n  const v = w\n  print(v.f)\n}\nh(\"a\")\n",
  "function h(x: \"a\") {\n  const ws = [{ f: x, g: 1 }]\n  print(ws[0].f)\n}\nh(\"a\")\n",
  "function h(x: \"a\") {\n  const w = { f: x, g: 1 }\n  print(w.f == \"a\")\n}\nh(\"a\")\n",
  "const x: \"a\" = \"a\"\nconst w = { f: x, g: 1 }\nprint(w.f)\n",
  "type A = { kind: \"circle\", r: i32 }\ntype B = { kind: string, r: i32 }\nfunction f(n: i32): A | B {\n  if n == 0 {\n    const a: A = { kind: \"circle\", r: 1 }\n    return a\n  }\n  const b: B = { kind: \"round\", r: 3 }\n  return b\n}\nlet i = 0\nwhile i < 2 {\n  const x = f(i)\n  if x is A {\n    const y: A = { kind: x.kind, r: x.r }\n    print(y.kind)\n  } else {\n    print(\"B \" + x.kind)\n  }\n  i = i + 1\n}\nconst s: A = { kind: \"circle\", r: 4 }\nprint(\"a \" + s.kind)\n",
];
const ROW_FIELD_STORAGE_DECLARED =
  `type R = { f: "a", g: i32 }\nfunction h(x: "a") {\n  const v: R = { f: "a", g: 1 }\n  const w = { f: x, g: 1 }\n  print(v.f)\n  print(w.f)\n  print(v.g + w.g)\n}\nh("a")\n`;
const ROW_FIELD_STORAGE_FULL = new Set(["fns", "covered", "verified", "matched", "start fns", "start covered", "start verified", "start matched"]);
Deno.test({
  name: "ir shadow: a bare-literal field reps at its row's storage and matches",
  ignore,
  fn: () => {
    for (const src of [...ROW_FIELD_STORAGE_POSITIONS, ROW_FIELD_STORAGE_DECLARED]) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
      if (src === ROW_FIELD_STORAGE_DECLARED) continue;
      const misses = [...rows.keys()].filter((k) => !ROW_FIELD_STORAGE_FULL.has(k) && !k.endsWith(": matched"));
      if (misses.length > 0) throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}\nin:\n${src}`);
    }
  },
});

// A record literal whose storage row holds a tagged set of generic functions is built at that row:
// the set's i32 id, though the row's type is open in the set's members. A global written whole, a
// second field beside it, a nested record and a conditional write.
const TAGGED_OPEN_ROW: string[] = [
  "function id1(a) { return a }\nfunction id2(a) { return a }\nlet r = { f: id1 }\nr = { f: id2 }\nprint(r.f(2))\nprint(r.f(2.5))\n",
  "function id1(a) { return a }\nfunction id2(a) { return a }\nfunction id3(a) { return a }\nlet s = { f: id1, n: 1 }\ns = { f: id2, n: 2 }\ns = { f: id3, n: 3 }\nprint(s.f(4))\nprint(s.f(4.5))\nprint(s.n)\n",
  "function id1(a) { return a }\nfunction id2(a) { return a }\nlet t = { g: { f: id1 } }\nt = { g: { f: id2 } }\nprint(t.g.f(5))\nprint(t.g.f(\"x\"))\n",
  "function id1(a) { return a }\nfunction id2(a) { return a }\nlet n = 1\nlet u = { f: id1 }\nif n > 0 { u = { f: id2 } }\nprint(u.f(6))\nprint(u.f(6.5))\n",
];
const TAGGED_OPEN_ROW_FULL = new Set(["fns", "covered", "verified", "matched", "start fns", "start covered", "start verified", "start matched"]);
Deno.test({
  name: "ir shadow: a literal at a row open only in a tagged function set is built there and matches",
  ignore,
  fn: () => {
    for (const src of TAGGED_OPEN_ROW) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
      const misses = [...rows.keys()].filter((k) => !TAGGED_OPEN_ROW_FULL.has(k) && !k.endsWith(": matched"));
      if (misses.length > 0) throw new Error(`want every function covered and matched, got ${JSON.stringify([...rows])}\nin:\n${src}`);
    }
  },
});

// A miss at a node whose type has no rep keeps its class (`rep <what>`, a key the census diffs), and
// the detail mode adds one row naming the node's kind and the function.
Deno.test({
  name: "ir shadow: a rep miss's detail row names its node, and the class is unchanged",
  ignore,
  fn: () => {
    const src = Deno.readTextFileSync(
      new URL("./cases/closures/hole-fn-list-named-callback.vl", import.meta.url),
    );
    const one = run(src, 1);
    const detail = run(src, 2);
    const plain = run(src, 0);
    const rows1 = [...one.rows.keys()];
    if (rows1.some((k) => k.startsWith("detail ")) || one.rows.get("start uncovered rep unsup") !== 1) {
      throw new Error(`want mode 1's one \`start uncovered rep unsup\` and no detail row, got ${JSON.stringify([...one.rows])}`);
    }
    if (detail.rows.get("detail rep unsup of index in @start") !== 1) {
      throw new Error(`want the detail row naming the index node in @start, got ${JSON.stringify([...detail.rows])}`);
    }
    if (one.out.length !== plain.out.length || one.out.some((b, i) => b !== plain.out[i])) {
      throw new Error("want the armed shadow's module byte-identical to the unarmed one");
    }
  },
});

// A lone-literal field filled from a binding of that literal, built at a parameter's row that
// keeps the field as its atom: the binding's member id (`atom_sole`) is an atom typed at the
// literal, which rule 3 admits (`loneLitAtom`). The callee reads the field at its atom, which its
// `print` decodes.
const LONE_LIT_ATOM_ARG: string[] = [
  "function show(r: { f: \"a\", g: i32 }) { print(r.f) }\nfunction h(x: \"a\") {\n  show({ f: x, g: 1 })\n}\nh(\"a\")\n",
  "function show(r: { f: \"a\" }) { print(r.f) }\nfunction h(x: \"a\") {\n  show({ f: x })\n}\nh(\"a\")\n",
  "function show(r: { f: \"a\", g: i32 }) { print(r.f) }\nfunction h(x: \"a\") {\n  const w = { f: x, g: 1 }\n  show(w)\n}\nh(\"a\")\n",
  "type R = { f: \"a\", g: i32 }\nfunction show(r: R) { print(r.f) }\nfunction h(x: \"a\") {\n  show({ f: x, g: 1 })\n}\nh(\"a\")\n",
];
Deno.test({
  name: "ir shadow: a lone-literal binding delivered as its atom into a parameter's row verifies and matches",
  ignore,
  fn: () => {
    for (const src of LONE_LIT_ATOM_ARG) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}\nin:\n${src}`);
      if ((rows.get("matched") ?? 0) < 2 || rows.has("uncovered member record")) {
        throw new Error(`want h and show matched, got ${JSON.stringify([...rows])}\nin:\n${src}`);
      }
    }
  },
});

// A variant literal that omits a field its arm may omit is built at the arm's row with that field's
// null (a module const cell, a return, a list element, a union of records), and a literal-set field a
// layout family re-lays at the string reps there: no `object layout` or `object field coercion`.
const OMIT_AND_RELAY: string[] = [
  "type U = { kind: \"a\", q: i32 | null } | { kind: \"b\" }\nconst o: U = { kind: \"a\" }\nif o.kind == \"a\" { print(o.q ?? 9) }\nfunction mk(): U { return { kind: \"a\" } }\nconst m = mk()\nif m.kind == \"a\" { print(m.q ?? 8) }\n",
  "type U = { kind: \"a\", q: i32 | null } | { kind: \"b\" }\nconst ys: U[] = [{ kind: \"a\" }, { kind: \"b\" }]\nprint(ys.length)\n",
  "type Other = { a: string }\ntype Opt = { b: i32 | null, c: string | null }\nconst u1: Other | Opt = {}\nif u1 is Opt { print(u1.b ?? 3) }\n",
  "type K = \"circle\" | \"round\"\ntype A = { kind: K, r: i32 }\ntype B = { kind: string, r: i32 }\nfunction f(n: i32): A | B {\n  if n == 0 {\n    const a: A = { kind: \"circle\", r: 1 }\n    return a\n  }\n  const b: B = { kind: \"round\", r: 3 }\n  return b\n}\nconst x = f(0)\nif x is A { print(x.kind) }\nconst s: A = { kind: \"circle\", r: 4 }\nprint(s.kind)\n",
];
Deno.test({
  name: "ir shadow: an omitting variant literal and a re-laid literal-set field build at their row",
  ignore,
  fn: () => {
    for (const src of OMIT_AND_RELAY) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}\nin:\n${src}`);
      const bad = [...rows.keys()].filter((k) => k.includes("object layout") || k.includes("object field coercion"));
      if (bad.length > 0) throw new Error(`want no object layout or field coercion miss, got ${JSON.stringify([...rows])}\nin:\n${src}`);
    }
  },
});

// A record with two nullable self fields: both `T | null` spellings are one rep node, so a typed
// `null` field builds at a kid rep its type interns to (D17075) and the start verifies.
const TWO_NULLABLE_SELF: string[] = [
  "type T = { v: i32, l: T | null, r: T | null }\nfunction f(t1: T, t2: T): boolean { return t1 == t2 }\nprint(f({ v: 1, l: null, r: null }, { v: 1, l: null, r: null }))\n",
  "type T = { name: string, l: T | null, r: T | null }\nfunction f(t1: T, t2: T): boolean { return t1 == t2 }\nconst a: T = { name: \"x\", l: null, r: null }\nconst b: T = { name: \"x\", l: null, r: null }\nprint(f(a, b))\n",
];
Deno.test({
  name: "ir shadow: a record's two nullable self fields share one rep, so its null fields build",
  ignore,
  fn: () => {
    for (const src of TWO_NULLABLE_SELF) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}\nin:\n${src}`);
      const bad = [...rows.keys()].filter((k) => k.includes("record field null rep"));
      if (bad.length > 0 || (rows.get("start matched") ?? 0) < 1) {
        throw new Error(`want the start matched with no record field null rep miss, got ${JSON.stringify([...rows])}\nin:\n${src}`);
      }
    }
  },
});

// A record with no row of its own on its storage row's heap (`recHeapOf`), stood at a record whose
// field is nullable over its own or where its own is `null` (`recFieldsWiden`), and a global read
// noting its cell's heap: each start builds, verifies and matches.
const HEAP_IDENTITY_1: string[] = [
  "type J = { f: i32 }\ntype K = { j: J | null }\nfunction mk() { return { j: { f: 4 } } }\nconst _k: K = mk()\nconst y = mk()\nprint(y.j.f)\n",
  "type J = { f: i32 | null }\nfunction mk2() { return { f: null } }\nconst dA: J = mk2()\nconst go = [1].length > 0\nconst __c = mk2()\nconst __f = () => {\n  const v = __c\n  print(v.f)\n}\n__f()\n",
];
Deno.test({
  name: "ir shadow: a rowless record on its storage row's heap widens to a nullable field",
  ignore,
  fn: () => {
    for (const src of HEAP_IDENTITY_1) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}\nin:\n${src}`);
      const miss = [...rows.keys()].filter((k) => k.startsWith("start uncovered"));
      if (miss.length > 0 || (rows.get("start matched") ?? 0) < 1) {
        throw new Error(`want the start matched, got ${JSON.stringify([...rows])}\nin:\n${src}`);
      }
    }
  },
});

// A record global held at its storage row where its checked rep has no heap (D17087), a field that
// row keeps as a union box read at the plain rep through legacy's unbox: the start matches.
const HEAPLESS_GLOBAL_AT_ROW = "type V = { y: i32, x: i32 | string }\nfunction poke(self: V): i32 { return 1 }\nfunction g<T>(v: T): i32 { return v.poke() }\nconst i = { y: 2, x: 9 }\nprint(g(i))\nprint(i.x + 1)\n";
Deno.test({
  name: "ir shadow: a heapless record global is held at its storage row, its boxed field unboxed",
  ignore,
  fn: () => {
    const { rc, rows } = run(HEAPLESS_GLOBAL_AT_ROW, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}`);
    const miss = [...rows.keys()].filter((k) => k.startsWith("start uncovered"));
    if (miss.length > 0 || (rows.get("start matched") ?? 0) < 1) {
      throw new Error(`want the start matched, got ${JSON.stringify([...rows])}`);
    }
  },
});

// `ir-shadow.vl` with a chunk that does not finish: a host standing in for `vl check` exits 70 on
// every chunk, as a compiler crash does. The run reports each chunk and exits 2. It once looped:
// with no listed divergence the detail pass was the run itself, whose broken list it copied into
// itself until the GC heap ran out.
Deno.test({
  name: "ir shadow: ir-shadow.vl reports a chunk that did not finish and exits 2",
  ignore: ignore || !exists(VL) || Deno.build.os === "windows",
  fn: () => {
    const tmp = Deno.makeTempDirSync();
    try {
      const host = `${tmp}/crashing-host`;
      Deno.writeTextFileSync(host, "#!/bin/sh\nexit 70\n");
      Deno.chmodSync(host, 0o755);
      const prog = `${tmp}/p.vl`;
      Deno.writeTextFileSync(prog, "print(1)\n");
      const out = new Deno.Command("timeout", {
        args: ["300", VL, "run", "scripts/silent-sweep/distilled/ir-shadow.vl", "--compiler", COMPILER, "--", "--files", prog, "--seed", COMPILER],
        cwd: ROOT,
        env: { VL: host, IR_DIVERGENCE_BASELINE: `${tmp}/none.txt` },
        stdout: "piped",
        stderr: "piped",
      }).outputSync();
      const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
      if (out.code !== 2 || !text.includes("ir-shadow: chunk did not finish:") || !text.includes("(rc=70)")) {
        throw new Error(`want exit 2 naming the chunk (rc=70), got exit ${out.code}:\n${text.slice(0, 2000)}`);
      }
    } finally {
      Deno.removeSync(tmp, { recursive: true });
    }
  },
});

// A capture of a record whose type has no heap of its own, stored at its environment row (legacy's
// `captureValStructIdx`): the read takes that row's heap, so a binding of it at the row's record
// builds; a `let` reassigned before the closure runs does too.
const CAPTURE_ENV_HEAP: string[] = ["type J = { f: i32 | null }\nfunction mk2() { return { f: null } }\nconst dA: J = mk2()\nfunction fr() {\n  const __c = mk2()\n  const __f = () => {\n    const v = __c\n    print(v.f ?? 8)\n  }\n  __f()\n}\nfr()\n", "type J = { f: i32 | null }\nfunction mk2() { return { f: null } }\nconst dA: J = mk2()\nfunction fr() {\n  let __c = mk2()\n  __c = mk2()\n  const __f = () => {\n    const v = __c\n    print(v.f ?? 9)\n  }\n  __f()\n}\nfr()\n"];
Deno.test({
  name: "ir shadow: a heapless record capture takes its environment row's heap",
  ignore,
  fn: () => {
    for (const src of CAPTURE_ENV_HEAP) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}\nin:\n${src}`);
      const miss = [...rows.keys()].filter((k) => k.includes("uncovered"));
      if (miss.length > 0 || (rows.get("start matched") ?? 0) < 1) {
        throw new Error(`want every function and the start matched, got ${JSON.stringify([...rows])}\nin:\n${src}`);
      }
    }
  },
});

// A `T | null` global (a nullable struct cell) read narrowed at its record's heapless rep takes
// its cell row's heap, so a binding of it at that row's record builds and reads both fields.
const NULLABLE_CELL_HEAP: string[] = ["type J = { f: i32 | null, g: i32 }\nfunction mk2() { return { f: null, g: 7 } }\nconst dA: J = mk2()\nconst __m = Map()\n__m[\"k\"] = mk2()\nconst __mv = __m[\"k\"]\nif __mv != null {\n  const v = __mv\n  print(v.g)\n  print(v.f ?? 3)\n}\n", "type J = { f: i32 | null, g: i32 }\nfunction mk2() { return { f: null, g: 11 } }\nconst dA: J = mk2()\nconst __m = Map()\n__m.set(\"k\", mk2())\nconst __mv = __m.get(\"k\")\nif __mv != null {\n  const v = __mv\n  print(v.g + 1)\n  print(v.f ?? 4)\n}\n"];
Deno.test({
  name: "ir shadow: a nullable struct cell's narrowed read takes its record row's heap",
  ignore,
  fn: () => {
    for (const src of NULLABLE_CELL_HEAP) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) throw new Error(`want no failure, got:\n${fails.join("\n")}\nin:\n${src}`);
      const miss = [...rows.keys()].filter((k) => k.includes("uncovered"));
      if (miss.length > 0 || (rows.get("start matched") ?? 0) < 1) {
        throw new Error(`want the start matched, got ${JSON.stringify([...rows])}\nin:\n${src}`);
      }
    }
  },
});
