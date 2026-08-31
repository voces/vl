// COMPILE TWO PROGRAMS IN ONE COMPILER INSTANCE — the shape no other instrument has.
//
// Every grader in this repo runs ONE program per process: `check-filed-witnesses.py`,
// `regress.py`, the census, `corpuscmp`, `vl` itself. So a defect that needs a compiler
// instance to carry state from one program into the next is invisible to all of them,
// and D864 proves that is not hypothetical — a module-scope `??` over a nullable-struct
// global reads OUT OF BOUNDS in `emitGlobalSection`, but only on an instance that has
// already compiled a layout-twin program. It reproduces on master's own seed and no
// single-program witness can express it.
//
// The consumers that DO reuse an instance are the ones that matter most: the LSP server
// (which compiles on every keystroke), the playground, and `tests/cases_wasm_test.ts`.
//
//   deno run -A scripts/shared-instance-probe.ts a.vl b.vl [c.vl …]
//   deno run -A scripts/shared-instance-probe.ts --dir tests/cases/unions
//
// Exit 1 if any program traps the compiler, or if a program's result DIFFERS from what it
// gets on a fresh instance — that difference is the whole point, and it is silent
// everywhere else.
const SEED = "build/vl-compiler.wasm";

type Ex = Record<string, CallableFunction>;
const fresh = (): Ex =>
  new WebAssembly.Instance(
    new WebAssembly.Module(Deno.readFileSync(SEED)),
    {},
  ).exports as Ex;

const load = (ex: Ex, text: string) => {
  ex.srcReset();
  for (const ch of text) ex.srcPush(ch.codePointAt(0)!);
};

/** compileSrc's rc, or the trap it raised. */
const compile = (ex: Ex, text: string): string => {
  try {
    load(ex, text);
    return `rc=${ex.compileSrc()}`;
  } catch (e) {
    return `TRAP: ${String(e).split("\n")[0]}`;
  }
};

const args = [...Deno.args];
let files: string[];
if (args[0] === "--dir") {
  files = [...Deno.readDirSync(args[1])]
    .filter((e) => e.isFile && e.name.endsWith(".vl"))
    .map((e) => `${args[1]}/${e.name}`).sort();
} else {
  files = args;
}
if (files.length < 2) {
  console.error("want at least two programs — a shared instance needs a predecessor");
  Deno.exit(2);
}

const shared = fresh();
let bad = 0;
for (const f of files) {
  const src = Deno.readTextFileSync(f);
  const got = compile(shared, src);
  const alone = compile(fresh(), src);
  if (got === alone) continue;
  bad++;
  console.log(`  DIFFERS  ${f}`);
  console.log(`      fresh instance:  ${alone}`);
  console.log(`      shared instance: ${got}`);
}
console.log(
  `\n${files.length} programs through one instance · ${bad} behaved differently than alone`,
);
if (bad) {
  console.log(
    "A program whose result depends on what the compiler compiled BEFORE it is a\n" +
      "state leak. Every other instrument here runs one program per process and cannot\n" +
      "see this; the LSP, the playground and cases_wasm_test.ts all can.",
  );
}
Deno.exit(bad ? 1 : 0);
