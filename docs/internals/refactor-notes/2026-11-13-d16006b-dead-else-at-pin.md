# D16006(b): a deferred demand under an emptied `is` remainder is vacuous at the pin

**Change.** `gnotDeadAtPin` (`compiler/check_relate_core.vl`) walks a constraint's type through
`HD_FLD` rows to an `HD_GNOT` remainder and answers true when every member of the pinned base is
assignable to the tested type. `validateBinCstrs`, `validateMemCstrs` and `validateArgCstrs` skip
such a constraint. Before, `subtractTy`'s empty result fell back to the whole pin, so the dead
`else` arm's demand was checked against a type the arm never sees, while the instance elaboration
already dropped the same arm's diagnostics.

**Position matrix** (un-annotated / annotated `i32 | string` control):

| position | before | after | annotated |
| --- | --- | --- | --- |
| operator `p + "!"` | refused at `take(4)` | `5 s!` | `5 s!` |
| argument `needStr(p)` | refused | `5 s` | `5 s` |
| return `p.length` | refused | `5 3` | `5 3` |
| forwarding caller | refused | `5 s!` | — |
| field read `p.y` | refused | `5 yy` | `5 yy` |
| single pin `take(4)` | refused | `5` | `p: i32` refuses — D16006(a) |

A live `else` arm is still refused (operator, argument, field), and
`tests/cases/soundness/hole-is-guard-alternative-reject.vl` keeps its three refusals.

**Consequence.** A hole parameter's dead arm is now unchecked; the annotated `p: i32` spelling
still refuses until the owner rules on D16006(a).
