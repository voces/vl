// Seed programs for the playground, copied verbatim from the test corpus
// (tests/cases/**). Each is a clean `@run` program that produces `log`/`print`
// output, so "click Run" shows something immediately. Embedded as strings so the
// bundle is self-contained (no runtime fetch of .vl files).

export type Sample = { name: string; source: string };

export const SAMPLES: Sample[] = [
  {
    name: "print — values of every printable type",
    // from tests/cases/run/print.vl
    source:
      `// The \`print(x)\` builtin logs a value of any printable type. Codegen dispatches
// on the argument's type to a type-specific host sink.
print(42)
let x = 10
let y = 20
print(x + y)
print(3.5)
let big: i64 = 9000000000
print(big)
let f: f32 = 2.25
print(f)
print(true)
print(false)
let s = "hello"
print(s)
print("foo" + "bar")
`,
  },
  {
    name: "loops — while + for…in over an array",
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
let a = [10, 20, 30, 40]
let t = 0
for x in a {
  t = t + x
}
print(t)
`,
  },
  {
    name: "for — step controls increment and direction",
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
  },
  {
    name: "error — a type mismatch (shows diagnostics)",
    source:
      `// Intentionally broken: demonstrates the diagnostics pane. The error has a
// source position; hover/read the message and the L:C locator.
let n: i32 = "not a number"
print(n)
`,
  },
];
