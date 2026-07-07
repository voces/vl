# VL error-handling design — errors as values over unions, no catchable throw

> Status: **draft / design — pending owner review.** No compiler or std change is
> proposed here; this doc changes none. It records the *direction* for how VL
> programs report and recover from failure, so the eventual fallible-std PRs
> (`std:fs`, parsing) are small and uncontested. It **commits** a model now, but
> the implementation is **sequenced** behind the Phase-2 rep rewrite (§Sequencing);
> the `DECISIONS.md` entry lands with implementation, not before — the spirit of
> `docs/guide/collections-design.md` and `docs/internals/modules-design.md`.
> The owner has asked to see examples and a cross-language survey before signing
> off; both are below (§Examples, §Survey), and the open questions the owner must
> rule on are collected at the end (§Open).

## Why this exists (the frame)

`std:` (H0 Phase 2) is landing total functions today: `std:fmt`, `std:array`,
`std:test` never *fail with a reason* — a bad index traps, and `std:test` aborts
via `__trap__`. But the next std family is I/O: `std:fs`, `std:args`, `std:io`
(std-design.md D2). A file read *can* fail for reasons the caller must handle —
missing path, permission denied, a WASI errno — and those are **not bugs**, they
are normal program states. So VL needs its failure story fixed **before** std
grows a single fallible API. std-design.md D1 deliberately parked this question
("failure/exception strategy: deliberately undecided here") and chartered this
doc as the gate. This is that doc.

The good news: VL already has the machinery. Value unions, `is`-narrowing, `??`,
`?.`, and `match` over literal unions all ship in both compilers. The compiler
*itself* is written this way — `typecheck.vl` accumulates errors on `T.diags`
rather than throwing, because "VL has no exceptions" (typecheck.vl ~:229). The
question is not *what to build* but *what convention to bless* on top of what
exists, and what small sugar (union-`as` propagation, §Chartered) to add later.

## Principles

The foundation is **errors as values via unions**, already stated twice in
`docs/guide/collections-design.md` (~:115–124, ~:1129–1142) as the owner's
favored direction and drawn along the *normal-state vs programmer-error* line:

1. **Expected absence → `T | null`.** A lookup that legitimately misses. Map
   miss (`Map[k]: V | null`), `list.get(i): T | null`, `pop(): T | null`. No
   reason is carried because there is nothing to explain — the thing is simply
   not there. Narrowed with `!= null`, `??`, `?.`.

2. **Reasoned failure → `T | E`.** An operation that can fail *with information
   the caller needs* — an errno, a message, a parse position. `E` is a struct;
   the caller `is`-narrows it out. `fs.read(p): string | IoError`.

3. **Unrecoverable bug → trap.** The program computed something it had no
   business computing (out-of-bounds `a[i]`, a violated invariant). Traps are
   fatal and uncatchable by design — this is the Rust `panic!`-vs-`Result`
   split. Reserving traps for bugs keeps `T | E` honest: if it's in the return
   type, it's a *handleable* condition, not a crash.

**No catchable throw in v1.** VL has no `try`/`catch` and this doc does not add
one. The two mechanisms above cover every *recoverable* case; a third,
control-flow-escaping mechanism would be a redundant second way to spell the
same thing (§Survey, Kotlin/TS). Wasm's now-standardized exception handling
(`exnref`) is **explicitly reserved, not foreclosed** — see §Open — for a
possible async era where a stack-unwinding primitive earns its keep; ruling it
in now would pre-commit a hard question with no consumer in the tree.

## Design

### The error shape — a standard convention with a name

An error value is **a struct carrying the reason**. VL type aliases are
*structural*, so std blesses a **named alias** — convention with a name, not a
nominal type. Any struct with the right fields is compatible; the alias is
documentation and a shorthand, nothing more.

```vl
// std:io (proposed) — the blessed I/O error shape.
type IoError = { code: i32, msg: string }   // `code` = the WASI errno
```

Because the alias is structural, all three of these are the *same type* and
interoperate freely — a caller need never import `IoError` to construct or match
one:

```vl
const a: IoError = { code: 44, msg: "no such file" }
const b: { code: i32, msg: string } = a          // identical structural type
```

The owner explicitly weighed *structural-convention-only* vs a *blessed nominal
type* and settled here: a named structural alias. It gives readers a word
(`IoError`) and gives std one canonical shape to render, without inventing
VL's first nominal type or a new `==` rule. Different failure domains get
different aliases (`ParseError = { at: i32, msg: string }`), and a function that
can fail two ways returns `T | IoError | ParseError` — a plain union, each arm
`is`-narrowed.

### `__trap__(msg)` — the trap grows a reason (no new name)

**Status: LANDED (2026-07).** `__trap__("reason")` compiles: the message rides
the print-of-string path (`__print_char__` … `__print_str_flush__`) to the host
boundary, then the same `unreachable`. Bare `__trap__()` is byte-identical to
before. `std:test` still uses the bare form — threading messages through it is a
follow-up.

std-design.md OD2 asks whether to keep the bare `__trap__()` or grow a richer
primitive. Owner ruling (2026-07): **extend the existing intrinsic** with an
optional message — `__trap__("unreachable: registry desynced")` — rather than
bless a new `panic` identifier or a keyword. VL deliberately has **no intrinsic
functions outside the `__dunder__` convention**; `panic` would have been the
first bare intrinsic name, and a keyword is heavier machinery (reserved word,
parser production) than an abort path warrants. `__trap__(msg)` lowers as
message-to-host-boundary (like `__log_string__`) then the same `unreachable`,
so a bug aborts with a *reason a human can read*; bare `__trap__()` is
unchanged. The dunder spelling doubles as a signal: traps are for bugs, so the
call *should* look like the raw floor of the language, not an ergonomic API.
If a friendlier spelling is ever wanted, it can be a plain std wrapper decided
separately — nothing here forecloses it.

## Examples

Every example below is real VL and would parse today (syntax verified against
`tests/cases/` and `docs/guide/`). Only the *std functions* they call are
future.

**Producing a `T | E`.** A fallible read returns the value or the error struct:

```vl
export function read(path: string): string | IoError {
  const fd = wasiOpen(path)
  if fd < 0 { return { code: 0 - fd, msg: "open failed: " + path } }
  return readAll(fd)
}
```

**Consuming it — `is`-narrow, handle, continue.** The happy path falls through:

```vl
function loadConfig(path: string): string {
  const raw = fs.read(path)
  if raw is IoError {
    print("config unreadable (errno " + raw.code.toStr() + "): " + raw.msg)
    return "{}"                 // fall back to defaults
  }
  return raw                    // `raw` narrowed to `string` here
}
```

**Propagation chain — the "ladder" this doc wants to sugar later.** Each fallible
call is an `is`-check plus an early return of the *same* error value:

```vl
function loadAndParse(path: string): Config | IoError | ParseError {
  const raw = fs.read(path)
  if raw is IoError { return raw }          // re-raise unchanged
  const cfg = parse(raw)                    // parse: (string) => Config | ParseError
  if cfg is ParseError { return cfg }
  return cfg
}
```

**Mixing with `??` and `?.` (the `T | null` layer).** Absence and reasoned
failure compose — narrow the error first, then use null-sugar on what remains:

```vl
function port(path: string): i32 {
  const raw = fs.read(path)
  if raw is IoError { return 8080 }         // reasoned failure → default
  // `raw: string` here. `settings(raw): Map | null` is the ABSENCE layer;
  // `?.`/`??` handle it without any `is`-check.
  return settings(raw)?.get("port") ?? 8080
}
```

**`match` over a literal-union error code.** When `E` is a *tag* rather than a
struct, phase-1 `match` dispatches it exhaustively:

```vl
type FsErr = "not-found" | "denied" | "io"

function explain(e: FsErr): string {
  match e {
    "not-found" => "no such file"
    "denied"    => "permission denied"
    "io"        => "device error"
  }
}
```

## Comparative survey

The owner asked what modern languages do. The honest tradeoffs:

- **Rust — `Result<T, E>` + `?`.** Errors are values in an enum; postfix `?`
  early-returns the `Err` arm, auto-converting via `From`. Ergonomic, exhaustive,
  zero-cost. Cost: `Result` is a *nominal generic* and `?` needs a conversion
  trait — VL has neither generics-over-error-types sugar nor traits today. **VL
  takes the substance (errors as values, early-return sugar) without the
  machinery**: our `T | E` union is Rust's `Result` spelled structurally, and
  VL's propagation is union-`as` (§Sequencing) rather than postfix `?` — it
  *names the wanted arm* (`x as T`) instead of the error arm, which suits a
  structural union with no nominal `Result` to hang a trait on.

- **Go — `(T, error)` multi-value returns.** Every fallible call returns a value
  *and* an error; `if err != nil { return err }` is the ubiquitous ladder.
  Honest, greppable, no hidden control flow. Cost: the `(nil, nil)` /
  `(value, err)` invalid states are representable, and it needs multi-value
  returns as a language feature. **VL rules this out** (§Alternatives): a union
  `T | E` is strictly better — it makes the invalid combinations *unrepresentable*
  and needs no new return mechanism.

- **Swift — `throws` / `try` / `do-catch`.** Typed-ish throwing with `try` at
  every call site (explicit) and `do/catch` to handle. Good visibility (`try` is
  mandatory). Cost: it *is* a second control-flow mechanism (unwinding), and the
  error type was untyped until recently. VL's `is`-check is Swift's `try` made a
  value test rather than an unwinding annotation.

- **Zig — error unions `!T` + `try`.** The closest match to VL's chosen shape:
  `E!T` is *a union of an error set and a value*, and `try` is exactly "unwrap or
  early-return the error." No exceptions, no allocation, exhaustive. **This is the
  model VL is closest to** — our `T | E` is Zig's `E!T` written with VL's
  general union syntax, and the chartered union-`as` (§Sequencing) is Zig's
  `try`, generalized: because VL's error side is *everything except the named
  arm*, `x as T` propagates the remainder without needing a distinguished error
  set.

- **Kotlin / TypeScript — unchecked exceptions.** `throw` any value; `try/catch`
  anywhere; nothing in the type signature says a function can fail. Maximally
  convenient to write, but the failure modes are *invisible at the call site* and
  the compiler can't force handling. **VL rejects this for v1**: unions put the
  failure in the type, which is the whole point.

Synthesis: the modern consensus has moved *away* from invisible exceptions
(Kotlin/TS) *toward* errors-in-the-type (Rust/Zig/Swift-`Result`-libs). VL's
unions already express that consensus; the only thing missing is the
early-return sugar every one of these languages provides (`?`/`try`).

## Alternatives considered and rejected

- **Go-style `(T, error)` multi-value returns.** *Rejected as redundant.* VL
  unions already encode "a value or a reason" in one type, and do it *better*:
  Go's shape admits `(value, err)` and `(nil, nil)` — invalid states a union
  makes unrepresentable. Adopting multi-return would add a language feature to
  get a strictly weaker error model.

- **Catchable `throw`/`try`/`catch` in v1.** *Rejected (deferred, not
  foreclosed).* It is a second, control-flow-escaping way to spell what `T | E`
  already spells as a value, and it hides failures from the type. The compiler's
  own diags-not-throw idiom (typecheck.vl ~:229) is the in-house proof the value
  model scales. `exnref` stays reserved for the async era (§Open).

- **A blessed nominal `Error` type.** *Rejected in favor of a named structural
  alias.* A nominal type would be VL's *first* nominal type and would need new
  `==`/subtyping rules. The structural alias gives the ergonomics (a name to
  match on) at zero type-system cost.

- **`Option<T>` / `Result<T,E>` as named generic types.** *Rejected as
  premature.* They would need generic-type exports (still being stabilized,
  std-design.md slice 2) and buy nothing over `T | null` / `T | E`, which the
  narrowing engine already understands natively.

## Sequencing / migration

**The design is committed now; the implementation is gated.** Per
`docs/internals/codebase-audit-2026-07.md` (Part II/III), a `T | E` with a
*struct* `E` is a **union-box-with-struct-member** representation — precisely the
rep family the Phase-2 rep rewrite is still burning down (R3b / R7). So:

1. **Now:** this doc lands as the decided direction. std stays total (D1):
   `std:fmt`/`std:array`/`std:test` never return `T | E`; failures trap.
2. **After R3b/R7 land** (the struct-in-union rep family is solid): fallible std
   APIs become buildable. `std:fs`/`std:io` ship `T | IoError` surfaces. This is
   an *implementation-order* constraint, not a paper blocker — std-design.md's
   D2 inventory already gates `std:fs` "on the error-handling design," and this
   is that design saying "yes, and here is the one rep prerequisite."
3. **Follow-up (charter below):** the `?` propagation operator, once real
   chains prove the ladder boilerplate.

`__trap__(msg)` can land independently of the rep work (it is a message + the
existing `__trap__`), and resolves OD2 whenever convenient.

### Chartered follow-up: union-`as` propagation

The propagation ladder (§Examples, `loadAndParse`) is one `is`-check + early
return *per fallible call*. VL removes it not with a Rust-style postfix `?` but
with **`x as T`** — the unified cast operator, which for a *union* operand
narrows-or-propagates:

```vl
// with union-`as`                   // desugars to
const raw = fs.read(p) as string     // const raw = fs.read(p)
                                     // if !(raw is string) { return raw }
                                     // raw: string  (the wanted arm)
```

`x as T` where `x: A | B | …` names the arm the caller *wants* (`string`); the
error is **everything except that arm** — no blessed `Error` type is needed for
the mechanism, because "not the wanted arm" *is* the error, structurally. When
the runtime value is not a `T`, the whole value **early-returns** from the
enclosing function. Minimal example (owner's):

```vl
function f(): i32 | string {
  let foo: i32 | string = 7
  let bar = foo as string   // foo is not a string → early-returns 7 to f's caller
  return "ok: " + bar       // bar: string, reached only when foo was a string
}
```

The checker enforces that the **propagated remainder** (`A | B | … minus T`) is
assignable to the enclosing function's declared return type. In `loadAndParse`,
`fs.read(raw) as string` propagates `IoError`, and `parse(raw) as Config`
propagates `ParseError`, both admitted by the `Config | IoError | ParseError`
return — the whole ladder collapses to two `as` casts. **Not v1**; trigger:
"once std:fs / parsing chains prove the ladder boilerplate" — after a real
consumer exists, not speculatively.

### The unified `as` principle

`as` is **one operator with one invariant: `x as T` always yields a `T`.** The
operand's *kind* determines how:

- **Numeric operand → convert.** The just-approved B2 casts: `f as i32` truncates,
  `i as f64` widens, etc., **trapping** on NaN / out-of-range. Numeric casts **do
  NOT propagate** — the trapping default is deliberate: a raw propagated `f64`
  would infect the enclosing signature's return type and carries *no error
  information* (which value? why?). A fallible numeric conversion instead composes
  through a user cast (extension 3b below), which *does* return a union and so
  *does* propagate.
- **Union operand → narrow-or-propagate.** As above: yields the named arm, else
  early-returns the remainder.
- **Unrepresentable → trap.** Anything `as` cannot honor at runtime traps (a bug).

One operator, one guarantee ("you get a `T`"), three lowerings selected by the
operand type. This is what lets fallible parsing (§Extensions) read `s as i32`
with propagation and lossy numerics read `f as i32` with a trap — same syntax,
the operand decides.

### Future extensions (design sketches — not chartered, open questions)

- **(a) `as!` — assert instead of propagate.** `x as! T` narrows or **traps**
  (rather than early-returning) when `x` is not a `T` — the "I know this is the
  arm; a miss is a bug" form, usable in `main`/top-level where there is no caller
  to propagate to. Possibly a bare `x!` shorthand for the `T | null` case
  (`x!` ≡ `x as! (T where the null arm is dropped)`). *Open:* is `as!` worth it
  over an explicit `if !(x is T) { __trap__(...) }`?
- **(b) User-defined cast functions — `as(self: A): B`.** A UFCS-style operator
  overload: defining `as(self: string): i32 | ParseError` makes `s as i32`
  resolve to it. The composition is the payoff: a user cast returning
  `i32 | ParseError` + union-`as` propagation gives **extensible fallible
  parsing** for free — `s as i32` propagates `ParseError` with *zero* extra
  language machinery, because the user cast's union result feeds straight into
  the narrow-or-propagate rule. *Open:* resolution/overload rules; ambiguity with
  builtin numeric casts.
- **(c) `is?`-style "castable" pre-check.** A boolean "would `x as T` succeed?"
  test (`x is? T`) for callers that want to branch rather than propagate. Listed
  as an open question only — `x is T` already covers the union case; this matters
  mainly once user casts (b) exist.

## Open questions for the owner

- **O1 — bless the model?** Errors-as-values via `T | null` / `T | E`, no
  catchable throw in v1. (The load-bearing decision; everything else follows.)
- **O2 — `exnref` reservation.** Confirm wasm exception handling is *reserved for
  a possible async era*, not foreclosed and not v1. Async/await (B12) + streams
  are where a stack-unwinding primitive might earn its keep.
- **O3 — error shape.** `IoError = { code: i32, msg: string }` as a named
  *structural* alias (convention-with-a-name), vs any other shape. Is `code`
  (raw WASI errno) + `msg` the right two fields, or add a `kind` tag?
- **O4 — trap-with-message.** ~~Adopt `panic(msg)`?~~ **Ruled (2026-07):
  extend `__trap__` with an optional message instead — no new intrinsic name
  (VL keeps intrinsics dunder-only, on purpose), no keyword. Resolves
  std-design.md OD2.**
- **O5 — union-`as` propagation charter.** Accept union-`as` (`x as T` narrows or
  early-returns the remainder) as the chartered propagation mechanism under the
  unified `as` principle (numeric casts convert-and-trap, do not propagate) —
  gated on real fallible chains, not v1. Sub-questions to rule on:
  - **Return-type obligation.** The checker requires the propagated remainder
    (`A | … minus T`) be assignable to the enclosing function's declared return
    type. Require it spelled (leaning) vs infer it into the signature?
  - **Propagation out of a lambda.** `as` inside a lambda early-returns to the
    *lambda's* caller, so the *lambda's own* return type must admit the
    remainder (not the outer function's). Confirm.
  - **No-caller context.** union-`as` in `main`/top-level has nowhere to
    propagate. Proposal: **compile error**, directing the author to `as!` (trap)
    or an explicit `is`-check.
  - **Non-arm target.** `x as T` where `T` is *not* an arm of `x`'s union is a
    **hard type error** (not a runtime miss). Confirm.
  - **Narrowing-state interaction.** After `let bar = foo as string`, `bar:
    string` (the narrowed binding); `foo` is **unchanged** (still `i32 | string`).
    Confirm this over auto-narrowing `foo` itself.
- **O6 — future `as` extensions.** Directional sign-off (not v1) on: (a) `as!`
  assert-or-trap (+ possible bare `x!` for `T | null`); (b) user-defined casts
  `as(self: A): B` composing with propagation for extensible fallible parsing;
  (c) `is?` castability pre-check (open question only).
- **O7 — sequencing.** Confirm fallible std (`std:fs`) is sequenced *after* the
  R3b/R7 rep family, per the audit.
