// Cross-language run-time comparison for VL. Answers "how fast is compiled VL vs
// JS / native C / native Rust?" on identical algorithms.
//
// Methodology: each language runs the SAME kernel `REPS` times and the whole
// execution is timed externally, best-of-N; per-op = best_total / REPS, so fixed
// overhead (wasm instantiate, process startup) amortizes out and the number
// reflects steady-state compute. VL and JS run in this V8; C/Rust are compiled
// NATIVE (`-O2`/`-O`) and run as subprocesses.
//
// Kernels are chosen to RESIST constant-folding (recursion + a data-dependent
// recurrence), and native receives N at RUNTIME (argv) — otherwise clang/rustc
// fold the whole computation to a constant at compile time and "win" without doing
// any work. (We don't compare results, only time; integer overflow wraps.)
//
// Optional, zero-dep: C/Rust/Lua are included only if their toolchain is on PATH
// (clang/rustc/lua); missing ones are skipped. Nothing is added to the project's
// deps — this is a comparison-only harness.
//
// Run with:  deno task perf:compare
//
// Caveat: VL-vs-native is wasm-in-V8 vs native machine code — it shows the gap to
// native, not a codegen-quality verdict. For codegen quality vs the same runtime,
// compare VL to C/Rust also compiled to wasm (a follow-up).

import { compile } from "../compiler/compile.ts";

type Bench = {
  name: string;
  reps: number;
  n: number;
  vl: (reps: number, n: number) => string; // literals (VL has no argv)
  js: (reps: number, n: number) => string; // function body using params n, reps
  c?: string; // reads argv[1]=n, argv[2]=reps; omit to skip C for this bench
  rust?: string; // reads args n, reps; omit to skip Rust for this bench
};

const BENCHMARKS: Bench[] = [
  {
    name: "recursive fib(30)",
    reps: 100,
    n: 30,
    // `fib(n - (acc & 1))`: the arg depends on the running accumulator, so no
    // optimizer can hoist the loop-invariant call out of the reps loop (clang's
    // LICM otherwise computes fib once and divides by reps → fake 100x win).
    vl: (reps, n) =>
      `function fib(x: i32): i32 {\n  if x < 2 { return x }\n  return fib(x - 1) + fib(x - 2)\n}\n` +
      `let acc = 0\nlet k = 0\nwhile k < ${reps} {\n  acc = acc + fib(${n} - (acc & 1))\n  k = k + 1\n}\nprint(acc)\n`,
    js: () =>
      `function fib(x){ if(x<2) return x; return fib(x-1)+fib(x-2); }\n` +
      `let acc=0; for(let k=0;k<reps;k++) acc=(acc+fib(n-(acc&1)))|0; globalThis.__sink=acc;`,
    c: `#include <stdio.h>
#include <stdlib.h>
int fib(int x){ if(x<2) return x; return fib(x-1)+fib(x-2); }
int main(int argc,char**argv){ int n=atoi(argv[1]),reps=atoi(argv[2]); unsigned acc=0;
  for(int k=0;k<reps;k++) acc+=(unsigned)fib(n-(int)(acc&1)); printf("%u\\n",acc); return 0; }`,
    rust: `fn fib(x:i32)->i32{ if x<2 {x} else {fib(x-1)+fib(x-2)} }
fn main(){ let a:Vec<String>=std::env::args().collect();
  let n:i32=a[1].parse().unwrap(); let reps:i32=a[2].parse().unwrap();
  let mut acc:i32=0; for _ in 0..reps { acc=acc.wrapping_add(fib(n-(acc&1))); }
  println!("{}",acc); }`,
  },
  {
    name: "iterative recurrence (1e6)",
    reps: 200,
    n: 1000000,
    // a,b = b, a+b  — a data-dependent linear recurrence the optimizers won't
    // close-form at -O2; pure i32, wraps on overflow.
    vl: (reps, n) =>
      `let acc = 0\nlet k = 0\nwhile k < ${reps} {\n  let a = 0\n  let b = 1\n  let i = 0\n  while i < ${n} {\n    let t = a + b\n    a = b\n    b = t\n    i = i + 1\n  }\n  acc = acc + b\n  k = k + 1\n}\nprint(acc)\n`,
    js: () =>
      `let acc=0; for(let k=0;k<reps;k++){ let a=0,b=1; for(let i=0;i<n;i++){ let t=(a+b)|0; a=b; b=t; } acc=(acc+b)|0; } globalThis.__sink=acc;`,
    c: `#include <stdio.h>
#include <stdlib.h>
int main(int argc,char**argv){ int n=atoi(argv[1]),reps=atoi(argv[2]),acc=0;
  for(int k=0;k<reps;k++){ int a=0,b=1; for(int i=0;i<n;i++){ int t=a+b; a=b; b=t; } acc+=b; }
  printf("%d\\n",acc); return 0; }`,
    rust: `fn main(){ let a_:Vec<String>=std::env::args().collect();
  let n:i32=a_[1].parse().unwrap(); let reps:i32=a_[2].parse().unwrap();
  let mut acc:i32=0;
  for _ in 0..reps { let mut a:i32=0; let mut b:i32=1;
    for _ in 0..n { let t=a.wrapping_add(b); a=b; b=t; } acc=acc.wrapping_add(b); }
  println!("{}",acc); }`,
  },
  {
    // Heap-shape: a short-lived struct allocated each inner iteration. VL aggregates
    // are WasmGC `struct.new`; this is the case binaryen's Heap2Local SHOULD scalarize
    // (the struct never escapes), so VL ought to land near native despite "allocating".
    // It measures whether that escape analysis fires — a binaryen lever, not a VL one.
    // `{x: i + k}` is data-dependent on the rep so nothing hoists. Read VL-vs-Rust
    // here, not VL-vs-C: clang vectorizes/closed-forms this simple reduction (its
    // number reflects that, not struct-access cost); Rust and VL both keep the loop.
    name: "struct field sum (scalarizable)",
    reps: 100,
    n: 100000,
    vl: (reps, n) =>
      `let acc = 0\nlet k = 0\nwhile k < ${reps} {\n  let s = 0\n  let i = 0\n  while i < ${n} {\n` +
      `    let p = { x: i + k, y: i }\n    s = s + p.x\n    i = i + 1\n  }\n  acc = acc + s\n  k = k + 1\n}\nprint(acc)\n`,
    js: () =>
      `let acc=0; for(let k=0;k<reps;k++){ let s=0; for(let i=0;i<n;i++){ const p={x:(i+k)|0,y:i}; s=(s+p.x)|0; } acc=(acc+s)|0; } globalThis.__sink=acc;`,
    c: `#include <stdio.h>
#include <stdlib.h>
struct P{ int x,y; };
int main(int argc,char**argv){ int n=atoi(argv[1]),reps=atoi(argv[2]); long acc=0;
  for(int k=0;k<reps;k++){ long s=0; for(int i=0;i<n;i++){ struct P p={i+k,i}; s+=p.x; } acc+=s; }
  printf("%ld\\n",acc); return 0; }`,
    rust: `#[allow(dead_code)] struct P{ x:i32, y:i32 }
fn main(){ let a:Vec<String>=std::env::args().collect();
  let n:i32=a[1].parse().unwrap(); let reps:i32=a[2].parse().unwrap();
  let mut acc:i64=0;
  for k in 0..reps { let mut s:i64=0; for i in 0..n { let p=P{x:i.wrapping_add(k),y:i}; s+=p.x as i64; } acc+=s; }
  println!("{}",acc); }`,
  },
  {
    // Heap-shape: a data-dependent GATHER over a prebuilt array — isolates VL's index
    // path (struct.get backing + bounds check + array.get on the growable `{backing,
    // len,cap}` rep). The array is built ONCE; the timed loop only reads. `n` is a
    // power of two and the index is `(j + s) & (n-1)` with `s` seeded by the rep, so
    // the walk is serial/data-dependent (no LICM hoist) yet provably in range.
    name: "array gather (data-dependent index)",
    reps: 4000,
    n: 16384,
    vl: (reps, n) =>
      `let a = [0]\nlet b = 1\nwhile b < ${n} {\n  a.push(b)\n  b = b + 1\n}\n` +
      `let acc = 0\nlet k = 0\nwhile k < ${reps} {\n  let s = k\n  let j = 0\n  while j < ${n} {\n` +
      `    let idx = (j + s) & ${n - 1}\n    s = s + a[idx]\n    j = j + 1\n  }\n  acc = acc + s\n  k = k + 1\n}\nprint(acc)\n`,
    js: () =>
      `const a=new Array(n); for(let b=0;b<n;b++) a[b]=b;\n` +
      `let acc=0; for(let k=0;k<reps;k++){ let s=k; for(let j=0;j<n;j++){ const idx=(j+s)&(n-1); s=(s+a[idx])|0; } acc=(acc+s)|0; } globalThis.__sink=acc;`,
    c: `#include <stdio.h>
#include <stdlib.h>
int main(int argc,char**argv){ int n=atoi(argv[1]),reps=atoi(argv[2]);
  int*a=malloc((size_t)n*sizeof(int)); for(int b=0;b<n;b++) a[b]=b;
  unsigned acc=0, mask=(unsigned)n-1;
  for(int k=0;k<reps;k++){ unsigned s=(unsigned)k; for(int j=0;j<n;j++){ unsigned idx=((unsigned)j+s)&mask; s+=(unsigned)a[idx]; } acc+=s; }
  printf("%u\\n",acc); free(a); return 0; }`,
    rust: `fn main(){ let ar:Vec<String>=std::env::args().collect();
  let n:i32=ar[1].parse().unwrap(); let reps:i32=ar[2].parse().unwrap();
  let a:Vec<i32>=(0..n).collect(); let mask=(n-1) as usize;
  let mut acc:i32=0;
  for k in 0..reps { let mut s:i32=k; for j in 0..n { let idx=((j+s) as usize)&mask; s=s.wrapping_add(a[idx]); } acc=acc.wrapping_add(s); }
  println!("{}",acc); }`,
  },
  {
    // Heap-shape: build a growable list by repeated `push` then sum it — exercises the
    // growable rep's allocation + amortized doubling (VL `T[]` = `{backing,len,cap}`,
    // Rust `Vec`, JS array). C is omitted (a hand-rolled realloc loop isn't a fair
    // idiomatic comparison). `[k]` seeds the list per rep so the result differs.
    name: "list build + sum (push)",
    reps: 2000,
    n: 20000,
    vl: (reps, n) =>
      `let acc = 0\nlet k = 0\nwhile k < ${reps} {\n  let a = [k]\n  let i = 1\n  while i < ${n} {\n` +
      `    a.push(i)\n    i = i + 1\n  }\n  let s = 0\n  let j = 0\n  while j < a.length {\n` +
      `    s = s + a[j]\n    j = j + 1\n  }\n  acc = acc + s\n  k = k + 1\n}\nprint(acc)\n`,
    js: () =>
      `let acc=0; for(let k=0;k<reps;k++){ const a=[k]; for(let i=1;i<n;i++) a.push(i); let s=0; for(let j=0;j<a.length;j++) s=(s+a[j])|0; acc=(acc+s)|0; } globalThis.__sink=acc;`,
    rust: `fn main(){ let ar:Vec<String>=std::env::args().collect();
  let n:i32=ar[1].parse().unwrap(); let reps:i32=ar[2].parse().unwrap();
  let mut acc:i32=0;
  for k in 0..reps { let mut a:Vec<i32>=vec![k]; for i in 1..n { a.push(i); }
    let mut s:i32=0; for &v in &a { s=s.wrapping_add(v); } acc=acc.wrapping_add(s); }
  println!("{}",acc); }`,
  },
];

const has = async (cmd: string): Promise<boolean> => {
  try {
    await new Deno.Command(cmd, { args: ["--version"], stdout: "null", stderr: "null" })
      .output();
    return true;
  } catch {
    return false;
  }
};

const noop = () => {};
const makeImports = () => ({
  imports: {
    memory: new WebAssembly.Memory({ initial: 1, maximum: 65536 }),
    __log_string__: noop, __log__: noop, __print_i32__: noop, __print_i64__: noop,
    __print_f32__: noop, __print_f64__: noop, __print_bool__: noop,
    __print_char__: noop, __print_str_flush__: noop,
  },
});

const best = (xs: number[]) => Math.min(...xs);

const timeVL = async (src: string): Promise<number> => {
  const { wasm, diagnostics } = await compile(src);
  if (!wasm) {
    throw new Error(
      "VL did not compile: " +
        diagnostics.filter((d) => d.severity === "error").map((d) => d.message).join("; "),
    );
  }
  const mod = await WebAssembly.compile(wasm as BufferSource);
  for (let i = 0; i < 3; i++) await WebAssembly.instantiate(mod, makeImports());
  const s: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    await WebAssembly.instantiate(mod, makeImports());
    s.push(performance.now() - t);
  }
  return best(s);
};

const timeJS = (body: string, n: number, reps: number): number => {
  const fn = new Function("n", "reps", body) as (n: number, reps: number) => void;
  for (let i = 0; i < 3; i++) fn(n, reps);
  const s: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    fn(n, reps);
    s.push(performance.now() - t);
  }
  return best(s);
};

const timeNative = async (
  src: string,
  ext: string,
  compileCmd: (s: string, o: string) => [string, string[]],
  runArgs: string[],
): Promise<number> => {
  const dir = await Deno.makeTempDir({ prefix: "vlperf_" });
  const srcPath = `${dir}/b.${ext}`;
  const outPath = `${dir}/b.out`;
  await Deno.writeTextFile(srcPath, src);
  const [cmd, args] = compileCmd(srcPath, outPath);
  const cc = await new Deno.Command(cmd, { args, stdout: "null", stderr: "piped" }).output();
  if (!cc.success) {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
    throw new Error(`${cmd} failed: ${new TextDecoder().decode(cc.stderr).slice(0, 200)}`);
  }
  const run = () =>
    new Deno.Command(outPath, { args: runArgs, stdout: "null", stderr: "null" }).output();
  for (let i = 0; i < 3; i++) await run();
  const s: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    await run();
    s.push(performance.now() - t);
  }
  await Deno.remove(dir, { recursive: true }).catch(() => {});
  return best(s);
};

const main = async () => {
  const haveClang = await has("clang");
  const haveRust = await has("rustc");
  console.log("VL cross-language run-time comparison");
  console.log(
    `(per-op ns, best-of-7, reps-amortized; VL+JS in this V8, C/Rust native -O2; ` +
      `N fed at runtime to defeat constant-folding)`,
  );
  if (!haveClang) console.log("  (clang absent — skipping C)");
  if (!haveRust) console.log("  (rustc absent — skipping Rust)");

  type Row = { bench: string; lang: string; ns: number };
  const rows: Row[] = [];
  for (const b of BENCHMARKS) {
    const runArgs = [String(b.n), String(b.reps)];
    const add = (lang: string, totalMs: number) =>
      rows.push({ bench: b.name, lang, ns: (totalMs * 1e6) / b.reps });
    try {
      add("VL", await timeVL(b.vl(b.reps, b.n)));
    } catch (e) {
      console.error(`  VL ${b.name}: ${(e as Error).message}`);
    }
    add("JS", timeJS(b.js(b.reps, b.n), b.n, b.reps));
    if (haveClang && b.c) {
      add("C", await timeNative(b.c, "c", (s, o) => ["clang", ["-O2", "-o", o, s]], runArgs));
    }
    if (haveRust && b.rust) {
      add("Rust", await timeNative(b.rust, "rs", (s, o) => ["rustc", ["-O", "-o", o, s]], runArgs));
    }
  }

  for (const b of BENCHMARKS) {
    const block = rows.filter((r) => r.bench === b.name).sort((x, y) => x.ns - y.ns);
    if (!block.length) continue;
    const fastest = block[0].ns;
    console.log(`\n${b.name}`);
    console.log("-".repeat(42));
    for (const r of block) {
      console.log(
        `  ${r.lang.padEnd(5)} ${r.ns.toFixed(0).padStart(12)} ns/op   ${(r.ns / fastest).toFixed(2)}x`,
      );
    }
  }
};

if (import.meta.main) await main();
