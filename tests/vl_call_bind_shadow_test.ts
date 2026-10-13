// THE PER-CALL BINDING SHADOW (`compiler/call_bind_shadow.vl`, fn-value-flow-design.md §(f)
// step 0b).
//
// The checker records what each generic call bound (`callBindTyOf`, by call node). Nothing reads
// that column to decide anything yet; the shadow compares it with what the monomorphizer bound
// at every call where it decides an instance, and counts each type parameter by class.
//
// TWO HALVES, each needed for the other to mean anything:
//
//   classes — witnesses whose calls land in each class the shadow reports, with exact counts.
//   fires   — `callBindDropSet(1)` records nothing, so every agreement becomes a missing row;
//             `callBindDropSet(2)` records the error type, so every agreement becomes a
//             disagreement. Without these a shadow that stopped reading the column would pass.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_call_bind_shadow_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[call-bind-shadow] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

// Mirrors `callBindDrop` in compiler/typecheck.vl.
const DROP_NONE = 0;
const DROP_WRITE = 1;
const DROP_AS_ERROR = 2;

/** Compile `src` on a fresh instance with the shadow armed; the rows by class, summed. */
const shadow = (src: string, drop: number, named = false) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.callBindShadowArm(named ? 2 : 1);
  exp.callBindDropSet(drop);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  const rows = new Map<string, number>();
  for (let i = 0; i < exp.callBindShadowRowCount(); i++) {
    const b = new Uint8Array(exp.callBindShadowRowLen(i));
    for (let j = 0; j < b.length; j++) b[j] = exp.callBindShadowRowAt(i, j);
    const k = new TextDecoder().decode(b);
    rows.set(k, (rows.get(k) ?? 0) + exp.callBindShadowRowN(i));
  }
  return { rc, rows };
};

const show = (rows: Map<string, number>) =>
  [...rows].map(([k, n]) => `${k}=${n}`).sort().join("; ");

const expectRows = (name: string, src: string, drop: number, want: string) => {
  const { rc, rows } = shadow(src, drop);
  if (rc !== 0) throw new Error(`${name}: want compileSrc rc 0, got ${rc}`);
  const got = show(rows);
  if (got !== want) {
    throw new Error(`${name} (drop ${drop}):\n  want: ${want}\n  got:  ${got}`);
  }
};

// Two instances of one function: each call's binding matches mono's spelling.
const PRIM = `function id<T>(x: T): T { return x }
print(id(3))
print(id("s"))
`;

// A declared record: the checker renders the structure, mono names the record.
const REC = `type P = {x: i32}
function id<T>(x: T): T { return x }
const p: P = {x: 1}
print(id(p).x)
`;

// A function value: mono pins the wasm signature, which (i32)=>i32 shares with (i32)=>boolean.
const FNV = `function inc(x: i32): i32 { return x + 1 }
function ap<T>(f: T, x: i32): i32 { return x }
print(ap(inc, 2))
`;

// The UFCS spelling records its binding as the direct spelling does.
const UFCS = `function twice<T>(self: T): T[] { return [self, self] }
const n = 3
print(n.twice().length)
`;

// A call inside a generic body is re-spelled by mono's clone, after the check.
const NESTED = `function id<T>(x: T): T { return x }
function wrap<U>(u: U): U { return id(u) }
print(wrap(5))
`;

const CASES: [string, string, string][] = [
  ["PRIM", PRIM, "agree=2"],
  ["REC", REC, "agree up to spelling=1"],
  ["FNV", FNV, "agree at the wasm signature=1"],
  ["UFCS", UFCS, "agree=1"],
  ["NESTED", NESTED, "agree=1; no row, call minted by the emitter=1"],
];

Deno.test({
  name: "call-bind shadow: each witness lands in its class",
  ignore,
  fn() {
    for (const [name, src, want] of CASES) {
      expectRows(name, src, DROP_NONE, want);
    }
  },
});

Deno.test({
  name:
    "call-bind shadow: recording nothing turns every checked call into a missing row",
  ignore,
  fn() {
    expectRows(
      "PRIM",
      PRIM,
      DROP_WRITE,
      "no row, call from the checked tree=2",
    );
    expectRows(
      "UFCS",
      UFCS,
      DROP_WRITE,
      "no row, call from the checked tree=1",
    );
  },
});

Deno.test({
  name:
    "call-bind shadow: recording the error type turns every agreement into a disagreement",
  ignore,
  fn() {
    expectRows("PRIM", PRIM, DROP_AS_ERROR, "disagree=2");
    expectRows("REC", REC, DROP_AS_ERROR, "disagree=1");
  },
});

Deno.test({
  name: "call-bind shadow: disarmed, it records no row",
  ignore,
  fn() {
    const exp = new WebAssembly.Instance(compiled!, {})
      .exports as unknown as Exports;
    exp.callBindShadowArm(0);
    exp.modReset();
    exp.srcReset();
    for (const ch of PRIM) exp.srcPush(ch.codePointAt(0)!);
    if (exp.compileSrc() !== 0) throw new Error("PRIM: want compileSrc rc 0");
    const n = exp.callBindShadowRowCount();
    if (n !== 0) throw new Error(`want 0 rows disarmed, got ${n}`);
  },
});

// Named rows carry the callee, the type parameter and both answers.
Deno.test({
  name: "call-bind shadow: a named row says what each side bound",
  ignore,
  fn() {
    const { rows } = shadow(REC, DROP_NONE, true);
    const want = "agree up to spelling | id.T | checker {x:i32} | mono P=1";
    if (show(rows) !== want) {
      throw new Error(`want: ${want}\n  got:  ${show(rows)}`);
    }
  },
});
