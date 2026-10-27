// THE BINDING-IDENTITY AUDIT (`compiler/ident_audit.vl`, fn-value-flow-design.md §(f) step 0).
//
// After the last arena-rewriting pass every reachable `Ident` must carry the declaration the
// checker resolved it to (`identDeclOf`), including the identifiers a rewrite minted or renamed.
// The audit is off in a normal compile; a host arms it and reads back how many identifiers were
// left at -1, grouped by the node holding them and the pass that last touched them.
//
// Three counts: identifiers with no declaration (-1); identifiers filed as builtin although a
// reachable declaration binds their name; identifiers resolved to a node that does not declare
// their name (a shadow resolved to the wrong binding).
//
// TWO HALVES, each needed for the other to mean anything:
//
//   zero   — witnesses whose identifiers are all minted or renamed by a rewrite (a capture
//            cell, a boxed parameter, a write inside a closure, monomorphized callees), and
//            plain declarations and shadows, audit 0 in all three counts. D3899's fixture (a
//            lambda argument of a call through an alias above its declaration, which the
//            checker once never visited) is one of them since that row closed.
//   fires  — switching off ONE propagation site (`identAuditDropSet`) makes the count rise on
//            the witness that site serves, attributed to the pass that owns it. Without this
//            an audit that stopped walking would pass the zero half quietly.
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
const DROP_FN_DECL = 3;
const DROP_LOOP_MOVE = 4;

type Audit = {
  rc: number;
  unresolved: number;
  builtinDeclared: number;
  misresolved: number;
  rows: string[];
};

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
  return {
    rc,
    unresolved: exp.identAuditUnresolved(),
    builtinDeclared: exp.identAuditBuiltinDeclared(),
    misresolved: exp.identAuditMisresolved(),
    rows,
  };
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

// A function and its parameter: both uses resolve to their declarations, not to builtins.
const P1 = `function f(x: i32): i32 { return x + 1 }
print(f(2))
`;

// A call inside a function to a function declared below it.
const P3 = `function g(): i32 { return f(1) }
function f(x: i32): i32 { return x * 2 }
print(g())
`;

// A parameter shadowing a module const, and a local lambda shadowing a module function.
const P6 = `const x = 10
function f(x: i32): i32 { return x + 1 }
print(f(2))
print(x)
`;
const P7 = `function f(x: i32): i32 { return x + 1 }
function main() {
  const f = (y: i32) => y * 100
  print(f(2))
}
main()
print(f(2))
`;

// A lambda parameter shadowing the closure's captured `let` (the D2068 fixture's shape).
const P8 = `function nestedLambda() {
  let y = 5
  const g = () => {
    const m = (y: string) => { print(y) }
    m("p")
    y = y + 10
    print(y)
  }
  g()
}
nestedLambda()
`;

// A `for` loop whose value is used moves to a fresh node; its variable's uses follow it.
const L1 = `function firstOver(xs: i32[], n: i32): i32 | null {
  for x in xs { if x > n { break x } }
}
print(firstOver([1, 5, 9], 4) ?? 0)
const v = for i in 0 until 10 { if i * i > 20 { break i } } ?? -1
print(v)
`;

const ZERO: [string, string][] = [
  ["m01", M01],
  ["m02", M02],
  ["m04", M04],
  ["i05", I05],
  ["u04", U04],
  ["f03", F03],
  ["p1", P1],
  ["p3", P3],
  ["p6", P6],
  ["p7", P7],
  ["p8", P8],
  ["l1", L1],
];

Deno.test({
  name:
    "ident audit: identifiers minted or renamed by a rewrite all carry a declaration",
  ignore,
  fn() {
    for (const [name, src] of ZERO) {
      const a = audit(src, DROP_NONE);
      compiles(name, a);
      if (a.unresolved + a.builtinDeclared + a.misresolved !== 0) {
        throw new Error(
          `${name}: want 0 unresolved / builtin although declared / misresolved, got ${a.unresolved} / ${a.builtinDeclared} / ${a.misresolved}: ${
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

// rc 3 is an emit refusal: the audit has run by then, and a later pass that reads the dropped
// identity may decline rather than answer without it. M04's cell holds a generic function the
// value-flow question follows through the cell's reads; with the read unresolved it answers
// "not inert" and the emitter refuses, where answering "inert" printed `1` for `true`.
const compilesOrEmitRefuses = (name: string, a: Audit) => {
  if (a.rc !== 0 && a.rc !== 3) {
    throw new Error(`${name}: want compileSrc rc 0 or 3, got ${a.rc}`);
  }
};

/** Every row of `a` names `pass`, and there is at least one. */
const firesAt = (
  name: string,
  a: Audit,
  pass: string,
  ran: (name: string, a: Audit) => void = compiles,
) => {
  ran(name, a);
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
    firesAt(
      "m04",
      audit(M04, DROP_CBOX_READ),
      "captureBoxRewrite",
      compilesOrEmitRefuses,
    );
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
    "ident audit fires: a function or parameter use with its declaration unrecorded is counted as builtin although declared",
  ignore,
  fn() {
    for (const [name, src] of [["p1", P1], ["p3", P3]]) {
      const a = audit(src, DROP_FN_DECL);
      compiles(name, a);
      const want = ["f", "x"];
      for (const id of want) {
        if (
          !a.rows.some((r) =>
            r.startsWith("builtin although declared: ") && r.includes(`'${id}'`)
          )
        ) {
          throw new Error(
            `${name}: want '${id}' counted as builtin although declared, got ${a.builtinDeclared}: ${
              a.rows.join("; ")
            }`,
          );
        }
      }
    }
  },
});

Deno.test({
  name:
    "ident audit fires: a lambda parameter with its declaration unrecorded is counted as resolved to the captured binding it shadows",
  ignore,
  fn() {
    const a = audit(P8, DROP_FN_DECL);
    compiles("p8", a);
    if (
      !a.rows.some((r) =>
        r.startsWith("resolved elsewhere: ") && r.includes("'y'")
      )
    ) {
      throw new Error(
        `p8: want the lambda's 'y' counted as resolved elsewhere, got ${a.misresolved}: ${
          a.rows.join("; ")
        }`,
      );
    }
  },
});

Deno.test({
  name:
    "ident audit fires: a loop variable whose loop moved, its uses left behind, is counted as resolved to a non-declaration",
  ignore,
  fn() {
    const a = audit(L1, DROP_LOOP_MOVE);
    compiles("l1", a);
    // A `for … in` variable is its own declaration, left naming the node its loop moved from; a
    // `for` range loop is its variable's declaration, and the moved-from node is now the `if`.
    for (const [id, kind] of [["x", "LoopVar"], ["i", "IfStmt"]]) {
      if (
        !a.rows.some((r) =>
          r.startsWith(`resolved to a non-declaration (${kind}): `) &&
          r.includes(`'${id}'`)
        )
      ) {
        throw new Error(
          `l1: want '${id}' counted as resolved to a non-declaration, got ${a.misresolved}: ${
            a.rows.join("; ")
          }`,
        );
      }
    }
  },
});

Deno.test({
  name:
    "ident audit: D3899's lambda argument, called through an alias above its declaration, is resolved",
  ignore,
  fn() {
    const path =
      `${ROOT}/tests/cases/functions/let-of-generic-called-above-declaration-lambda-arg-runs.vl`;
    const a = audit(Deno.readTextFileSync(path), DROP_NONE);
    compiles("D3899 fixture", a);
    if (a.unresolved + a.builtinDeclared + a.misresolved !== 0) {
      throw new Error(
        `D3899 fixture: want 0 in all three counts, got ${a.unresolved}/${a.builtinDeclared}/${a.misresolved} (${
          a.rows.join("; ")
        })`,
      );
    }
  },
});
