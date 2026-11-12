# Step 7, L6: the spelling-keyed registries, and `sNameIx`'s contract, 2026-11-12

The L6 exit asks each spelling-keyed registry to be re-keyed by type or to carry a contract.
`vl run scripts/registry-census.vl` on master `8bd438de` lists 76 string-keyed registries. Census 5
(`2026-11-12-step7-closing-census-5.md`) grades 5 of them as keyed by a type's spelling:

| registry | owner |
| --- | --- |
| `instKeyFirst`, `monoTypedKeys`, `monoKeyEk`, `monoKeyPins` | lane D, mono's instance keys |
| `sNameIx`, the index behind `structIndexByName` | lane B, this note |

`sitnMemo` went with `structIndexOfTypeName` (#7546). `cloSigPosBy` is keyed by rep tokens
(#7646).

## `sNameIx`'s readers

`structIndexByName` is `sNameIx`'s only reader. Its call sites on master, by what their key is:

| site | its key | grade |
| --- | --- | --- |
| `retStructRowIndex`'s `#anon` rung, `anonPinRow`, `anonRowTyOfName`, `monoAnonRowListTy` | an `#anonN` handle | the handle contract (coordinator, 2026-11-12): a row id rendered as text; exit when lane F's D6 carries row indices |
| `monoElabCompositeTy` | a type parameter's identifier, tested for shadowing a declared record | an identifier, not a type spelling |
| `rowDumpBuild` | a declared type's name | a diagnostic that reports the contract |
| `rlElemStructRow` | a ref-list element's spelling | passes under lane F's accepted contract: a function-value-set row is keyed by its set (#7636; D15804, D15552, D15922) |
| `utkAtomText` | a union atom's spelling | lane G: convert or contract (asked 2026-11-12) |

`structRowOfSpelling` was the last of lane B's spelling readers. #7687 deleted it with `isSName`
and `spellingHasStructRow`; its one site now tests the `#anonN` handle exactly.

Lane B's name producers that read it as a type spelling (`structRowOfNameTy`,
`structIndexOfTypeNameTy`, `repStructRowByName`, `rowCanonIdOfName`, `structRowOfSpelling`,
`armFieldStructRow`) are converted or deleted: #7615, #7662, #7671 and #7687.

**Contract:** `sNameIx` maps a struct row's own name to the row. A row's name is an identifier
(a declared record's name), or an `#anonN` handle an object literal's mint gave it. Neither is a
type spelling. Lane F's `rlElemStructRow` reads it under F's own contract. Lane G's `utkAtomText`
is the last site that reads it with a spelling; once G converts it or states its contract, this
contract carries no exception. When lane F's D6 carries row indices, the handle readers become
index reads too.

## The open row in a true instance

The one program where `sLitMintRow` builds a row with a type-parameter field inside a true
instance (`closures/two-returns-records-of-hole-fns-field-called.vl`, handed over by lane H) is
filed as [D16010](../inventory/D16010.md). Its status is runs today and must keep running.
The checker records no elaborated type for the literal in the instance (`elabNodeTyAt` is -1), so
row selection has no closed type to key by. A rung reading one is byte-identical over the
sweep, because it never answers. The fix is checker-side, after step 7.
