// Seed programs for the playground, copied verbatim from the test corpus
// (tests/cases/**). Each is a clean `@run` program that produces `log`/`print`
// output, so "click Run" shows something immediately. Embedded as strings so the
// bundle is self-contained (no runtime fetch of .vl files).
//
// A sample is a *project*: an ordered list of files. The first file is the entry
// module (`main.vl`) — the one Run/WAT resolve the import graph from. Most
// samples are a single file; the `project` sample demonstrates VL's real module
// system (`export` / `import { … } from "./mathx"`, relative paths, no `.vl`
// extension — see docs/modules-design.md), compiled whole-program to one wasm
// module by the self-hosted seed (`WasmChecker.compile` → the driver `compileSrc`).

export type SampleFile = { name: string; source: string };
export type Sample = { name: string; files: SampleFile[] };

export const SAMPLES: Sample[] = [
  {
    name: "print — values of every printable type",
    files: [{
      name: "main.vl",
      // from tests/cases/run/print.vl
      source:
        `// The \`print(x)\` builtin logs a value of any printable type. Codegen dispatches
// on the argument's type to a type-specific host sink.
print(42)
const x = 10
const y = 20
print(x + y)
print(3.5)
const big: i64 = 9000000000
print(big)
const f: f32 = 2.25
print(f)
print(true)
print(false)
const s = "hello"
print(s)
print("foo" + "bar")
`,
    }],
  },
  {
    name: "loops — while + for…in over an array",
    files: [{
      name: "main.vl",
      // from tests/cases/loops/while-sum.vl + for-in.vl
      source: `// while loop sums 0..4 (condition checked before each pass).
let s = 0
let i = 0
while i < 5 {
  s = s + i
  i = i + 1
}
print(s)

// for…in over an array binds each element in turn.
const a = [10, 20, 30, 40]
let t = 0
for x in a {
  t = t + x
}
print(t)
`,
    }],
  },
  {
    name: "for — step controls increment and direction",
    files: [{
      name: "main.vl",
      // from tests/cases/loops/for-step.vl
      source:
        `// \`step\` controls both the increment and the loop direction. Ascending: 0,2,4,6.
let s = 0
for i in 0 to 6 step 2 {
  s = s + i
}
print(s)

// A negative step counts down (5,4,3,2,1).
let d = 0
for i in 5 to 1 step -1 {
  d = d + i
}
print(d)
`,
    }],
  },
  {
    name: "project — multi-file modules (import / export)",
    // Whole-program compile: `main.vl` imports from `./mathx`; the resolver
    // walks the graph, type-checks both modules into one program, and emits ONE
    // wasm module (compiler/compileProgram). Real VL module syntax — see
    // docs/modules-design.md.
    files: [
      {
        name: "main.vl",
        source: `// A two-file project. \`import { … } from "./mathx"\` pulls in exported
// functions; the playground compiles the whole graph to one wasm module.
import { add, square } from "./mathx"
import { TAU as twoPi } from "./mathx"

let r = add(square(3), 4)
print(r)
print(twoPi)
`,
      },
      {
        name: "mathx.vl",
        source: `// Only \`export\`ed names are visible to importers. \`import { x as y }\`
// renames on the importing side.
export function add(a: i32, b: i32): i32 {
  return a + b
}

export function square(n: i32): i32 {
  return n * n
}

export const TAU: f64 = 6.28318
`,
      },
    ],
  },
  {
    name: "error — a type mismatch (shows diagnostics)",
    files: [{
      name: "main.vl",
      source:
        `// Intentionally broken: demonstrates the diagnostics pane. The error has a
// source position; hover/read the message and the L:C locator.
let n: i32 = "not a number"
print(n)
`,
    }],
  },
];
