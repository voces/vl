# The standard library

Examples run on master `98a4ed71b`, 2026-10-11.

This chapter says what std is, how a program reaches it, and what kind of promise it makes.
It does not restate std's API. Each module's own source is the contract for that module
(STD2.1), and the table in STD3 is only an index of what each module exports.

## STD1. What std is

**STD1.1** std is a set of VL modules that ship inside the `vl` binary. A program reaches
one by importing from `std:<name>`. Nothing in std is in scope without an import: there is
no prelude (modules.md §M5.3). A `std:` name that is not one of the modules in STD3 is
refused.

```vl
import { split, join } from "std:str"
print(join(split("a,b,c", ","), "-"))   // prints a-b-c
```

```vl
import { x } from "std:nope"   // refused: Cannot resolve import "std:nope"
```

> Ruling: owner 2026-06-06, DECISIONS.md §"The module system's eight decided directions"
> (directions 1 and 3); owner 2026-10-07 (O7), no default or configurable prelude.

**STD1.2** std is ordinary VL. Its functions are called, imported, renamed on import and
re-exported like any module's (modules.md). An export whose first parameter is `self` is
called as a method only where it is imported, because a method call resolves only names in
scope (expressions.md §E11.4, modules.md §M5.4).

```vl
print("a,b".split(","))   // refused: 'split' is not imported
```

```vl
import { split } from "std:str"
print("x;y".split(";").length)   // prints 2
```

> Ruling: owner 2026-09-02, DECISIONS.md §"UFCS is never implicit".

**STD1.3** The names that need no import (`print`, `__trap__` and the rest of the ambient
set, modules.md §M5.3) are not std. Neither are the built-in methods on lists, strings,
maps and sets. The ruled set is storage operations only; today's built-in storage set is
`push`, `pop`, `clear`, `length`, indexing, and the map and set operations. Every other
operation on a built-in type is a std function and needs its import.

```vl
import { includes } from "std:array"
const xs = [1, 2, 3]
print(xs.includes(2))   // prints true
```

> Ruling: owner 2026-10-03 (A′, answering sunpa SP-003), recorded in
> `docs/internals/builtin-methods-to-std.md`.

> Status: not yet in force. Lists still have built-in `map`, `filter`, `slice` and `get`,
> and strings built-in `indexOf`, `includes`, `cpAt`, `cpLen`, `isCharBoundary` and
> `charCodeAt`, so `[1, 2, 3].filter((x: i32) => x > 1)` and `"abc".includes("b")` run
> with no import. The move to std is sequenced behind six prerequisites listed in that
> document.

## STD2. What std promises

**STD2.1** A module's contract is its source comments: the header at the top of the file,
which says what the module is for, how to import it and what it does not do, and the one
to four lines directly above each `export`, which say what it does, what its arguments
mean, what it returns, and the edge case a caller must know. Those comments are written
for a VL user, not for the compiler's maintainers. This chapter points to them and does
not repeat them. `vl std --dump <dir>` writes the sources out; in a VL checkout they are
`std/<name>.vl`.

> Ruling: owner 2026-09-03, recorded in CLAUDE.md §"`std:*` changes get a second pass":
> a std comment is API surface, written for a consumer of VL.

**STD2.2** std is version-locked to the compiler. Each `vl` binary carries exactly one std,
and a program cannot ask for another version of it. `vl std` reports which std a run will
use, and `vl std --hash` names it.

> Ruling: owner 2026-09-03, DECISIONS.md §"std ships inside the binary; a pin is one file;
> development overrides are explicit and announced". `$VL_STD` replaces the embedded std
> for development and is announced on stderr by a released `vl`.

**STD2.3** std has no deprecation mechanism: no annotation marks a name as going away, and
no version keeps an old name alive. A std name is expected to stay. When one has been
removed, the compiler refuses the old spelling with a message that names the replacement.

```vl
print(toString(42))   // refused: undeclared identifier 'toString' — `toString` is not a builtin any more
```

```vl
import { toString } from "std:fmt"
print(toString(42) + "!")   // prints 42!
```

> Ruling: DECISIONS.md §"`toString` is std's name, not the compiler's — the ambient
> builtin is retired" (owner, 2026-09-01): "std has no deprecation story, so the compiler
> pays instead".

**STD2.4** A std function never traps on an expected failure. Expected absence is a
`T | null` result, and a failure with a reason is a `T | E` result whose error type `E` the
caller narrows with `is`. A trap inside std is a bug in the program, for example an index
out of range, or a bug in std.

```vl
import { readTextFile, IoError, errnoName } from "std:fs"
const r = readTextFile("no/such/file.txt")
if r is IoError { print(errnoName(r.code)) } else { print(r) }   // prints ENOENT (no such file or directory)
```

```vl
import { parseI32 } from "std:fmt"
print(parseI32("42") ?? -1)   // prints 42
print(parseI32("4x") ?? -1)   // prints -1
```

> Ruling: owner 2026-07-26, `docs/error-handling-design.md` (errors as values: `T | null`
> for absence, `T | E` for a reasoned failure, `__trap__` for bugs); diagnostics.md §D6.1.

**STD2.5** A module whose fallible export carries an error type from another std module
also exports that type, so one import is enough to narrow the result. `std:env`,
`std:process` and `std:args` re-export the error types of their results this way.

```vl
import { getEnv, IoError } from "std:env"
const v = getEnv("VL_SPEC_UNSET_NAME")
if v is IoError { print(v.code) } else if v == null { print("unset") } else { print(v) }   // prints unset
```

> Source: the std review rubric, `docs/internals/std-api-review.md` §3 ("Can the
> caller spell the error arm?"), which every std export passes before it merges. No owner
> ruling states it.

**STD2.6** Findings that `vl check` reports inside std modules are hidden from a user's
check, and errors are not (diagnostics.md §D4.2).

## STD3. The modules

The modules `vl std --list` names, with the exports each declares in its source. A name
marked *(type)* is a type; *(re)* means the module re-exports it from the module named.

| module | for | exports |
| --- | --- | --- |
| `std:args` | the program's command-line arguments | `programArgs`; `Utf8Error` *(re, std:utf8)* |
| `std:array` | list helpers, generic in the element type | `filled`, `indexOf`, `lastIndexOf`, `includes`, `count`, `reduce`, `reverse`, `mapIndexed`, `extend`, `concat`, `sort`, `sorted` |
| `std:base64` | RFC 4648 base64, standard alphabet, padded | `Base64Error` *(type)*, `encodeBase64`, `decodeBase64` |
| `std:buffer` | raw bytes in linear memory | `Buf`, `F32View`, `I32View`, `F32Base`, `I32Base` *(types)*; `Buffer`, `bufferMark`, `bufferRelease`; `loadI8`, `loadU8`, `loadI16`, `loadU16`, `loadI32`, `loadI64`, `loadF32`, `loadF64`; `store8`, `store16`, `storeI32`, `storeI64`, `storeF32`, `storeF64`; `fill`, `copyFrom`, `storeBytes`, `loadBytes`, `window`; `f32view`, `i32view`, `getF32`, `setF32`, `getI32`, `setI32`, `byteAddrF32`, `byteAddrI32`, `f32base`, `i32base`, `getF32At`, `setF32At`, `getI32At`, `setI32At` |
| `std:bytes` | a zeroed `u8[]`, and integers read out of one | `zeroBytes`, `u16le`, `u16be`, `i16le`, `i16be`, `i32le`, `i32be`, `i64le`, `i64be` |
| `std:env` | the environment the program started with | `getEnv`; `EILSEQ`, `EINVAL`, `IoError`, `errnoName` *(re, std:fs)* |
| `std:fmt` | numbers as text, and parsing them back | `toString`, `padLeft`, `parseI64`, `parseI32`, `toFixed`, `parseF64`; `join`, `repeat`, `split` *(re, std:str)* |
| `std:fs` | files and directories | `IoError`, `IoResult`, `FileKind` *(types)*; `EACCES`, `EILSEQ`, `EINVAL`, `EIO`, `EISDIR`, `ENOENT`, `ENOSPC`, `ENOTDIR`, `EPERM`; `errnoName`, `readFile`, `readTextFile`, `readFileRange`, `fileSize`, `readFileInto`, `readFileRangeInto`, `writeFile`, `writeFileRange`, `appendFile`, `writeTextFile`, `appendTextFile`, `listDir`, `pathKind`, `pathExists`; `Buf` *(re, std:buffer)* |
| `std:idtable` | a table keyed by small non-negative ids | `IdTable` *(type and constructor)*, `get`, `has`, `set`, `delete`, `ids` |
| `std:json` | RFC 8259 JSON as a VL value tree | `Json`, `JsonError` *(types)*, `toJson`, `parseJson` |
| `std:math` | deterministic trig, length, exp, log and pow, equal on every host | `PI`, `PI_F32`; `hypot`, `atan2`, `atan`, `asin`, `acos`, `sin`, `cos`, `exp`, `log`, `pow`, each as an `F64` and an `F32` variant |
| `std:process` | running another program, and ending this one | `ProcessOutput` *(type)*, `runProgram`, `exit`; `EACCES`, `EINVAL`, `ENOENT`, `EPERM`, `IoError`, `errnoName` *(re, std:fs)* |
| `std:seed` | a smoke module for `std:` resolution | `stdSmoke` |
| `std:simd` | four f32 lanes in one 128-bit value | `F32x4`, `Mask32x4`, `Lane4` *(types)*; `splatF32`, `f32x4`, `loadF32x4`, `storeF32x4`, `lane`, `withLane`; `add`, `sub`, `mul`, `div`, `min`, `max`, `abs`, `sqrt` with the suffix `F32x4`; `reduceAddF32x4`; `lt`, `le`, `gt`, `ge`, `eq`, `ne` with the suffix `F32x4`; `selectF32x4`, `dot`, `cross`, `normalize`; getters `x`, `y`, `z`, `w` |
| `std:str` | string operations the core does not have | `startsWith`, `endsWith`, `lastIndexOf`, `split`, `join`, `replace`, `replaceAll`, `trimStart`, `trimEnd`, `trim`, `repeat`, `padStart`, `padEnd`, `toUpperAscii`, `toLowerAscii`, `toUpperLatin1`, `backwards`, `codePoints` |
| `std:test` | the in-language test surface, driven by `vl test` | `CallerLoc` *(type)*, `describe`, `it`, `itSkip`, `beforeEach`, `afterEach`, `expect`, `not`, `toEqual`, `toBeTrue`, `toBeFalse`, `fail`, `done`; `vltCount`, `vltNameLen`, `vltNameAt`, `vltSkipped`, `vltRun`, `vltFailLen`, `vltFailAt` |
| `std:utf16` | strings as UTF-16 code units, and back | `Utf16Error` *(type)*, `utf16Length`, `encodeUtf16`, `decodeUtf16`, `decodeUtf16Lossy` |
| `std:utf8` | strings as UTF-8 bytes, and back | `Utf8Error` *(type)*, `utf8Length`, `encodeUtf8`, `decodeUtf8`, `decodeUtf8At`, `decodeUtf8Lossy` |

**STD3.1** Two std modules may export functions of one name when their first parameters are
disjoint. A program may import both, and a method call picks by the receiver.

```vl
import { lastIndexOf } from "std:str"
import { lastIndexOf } from "std:array"
print("abcb".lastIndexOf("b"))   // prints 3
print([1, 2, 1].lastIndexOf(1))  // prints 2
```

> Ruling: owner 2026-10-07 (O1), receiver overloading; modules.md §M5.1.

**STD3.2** A re-export is the same function, not a copy. `split` imported from `std:fmt`
is `std:str`'s `split` (modules.md §M4.5).

```vl
import { split } from "std:fmt"
print(split("a b", " ").length)   // prints 2
```

> Open question (Q14): whether the `std:test` exports its header calls "the runner's
> protocol, not part of the authoring surface" (`vlt*`) and `std:seed`'s `stdSmoke`, which
> its header says "can be retired", are promised std surface.

> Open question (Q15): whether std keeps two spellings of one operation: `std:fmt`'s
> `padLeft` beside `std:str`'s `padStart`, and `std:fmt`'s re-exports of `split`, `join`
> and `repeat` from `std:str`.
