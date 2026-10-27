# A synthesised TypeRef's name, measured against its type

This note hands off one question to the row-key work (`rowKeyOf`): can the emitter's
synthesised `TypeRef` take its `tyName` from its type id (`tyToEmitName(tyIx)`), so that the
stored name stops being a second record of the type? The answer today is no. This note gives
the measurement behind that answer and names each string reader that blocks it, together with
the row-key fact that would replace each one.

## What has landed

`synthTypeRefTy(name, pos, tyIx)` (`compiler/emit_nullable_rets.vl`) gives the node it mints
the spelling tree of `tyIx`. It uses `tyTsExact` (`compiler/check_annot_resolve.vl`), which
returns `tyToTs(tyIx)` only when that tree resolves back to `tyIx`, and -1 otherwise. The
split-function lane copy in `compiler/fn_split.vl` (`fsApply`) carries the source annotation's
tree onto the `TypeRef` it re-mints. Both changes are byte-identical over 17,044 files. The
node's `tyName` is unchanged: it is still the string the caller passed.

## The measurement

**Method.** A temporary probe on `synthTypeRefTy` logged one line per call. It was flushed
through `emitFail` at the end of `emitProgram`, and the probe was then removed. For each call
it compared three things:

* the passed `name` against `tyToEmitName(tyIx)`;
* the type `nameToTy(name)` gives, against the type the tree resolves to;
* that tree type against `tyIx`.

**Population.** 17,044 programs: the distilled corpus (10,395) plus `tests/cases`. 4,949 of
them reach `synthTypeRefTy`, for **18,059 calls**.

| calls | name vs emit name | tree vs `nameToTy(name)` | tree vs `tyIx` |
| --- | --- | --- | --- |
| 15,937 | equal | same type | same type |
| 1,359 | differ | same type | same type |
| 133 | (99 equal, 34 differ) | different type | same type |
| 36 | (22 equal, 14 differ) | different (25) or same (11) | tree misses `tyIx` |
| 594 | `tyIx` is -1, so nothing to compare | | |

**The 15,937 calls** already pass a name that equals the emit name, and the tree agrees with
both. For these, deriving the name from the type would change nothing.

**The 1,359 calls** pass a nominal name where the emit name is structural. Examples are
`Circle[]` against `{r:{c2:i32}|{s2:i32}}[]`, `P|null`, `{[string]:Circle}`, and alias names.
The type is the same; the spelling is not. A second probe over the 781 files that hold these
calls logged 1,407 such calls and asked which type render reproduces each passed name:

* 905 calls match `tyToStr(tyIx)` exactly.
* 482 calls match no render. These are tight-spaced nominal spellings, such as
  `{[string]:((i32)=>i32)}` and `C|S`, and alias names (`V`, `Pet`, `Shape`, `K`) that no
  type id carries.
* 13 are `#anon<n>` names, or literal-union names that `tyToEmitName` renders as
  `string`.
* 7 are `$fnsig` keys, such as `=>i>i` and `=>>i|i32`.

**The 133 calls** pass a name that `nameToTy` resolves to a different type than `tyIx`. The
tree is right and the name is not. Examples are `i32|null`, `{[string]:boolean}` and `i64|i32`.
The stored string is a name that disagrees with its own type.

**The 36 calls** are cases where the tree does not round-trip to `tyIx`:

* `u8`: 13 calls. `tyToTs` and `tsToTy` disagree on it.
* Literal-union-with-`null` lists and fields: 9 calls, for example `("x" | "y"|null)[]`.
* A list of two nominal records that join as one: 2 calls.
* TyVar-bearing types whose emit name is empty: 12 calls, for example `((T)=>void)[]`, `H[]`,
  `never`, `{m: {[string]: (_) => _}}`.

`tyTsExact` gives -1 for every one of these 36 calls, so these nodes carry no tree.

**The 594 calls** with no type id are:

* `void`: 120 calls. `TY_VOID` is -1.
* Extern-parameter strings from `extParTys`.
* Struct names read from `sNames`.

These come from the `compiler/emit_rewrite.vl` callers. None of them has a type to take a name
from.

## The trial that broke

Setting the node's `tyName` to `tyToEmitName(tyIx)` changed the output of 11 files in the
2,421-file gate population, and 7 of them stopped building. Each break is a string-keyed reader.

| reader | keyed by | what broke | row-key fact that replaces it |
| --- | --- | --- | --- |
| `unionHasRefArrayArmSlot(name, slot)` (`compiler/emit_union_atoms.vl`); callers in `compiler/wasmEmit.vl` | the canon or nominal union spelling | emit refusal `array value does not match any array member of the union` | the union's member-set row, keyed by type |
| literal-union locals, for example a pin at `LS` | the alias name; `tyToEmitName` gives `string` | invalid module (`generic-call-local-at-literal-union-pin.vl`) | the litunion atom row reached from the type, not from its spelling |
| `$fnsig` key readers (`compiler/emit_sig_tokens.vl`) | the key string read back from `tyName` (`=>i>i`) | invalid module (`mono-closure-value-forwarded-pin.vl`) | `sigKeyOfTy(tyIx)` as the row key. `compiler/emit_nullable_rets.vl` cannot import it today: the import closes a cycle |
| `variantIndexOf(name)`, `structIndexOfTypeNameTy(name, ty)`, `isSName(name)`, `nameIs*Array(name)` (`compiler/emit_classify.vl`, `compiler/emit_sig_tokens.vl`) | the nominal name | structural names are not registry keys | the struct or variant row of the type |
| alias carriers (`V`, `Pet`, `Shape`) | a name no type id holds | no render reproduces it | an alias row: a type id does not record which alias spelled it |

The files that changed or stopped building were in the closures, functions and generics
suites, for example `if-join-two-list-types-union.vl`, `union-alias-pin-eq-needle.vl` and
`pin-explicit-type-argument-union-member.vl`.

## Canon re-parses in `compiler/check_program.vl`

The canon pass hands back strings, and its own callers parse them back into types:

* `unionMemberGenAppShape` re-parses a generic-application member name to reach its emit name.
* `canonEmitNameOfTy` re-parses the canon text to test whether it is a `TyObj`.
* `canonBankTyOf(spelling, c)` re-parses both the spelling and the canon text.
* The record-duplicate check re-parses the name for `tyIsTwinRecordUnion`.
* `canonSameShapeRecord` re-parses the joined kept atoms.

**Proposal; not built.** The canon pass returns pairs of atom text and arena type, plus the
joined union's type. Each site above would then read the type it currently re-derives, and none
of them would call `nameToTy`.

## What can be deleted, and when

No string build in `synthTypeRefTy`'s callers can be deleted yet: every reader in the table
above still needs the name. `nameToTyReal`'s string parse has to stay for the same reason, and
the canon re-parses add to them.

Once those readers key on rows, the node's `tyName` can come from the type. At that point the
133 calls whose name disagrees with its type stop being a question, because the name is no
longer separate from the type.
