# Modules

Examples run on master `98a4ed71b`, 2026-10-11.

A program is one or more files. Each file is a module. The file given to `vl run` or
`vl build` is the entry module, and the program is the entry together with every module it
imports, directly or through another import. This chapter says what a module exports, how
another module imports it, which names are visible without an import, and in what order
modules run.

An example of several files marks each with a `// file: name.vl` line. The files sit in
one directory, and the last one is the entry.

## M1. Modules

**M1.1** Every top-level declaration is private to its module unless it is marked `export`.
Two modules may each declare a private name, and the two do not collide.

```vl
// file: a.vl
function helper(): i32 { 1 }
export function one(): i32 { helper() }
// file: main.vl
import { one } from "./a"
function helper(): i32 { 10 }
print(one() + helper())   // prints 11
```

**M1.2** Visibility has two levels: exported or private. There is no level between them.

> Ruling: owner review 2026-06-06, direction 8, DECISIONS.md §"The module system's eight
> decided directions".

## M2. Exports

**M2.1** `export` is written on a top-level declaration: `function`, `const`, `let` or
`type`. A type, a function and a generic function export alike.

```vl
// file: geo.vl
export type Pt = { x: i32, y: i32 }
export function sum(p: Pt): i32 { p.x + p.y }
export function first<T>(xs: T[]): T { xs[0] }
// file: main.vl
import { Pt, sum, first } from "./geo"
const p: Pt = { x: 3, y: 4 }
print(sum(p))                // prints 7
print(first(["a", "b"]))     // prints a
```

> Status: `export` on a declaration inside a function or a block is accepted and does
> nothing; the declaration stays local (D4065).

**M2.2** An exported binding is shared, not copied. An importer reads the exporter's
binding as it is at the moment of the read, so a write the exporter makes to an exported
`let` is seen by every importer.

```vl
// file: c.vl
export let count = 0
export function bump() { count = count + 1 }
// file: main.vl
import { count, bump } from "./c"
bump()
bump()
print(count)   // prints 2
```

**M2.3** An imported name is read-only in the importing module: it cannot be assigned,
whether the exporter declared it `let` or `const`. The value it names may still be changed
through its fields, as for any `const`.

```vl
// file: c.vl
export const K = 1
// file: main.vl
import { K } from "./c"
K = 5   // refused: cannot reassign `const` K
```

```vl
// file: c.vl
export const cfg = { n: 1 }
// file: main.vl
import { cfg } from "./c"
cfg.n = 9
print(cfg.n)   // prints 9
```

> Ruling: owner review 2026-06-06, direction 4, DECISIONS.md §"The module system's eight
> decided directions".

> Status: assigning an imported `let` is accepted, and writes the exporter's binding
> (D4063).

**M2.4** A type that an exported declaration uses need not be exported itself. An importer
can use a value of that type through its fields and the functions that take it, but cannot
write the type's name.

```vl
// file: r.vl
type Secret = { v: i32 }
export function make(): Secret { { v: 4 } }
// file: main.vl
import { make } from "./r"
print(make().v)   // prints 4
```

**M2.5** The entry module's exports are also the exports of the built wasm module. An
export of any other module is visible only to the VL modules that import it. The export
ABI is in `docs/guide/extern.md`.

## M3. Imports

**M3.1** An import names the bindings it takes: `import { a, b } from "spec"`. The names
must be exported by the module `spec` resolves to. There is no default import and no
namespace import.

```vl
// file: geo.vl
export function area(): i32 { 6 }
function hidden(): i32 { 0 }
// file: main.vl
import { hidden } from "./geo"   // refused: "hidden" is not exported by "./geo"
```

```vl
// file: c.vl
export function f(): i32 { 3 }
// file: main.vl
import * as c from "./c"   // refused: namespace imports
```

```vl
// file: c.vl
export function f(): i32 { 3 }
// file: main.vl
import c from "./c"   // refused: default imports are not supported — a VL module has only named exports
```

**M3.2** `import { a as b }` binds the export `a` under the name `b` in the importing
module. The name `a` is then not bound there.

```vl
// file: geo.vl
export function area(): i32 { 6 }
// file: main.vl
import { area as size } from "./geo"
print(size())   // prints 6
```

**M3.3** A specifier is one of:

- a relative path starting `./` or `../`, resolved against the importing file's directory;
- `std:` followed by a standard-library module name, such as `std:str`.

A relative specifier omits the `.vl` extension, and names a file, never a directory.
An absolute path and a bare name are refused.

```vl
// file: lib/a.vl
export const A = 2
// file: sub/b.vl
import { A } from "../lib/a"
export const B = A + 1
// file: main.vl
import { B } from "./sub/b"
print(B)   // prints 3
```

```vl
// file: geo.vl
export function area(): i32 { 6 }
// file: main.vl
import { area } from "./geo.vl"   // refused: Cannot resolve import "./geo.vl"
```

```vl
import { f } from "x"   // refused: Unsupported import specifier "x"
```

```vl
import { f } from "/abs/x"   // refused: an absolute path is not an import specifier; write the path relative to this file
```

> Ruling: owner review 2026-06-06, directions 1 and 6, DECISIONS.md §"The module system's
> eight decided directions". A package registry is deferred; it would be another `scheme:`.

**M3.4** An import is a top-level statement. It binds its names in the whole module,
including the code above it.

```vl
// file: c.vl
export function f(): i32 { 3 }
// file: main.vl
print(f())   // prints 3
import { f } from "./c"
```

```vl
function g() {
  import { f } from "./c"   // refused: expected an expression but found IMPORT
}
```

**M3.5** An import with an empty list, `import {} from "./c"`, binds nothing and runs the
module (M6.1).

```vl
// file: c.vl
print("c ran")
// file: main.vl
import {} from "./c"
print("main")
// prints c ran, main
```

**M3.6** An unused import is reported with a warning. Importing the same declaration twice
is reported with a warning, and the program runs.

```vl
// file: a.vl
export function area(): i32 { 6 }
// file: main.vl
import { area } from "./a"
import { area } from "./a"   // warns: Duplicate import `area` from "./a" (remove one)
print(area())   // prints 6
```

## M4. Re-exports

**M4.1** `export { a, b as c } from "spec"` publishes the named exports of `spec` as
exports of this module, under the alias where there is one. It also binds each public
name in this module, as an import would.

```vl
// file: m2.vl
export function f(): i32 { 3 }
// file: m1.vl
export { f, f as g } from "./m2"
export function h(): i32 { f() + 1 }
// file: main.vl
import { g, h } from "./m1"
print(g() + h())   // prints 7
```

> Ruling: owner 2026-10-04, R1 (A), DECISIONS.md §"A re-export binds its name locally"
> (sunpa SP-014).

**M4.2** Under an alias, the source name is not part of the module's surface.

```vl
// file: m2.vl
export function f(): i32 { 3 }
// file: m1.vl
export { f as g } from "./m2"
// file: main.vl
import { f } from "./m1"   // refused: "f" is not exported by "./m1"
```

**M4.3** An import of a name that the same module also re-exports from the same module is
redundant, and is reported with the duplicate-import warning.

> Ruling: owner 2026-10-04, R2 (A), DECISIONS.md §"A re-export binds its name locally".

> Status: no warning is given (D4064).

**M4.4** An export list without `from` is refused, whether it names an import or a local
declaration. A local declaration is exported by writing `export` on it; an import is
passed on by `export { x } from "spec"`.

```vl
// file: m2.vl
export function f(): i32 { 3 }
// file: main.vl
import { f } from "./m2"
export { f }   // refused: `export { f }` names an imported binding; re-export it with `export { f } from "./m2"`
```

> Ruling: owner 2026-10-04, R3 (A), DECISIONS.md §"A re-export binds its name locally".

**M4.5** A re-exported binding is the same binding: a re-exported `let` stays shared, as
in M2.2.

## M5. Names in a module

**M5.1** A name at a module's top level has one binding. Two imports of different
declarations under one name are refused, and so is an import beside a top-level
declaration of the same name. `as` resolves either.

```vl
// file: a.vl
export function area(): i32 { 6 }
// file: b.vl
export function area(): i32 { 7 }
// file: main.vl
import { area } from "./a"
import { area } from "./b"   // refused: Duplicate binding "area"
```

```vl
// file: a.vl
export function area(): i32 { 6 }
// file: main.vl
import { area } from "./a"   // refused: Duplicate binding "area"
function area(): i32 { 1 }
```

> Ruling: DECISIONS.md §"One name may not bind two IMPORTS, and the test is on the
> resolved DECLARATION" (D1120).

The exception is receiver overloading: functions whose first parameters are of disjoint
kinds may share a name, and only a method call `x.f()` chooses among them, by the type of
`x`. A plain call `f(x)` names the local declaration where there is one, and is refused
when only imports carry the name.

```vl
// file: s.vl
export function size(self: string): i32 { self.length }
// file: l.vl
export function size(self: i32[]): i32 { self.length * 100 }
// file: main.vl
import { size } from "./s"
import { size } from "./l"
print("abc".size())   // prints 3
print([1, 2].size())  // prints 200
```

> Ruling: owner 2026-10-07, O1 option 2 with plain calls by rule (e),
> `docs/internals/receiver-overloading.md`.

**M5.2** A declaration in a function or a block may shadow an imported name, as it may any
outer binding.

```vl
// file: a.vl
export function area(): i32 { 6 }
// file: main.vl
import { area } from "./a"   // warns: Unused import `area` (remove it)
function f(): i32 {
  const area = 5
  area
}
print(f())   // prints 5
```

**M5.3** There is no prelude. A name is visible in a module only if the module declares
it, imports it, or it is one of the ambient names. Every standard-library name is imported
from its `std:` module. The ambient names are:

| kind | names |
| --- | --- |
| types | `i32`, `i64`, `f32`, `f64`, `boolean`, `string`, `void`, `null`, `never`, `u8`, `v128` (types.md §T1.1) |
| functions | `print`, `fromCodePoint`, `fromCodePoints`, `Map`, `Set` |
| float intrinsics | `abs`, `min`, `max`, `sqrt`, `floor`, `ceil`, `trunc`, `nearest`, `copysign` |
| integer intrinsics | `clz`, `ctz`, `popcnt`, `rotl`, `rotr`, `divU`, `remU`, `ltU`, `leU`, `gtU`, `geU` |
| compiler intrinsics | names spelled `__name__`, such as `__trap__` |

`abs`, `min` and `max` also take integers (expressions.md §E2.7). The compiler intrinsics
are the floor std is written on. They are visible to every program, and std is the
supported way to reach what they do.

```vl
print(sqrt(9.0))    // prints 3
print(popcnt(7))    // prints 3
print(divU(-2, 2))  // prints 2147483647
```

```vl
print(trim(" a "))   // refused: undeclared identifier 'trim' — `trim` is exported by "std:str"; add `import { trim } from "std:str"`
```

```vl
import { trim } from "std:str"
print(trim(" a "))   // prints a
```

> Ruling: owner 2026-10-07, O7, DECISIONS.md §"No prelude: every library name is imported".

> Status: a declaration named like one of the five ambient functions is called, but a call
> to it is checked against the ambient signature, and a local `const` of that name is
> ignored at a call (D4066). A declaration named like a float or integer intrinsic shadows
> it cleanly. A compiler intrinsic cannot be redeclared: `function __trap__()` is refused,
> "is a compiler intrinsic and cannot be redefined".

> Ruling: owner 2026-10-12 (Q11 (b)), DECISIONS.md §"A declaration shadows an ambient name
> of the same name". Compiler intrinsics stay refused (D4066, not built).

**M5.4** A method call `x.f(…)` reaches only a function `f` that is in scope. It never
finds a function the module has not imported.

```vl
print(" a ".trim())   // refused: 'trim' is not imported — a free `trim(self: …)` accepting string is exported by "std:str"
```

> Ruling: owner 2026-09-02, DECISIONS.md §"UFCS is never implicit".

## M6. Running a program

**M6.1** Before a module's own top-level code runs, every module it imports has run, each
once, in the order of the module's import statements. So the entry runs last, and a module
that several modules import runs once, at its first import. A module runs even when its
importer uses only its functions or types, and even when nothing it imports is used. An
unused import gets a warning, and `vl check --fix` removes it only from a `std:` module,
since removing an import of the program's own module would skip that module's top-level
code.

```vl
// file: y.vl
export function fy(): i32 { 1 }
print("y")
// file: x.vl
export function fx(): i32 { 2 }
print("x")
// file: main.vl
import { fy } from "./y"
import { fx } from "./x"
print("main")
// prints y, x, main
```

```vl
// file: a.vl
export let n = 1
print("a")
// file: b.vl
import { n } from "./a"
export const m = n + 1
print("b")
// file: main.vl
import { m } from "./b"
print(m)
// prints a, b, 2
```

```vl
// file: a.vl
print("a runs")
export function f(): i32 { 1 }
// file: main.vl
import { f } from "./a"   // warns: Unused import `f`
print("main")
// prints a runs, main
```

**M6.2** The imports may not form a cycle, whatever the modules in the cycle declare. The
error is reported at the import that closes the cycle.

```vl
// file: a.vl
import { isOdd } from "./main"   // refused: Import cycle detected
export function isEven(n: i32): boolean { if n == 0 { true } else { isOdd(n - 1) } }
// file: main.vl
import { isEven } from "./a"
export function isOdd(n: i32): boolean { if n == 0 { false } else { isEven(n - 1) } }
print(isEven(10))
```

Open question (Q12): should a cycle of modules that declare only types and functions be
allowed, and in what order do the modules of such a cycle run?

## M7. Inference across modules

**M7.1** A module is checked with its importers. A declaration's inferred type is the same
as if every module of the program were one file: in particular, an exported record
`const` or `let` without an annotation takes the field types its importers deliver it to.

```vl
// file: r.vl
export let pt = { x: 1, y: 2 }
// file: main.vl
import { pt } from "./r"
function take(w: { x: i64, y: i64 }): i64 { w.x + w.y }
print(take(pt))   // prints 3
```

> Ruling: owner 2026-10-07, incremental-compilation Q1 (B), DECISIONS.md §"Record adoption
> crosses module boundaries".
