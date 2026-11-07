# The canonical instance key, measured

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### The canonical instance key, measured (2026-11-05, master `82069a442`)

The switch derives mono's instance key from the elaboration, not from mono's own spelling. Each
instance `monoMakeInstance` built was recorded with its elaboration key (`monoKeyEk`), over every
`tests/cases` file with a fixpoint seed: 13,046 instances in 2,415 files, 12,919 of them keyed.

- **Callback specialization (96 groups).** Mono keys an instance by the function value it is handed
  (`@inc`, `@__lambda_3`), so the call inside is direct. One elaboration key, several instances. The
  elaboration has no such dimension; the key keeps it as its own component.
- **One elaboration key, several mono keys besides specialization (15 groups).** Under the key
  below, 9 differ by their specialization value once mono's `(()=>i32)` / `()=>i32` spelling is read
  as "unspecialized" / "specialized". 2 are one nested generic instanced per enclosing instance
  (`shadowOther`'s `inner`, marker `^20`), whose copies read different environment structs: the
  parent component. 2 are a check-reject fixture's. 2 are true duplicates with identical bodies
  (`deliver` in `closures/generic-returned-record-param.vl`, `F$m…` in
  `generics/instance-call-of-literal-union-field-function.vl`), which the key merges with no change
  in output.
- **No elaboration key (127 instances).** 109 are their template's only instance (46 lambdas, 41
  hole-parameter functions solved closed, 22 annotated functions at one storage row): the
  declaration is the key. 4 are two hole-parameter functions instanced twice at one literal-union
  type (`elem`, `glob` in `generics/type-param-write-literal-union-at-pin.vl`, `K|null` against
  `K|null#litK`), with identical bodies: duplicates. The other 14 are the gap: 7 annotated,
  non-generic functions each instanced at two storage rows (`take` at `{f: i32 | null}` and at
  `{f: i32}`, in the `soundness/built-container-*` and `fresh-literal-handed-back-wider-*` fixtures).
  Their rep is already a checker fact: `recArgRepNote` records the row a built-container read
  handed to an annotated parameter is stored at (D14532), and `monoPinAnnotatedParam` pins at
  `recArgRepOf` of the argument, else the annotation. The key's rep component is therefore
  `callArgRepTy` for a generic call and `recArgRepOf`, else the parameter's declared type, for a
  non-generic one: no fact is missing.
- **One spelling, several keys (26 groups).** One generic returned by different functions;
  `elabInstSpelling` omits the parent, so the key carries it.

The per-parameter comparison (`callArgRepTy` against mono's pin, 37 pairs) found no pair where mono
is nearer the wasm than the elaboration. The key is therefore: the elaboration key (or the
declaration), the parent key, the rep row of each parameter with union members in canonical order
and a literal union named by its rep, and the callback specialization.

**Callback specialization is mono's component of the key** (coordinator ruling, 2026-11-05). The
elaboration owns what an instance means: its type and its rep. Specializing an instance on the
function value it is handed makes the call inside direct and changes no meaning, so it is a
code-generation choice and mono's to make. The key is (elaboration type and rep, the parent where
the spelling omits it, the specialization value or none); the 96 groups above are its evidence.
The condition: one predicate decides "specialize this call on this value". Today that is
`monoSpecializableCallbackName`, but each of its two callers gates it differently. The generic
instance key (`monoMakeInstance`'s `cbFnNames`, suffix `@name,`) skips a callee read through a
written binding (`viaWritten`). The non-generic specialization (key `C<fe>@name`) has its own
assignment check (`monoReadIsAssigned`). Those gates move into the one predicate before the switch.

**The pin-implied canonical binding against the key's binding** (2026-11-07, 23,384 programs).
`monoPinnedTyParamCanon` names the binding the pins already imply, so an explicit type argument
that repeats it is dropped from the key text. Against `tyCanonKey` of `ekTys` at the call's key:
agree 4,752 programs, differ 231, mono only 101, elaboration only 144. The differences are names,
not values: an alias or a literal union against its base (`i32` against `Id`, `i32` against
`(0|1|2)`) and a structure against its record (`{r: i32 | null}` against `J`, `{y, x}` against
`V`). `tyCanonKey` keeps those apart, so switching the dedup would merge or split instances; it is
an input to the key above, not a value decision, and stays mono's until the key settles names.
