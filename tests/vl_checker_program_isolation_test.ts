// CROSS-PROGRAM ISOLATION — compiling a program must not depend on what was compiled
// before it in the same instance.
//
// WHY THIS EXISTS. The corpus sweep (`scripts/native-corpus-sweep.sh`) runs one `vl`
// PROCESS per file, so no program ever observes another program's state, and it is
// therefore structurally blind to every module-level column, memo, interner or counter
// that survives `initChecker` — at any corpus size. That blindness is not theoretical:
// a checker column shipped as `const` (so the binding, and therefore the array, outlived
// the reset block) produced **20 suite failures that each PASSED in isolation**, while
// the sweep reported 0 of 2,032 rows moved on the same build. See the destringify
// programme's B31 entry.
//
// `cases_wasm_test.ts` catches this class only incidentally — it happens to share one
// instance across the corpus, so a leak shows up as a scatter of unrelated failures with
// no obvious common cause. This file pins the invariant DIRECTLY and names it, so the
// next such leak reports itself as what it is.
//
// THE INVARIANT IS GENERAL, deliberately: compiling B after A must produce byte-identical
// output to compiling B first. It does not encode any particular column, so it keeps
// working for leaks nobody has thought of yet.
import { assertEquals } from "jsr:@std/assert";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;

const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();

type Exports = Record<string, (...args: number[]) => number>;

const pushString = (push: (cp: number) => number, text: string) => {
  for (const ch of text) push(ch.codePointAt(0)!);
};

/** A FRESH instance per call — the baseline "compiled first" answer. */
const freshInstance = (): Exports => {
  const bytes = Deno.readFileSync(SEED);
  const module = new WebAssembly.Module(bytes);
  return new WebAssembly.Instance(module, {}).exports as unknown as Exports;
};

/** Compile `src` through `exp` and return the emitted module bytes (empty on reject). */
const compile = (exp: Exports, src: string): Uint8Array => {
  exp.srcReset();
  pushString(exp.srcPush, src);
  const rc = exp.compileSrc(1);
  if (rc !== 0) return new Uint8Array();
  const n = exp.rbyteLen();
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = exp.rbyteAt(i);
  return out;
};

// A: banks inferred-return rows whose producers are NOT the nullable ones — value unions
// and struct unions. The pairing is the point: a leak only shows where A's row at a given
// INDEX carries a different rung from B's row at the same index, so A and B must disagree
// per-row. Two nullable-heavy programs agree everywhere and hide the leak completely —
// which is exactly how the first version of this file passed against a broken build.
const A = `type Cat = { meow: i32 }
type Dog = { woof: i32 }
function pick(b: boolean) {
  if b { return { meow: 3 } }
  return { woof: 4 }
}
function val(b: boolean) {
  if b { return 5 }
  return "s"
}
const e = pick(true)
if e is Cat { print(e.meow) }
const v = val(false)
if v is string { print(v) }
`;

// B: a NULLABLE-closure program lifted verbatim from
// `tests/cases/closures/closure-nullable-array-factory.vl` — one of the twenty cases that
// failed together, each passing alone, when the rung column leaked. Used verbatim rather
// than reduced, because the reduction is what makes this class of test vacuous: a leak is
// a function of how many rows the PREVIOUS program banked and which index this program's
// rows land on, and a small program banks too few rows to shift anything. A first version
// of this file used a two-line `const g = () => 7` and PASSED against a deliberately
// re-broken build — a check that cannot fail.
const B = `type P = { x: i32 }

function mkP(): (i32) => P | null {
  return (n) => if n > 0 { { x: n } } else { null }
}

function go() {
  const g: (i32) => P | null = (n) => if n > 0 { { x: n } } else { null }
  const arr = [g]
  const a = arr[0](7)
  if a != null {
    print(a.x) // 7
  }
  const r = arr[0](5)
  if r != null {
    print(r.x) // 5
  }
  const r2 = arr[0](-1)
  if r2 == null {
    print(99) // 99
  }

  const h: (i32) => P | null = (n) => if n > 5 { { x: n * 10 } } else { null }
  const qs = [g, h]
  const q = qs[1](6)
  if q != null {
    print(q.x) // 60
  }
  const q2 = qs[1](2)
  if q2 == null {
    print(0) // 0
  }

  const mk = mkP()
  const m = mk(9)
  if m != null {
    print(m.x) // 9
  }

  const s: (i32) => string | null = (n) => if n > 0 { "hi" } else { null }
  const ss = [s]
  const sr = ss[0](1)
  if sr != null {
    print(sr) // hi
  }
  const sr2 = ss[0](-1)
  if sr2 == null {
    print("was-null") // was-null
  }
}

go()
`;

Deno.test({
  name: "checker state does not leak across programs in one instance",
  ignore: !seedExists,
  fn: () => {
    const alone = compile(freshInstance(), B);
    // Non-empty, or the test would pass vacuously on a build that rejects B.
    if (alone.length === 0) throw new Error("B did not compile — fixture is stale");

    // A is compiled REPEATEDLY before B. A leak is cumulative — each prior program adds
    // rows that shift the next program's indices — so a single warm-up compile is not
    // enough to move anything. The real failure surfaced only across a corpus of ~1,970
    // programs in one instance; this reproduces the same accumulation in miniature.
    const shared = freshInstance();
    for (let i = 0; i < 8; i++) compile(shared, A);
    const after = compile(shared, B);

    assertEquals(
      Array.from(after),
      Array.from(alone),
      "compiling B after A differs from compiling B first — per-program state leaked",
    );
  },
});
