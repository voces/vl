// THE MODULE-ARMING GATE'S SHARED TABLE — one row per source, plus the answer all
// four implementations of the gate owe it.
//
// It lives here rather than in a test file so the three EXECUTORS can share it
// without importing each other's `Deno.test` registrations:
//   • `tests/module_gate_agreement_test.ts` — the shared TS gate (`compiler/moduleGate.ts`),
//     pure, plus the source-level agreement checks on the two mirrored copies;
//   • `tests/vl_module_gate_test.ts`        — the native `vl check`, which runs the
//     Rust host's gate and the compiler's `cliNeedsModules` in series;
//   • `tests/lsp_wasm_checker_test.ts`      — the seed-backed LSP checker.
//
// See `compiler/moduleGate.ts` for what the gate is and why it exists four times.

/**
 * `native` says what `vl check` must produce for the row:
 *
 * - `"unresolved"` — the entry names a module that does not exist, so the fetch
 *   loop MUST arm and the compiler MUST report it. This is the bug's shape: a
 *   gate that does not arm reports NOTHING AT ALL, so the assertion is on a
 *   diagnostic's PRESENCE, never on its absence.
 * - `"clean"` — the row must check cleanly (it needs no modules, or it needs
 *   `std:fmt` and gets it).
 * - `"skip"` — graded by the pure executor only: the row separates the GATES, but
 *   pinning its native outcome would pin unrelated parser behaviour too.
 */
export type GateCase = {
  readonly name: string;
  readonly source: string;
  readonly arms: boolean;
  readonly native: "unresolved" | "clean" | "skip";
};

export const GATE_CASES: readonly GateCase[] = [
  // — module-dependency lines —
  {
    name: "plain import",
    source: 'import { helper } from "./nope"\nprint(1)\n',
    arms: true,
    native: "unresolved",
  },
  {
    name: "re-export (the arm both TS copies had lost)",
    source: 'export { helper } from "./nope"\nprint(1)\n',
    arms: true,
    native: "unresolved",
  },
  {
    name: "re-export, indented",
    source: '  export { helper } from "./nope"\nprint(1)\n',
    arms: true,
    native: "unresolved",
  },
  {
    name: "re-export, no space before the brace",
    source: 'export{ helper } from "./nope"\nprint(1)\n',
    arms: true,
    native: "unresolved",
  },
  {
    name: "import, no space before the brace",
    source: 'import{ helper } from "./nope"\nprint(1)\n',
    arms: true,
    native: "unresolved",
  },
  {
    name: "re-export on a later line",
    source: 'print(1)\nexport { helper } from "./nope"\n',
    arms: true,
    native: "unresolved",
  },
  // — the `{` is what separates a dependency from a plain declaration —
  {
    name: "exported function is NOT a module edge",
    source: "export function twice(n: i32): i32 { n * 2 }\nprint(twice(2))\n",
    arms: false,
    native: "clean",
  },
  {
    name: "exported const is NOT a module edge",
    source: "export const seven = 7\nprint(seven)\n",
    arms: false,
    native: "clean",
  },
  {
    name: "an identifier merely PREFIXED by a keyword",
    source: "let exporter = 1\nexporter = 2\nprint(exporter)\n",
    arms: false,
    native: "clean",
  },
  {
    name: "a keyword with its brace on the NEXT line does not arm",
    source: 'import\n{ helper } from "./nope"\nprint(1)\n',
    arms: false,
    native: "skip",
  },
  // — template holes: the second construct that arms the loop —
  {
    name: "template with an i32 hole",
    source: "const x = 5\nprint(`v=${x}`)\n",
    arms: true,
    native: "clean",
  },
  {
    name: "hole-less template stays on the single-source path",
    source: "print(`plain`)\n",
    arms: false,
    native: "clean",
  },
  {
    name: "a backtick in a `//` comment is not a template",
    source: "// a ` backtick in prose, and a ${ too\nprint(1)\n",
    arms: false,
    native: "clean",
  },
  {
    name: "`${` inside a quoted string is not a hole",
    source: 'print("${not_a_hole}")\n',
    arms: false,
    native: "clean",
  },
  {
    name: "no modules at all",
    source: "print(1)\n",
    arms: false,
    native: "clean",
  },
];
