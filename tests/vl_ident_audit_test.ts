// THE BINDING-IDENTITY AUDIT (`compiler/ident_audit.vl`, fn-value-flow-design.md §(f) step 0).
//
// After the last arena-rewriting pass every reachable `Ident` must carry the declaration the
// checker resolved it to (`identDeclOf`), including the identifiers a rewrite minted or renamed.
// The audit is off in a normal compile; a host arms it and reads back how many identifiers were
// left at -1, grouped by the node holding them and the pass that last touched them.
//
// THREE HALVES, each needed for the others to mean anything:
//
//   zero   — witnesses whose identifiers are all minted or renamed by a rewrite (a capture
//            cell, a boxed parameter, a write inside a closure, monomorphized callees) audit 0.
//   fires  — switching off ONE propagation site (`identAuditDropSet`) makes the count rise on
//            the witness that site serves, attributed to the pass that owns it. Without this
//            an audit that stopped walking would pass the zero half quietly.
//   pin    — D3899: a call through a module alias of a generic function, written above the
//            alias, checks none of its arguments, so the lambda argument's identifiers are
//            never resolved. The fixture audits exactly 1 until D3899 closes; when it moves,
//            re-grade the row and turn this into a zero.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_ident_audit_test.ts

import { COMPILER, exists, ROOT } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[ident-audit] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

// Mirrors `IDENT_DROP_*` in compiler/symbols.vl.
const DROP_NONE = 0;
const DROP_CBOX_READ = 1;
const DROP_MONO_CALLEE = 2;

type Audit = { rc: number; unresolved: number; rows: string[] };

/** Compile `src` on a fresh instance with the audit armed (naming each identifier). */
const audit = (src: string, drop: number): Audit => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.identAuditArm(2);
  exp.identAuditDropSet(drop);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  const rows: string[] = [];
  for (let i = 0; i < exp.identAuditRowCount(); i++) {
    const b = new Uint8Array(exp.identAuditRowLen(i));
    for (let j = 0; j < b.length; j++) b[j] = exp.identAuditRowAt(i, j);
    rows.push(`${new TextDecoder().decode(b)}=${exp.identAuditRowN(i)}`);
  }
  return { rc, unresolved: exp.identAuditUnresolved(), rows };
};

const compiles = (name: string, a: Audit) => {
  if (a.rc !== 0) throw new Error(`${name}: want compileSrc rc 0, got ${a.rc}`);
};

// A capture cell: every read of `f` inside `g` is a minted `f$cell[0]`.
const M01 = `function id<T>(x: T): T { print("I"); return x }
function k<T>(x: T): T { print("K"); return x }
function main() {
  let f = id
  const g = () => f(1)
  f = k
  print(g())
}
main()
`;

// A boxed parameter: a minted `let f$cb = [f]` the checker never saw.
const M02 = `function id<T>(x: T): T { print("I"); return x }
function inc(x: i32): i32 { print("C"); return x + 1 }
function run(f: (x: i32) => i32): i32 {
  const g = () => f(1)
  f = inc
  return g()
}
function main() { print(run(id)) }
main()
`;

// The only write to `k` is a minted `k$cell[0] = inner`.
const M04 = `function inner<U>(u: U) { print("I"); print(u) }
function other<V>(v: V) { print("O"); print(v) }
function main() {
  inner(3)
  let k = other
  const w = () => { k = inner }
  w()
  k(true)
}
main()
`;

// One alias, two pins: both calls are renamed to instances.
const I05 = `function id<T>(x: T): T { return x }
function main() {
  const f = id
  print(f(1))
  print(f("s"))
}
main()
`;

// A hole lambda bound by a module let, two pins.
const U04 = `const h = (x) => x
print(h(1))
print(h("s"))
`;

// One generic function reaching an annotated parameter and a module alias.
const F03 = `function dbl(x: i32): i32 { return x * 2 }
function id<T>(x: T): T { return x }
function apply(f: (x: i32) => i32, x: i32): i32 { return f(x) }
print(apply(dbl, 3))
print(apply(id, 4))
const g = id
print(g("z"))
`;

const ZERO: [string, string][] = [
  ["m01", M01],
  ["m02", M02],
  ["m04", M04],
  ["i05", I05],
  ["u04", U04],
  ["f03", F03],
];

Deno.test({
  name:
    "ident audit: identifiers minted or renamed by a rewrite all carry a declaration",
  ignore,
  fn() {
    for (const [name, src] of ZERO) {
      const a = audit(src, DROP_NONE);
      compiles(name, a);
      if (a.unresolved !== 0) {
        throw new Error(
          `${name}: want 0 unresolved, got ${a.unresolved}: ${
            a.rows.join("; ")
          }`,
        );
      }
    }
  },
});

Deno.test({
  name: "ident audit: an unarmed compile reports nothing",
  ignore,
  fn() {
    const exp = new WebAssembly.Instance(compiled!, {})
      .exports as unknown as Exports;
    exp.identAuditDropSet(DROP_CBOX_READ);
    exp.srcReset();
    for (const ch of M02) exp.srcPush(ch.codePointAt(0)!);
    const rc = exp.compileSrc();
    if (rc !== 0) throw new Error(`want rc 0, got ${rc}`);
    const u = exp.identAuditUnresolved();
    if (u !== 0) throw new Error(`want 0 unresolved while disarmed, got ${u}`);
  },
});

/** Every row of `a` names `pass`, and there is at least one. */
const firesAt = (name: string, a: Audit, pass: string) => {
  compiles(name, a);
  if (a.unresolved === 0) {
    throw new Error(
      `${name}: want the dropped site to leave identifiers unresolved, got 0`,
    );
  }
  const stray = a.rows.filter((r) => !r.includes(`@ ${pass} `));
  if (stray.length > 0) {
    throw new Error(
      `${name}: want every row attributed to ${pass}, got ${a.rows.join("; ")}`,
    );
  }
};

Deno.test({
  name:
    "ident audit fires: a capture-cell read with no declaration is counted at captureBoxRewrite",
  ignore,
  fn() {
    firesAt("m02", audit(M02, DROP_CBOX_READ), "captureBoxRewrite");
    firesAt("m04", audit(M04, DROP_CBOX_READ), "captureBoxRewrite");
  },
});

Deno.test({
  name:
    "ident audit fires: a renamed instance callee with no declaration is counted at monomorphize",
  ignore,
  fn() {
    firesAt("i05", audit(I05, DROP_MONO_CALLEE), "monomorphize");
  },
});

Deno.test({
  name:
    "ident audit pin: D3899's unchecked lambda argument leaves exactly its parameter use",
  ignore,
  fn() {
    const path =
      `${ROOT}/tests/cases/functions/let-of-generic-called-above-declaration-lambda-arg-runs.vl`;
    const a = audit(Deno.readTextFileSync(path), DROP_NONE);
    compiles("D3899 fixture", a);
    const want = "BinExpr.left @ check 'x'=1";
    if (a.unresolved !== 1 || a.rows.join("; ") !== want) {
      throw new Error(
        `D3899 fixture: want 1 unresolved (${want}), got ${a.unresolved} (${
          a.rows.join("; ")
        }). ` +
          "If D3899 closed, re-grade its row and make this fixture a zero.",
      );
    }
  },
});
