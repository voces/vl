# Step 7: the annotated return kind off the descriptor, and what stands

Measured 2026-11-08 on a 4-core box, master `4a1d010d`. Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,736 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,736 same; 0 bytes-only, 0 output movers |
| seed bytes | 6,579,801 | 6,578,905 (−896) |
| L2 self-compile fuel | 78,628,117,544 | 78,555,381,966 |
| rep-fuzz | exact | exact |

## The annotated return kind

`buildFnMapRowOfRetAnn` now seeds `fRetKind` from `vtKindOfType(ann)` and not from
`retAnnKindChain`. That changes the kind of every annotated `i64[]`, `u8[]` and variant return
(#6888 counted 2,435 programs that disagree), and no reader moved: the sweep is all same, with
0 bytes-only movers. The kind is one of the column readers' inputs, and every reader that cares
reaches the annotation or the slot column itself. Deleted with the chain: `retStrFlag`,
`retListKindFlag`, `retTRFlag`, `retArrFlag`, `retStrArrFlag` and `retF64ArrFlag`, which only
the chain read, plus `retF32ArrFlag` and `arrElemRep`, which nothing read.

The columns themselves stand. An un-annotated row's columns are `fnRetColsFromRecorded`'s, and
its second walk still answers the named missing-fact classes, so a reader cannot yet ask
`repOf` of the recorded result alone. `fRetStructIdx`, `fRetRArrElem` and `fRetBool` carry what
the descriptor does not: the variant index, the ref-list row name, and bool versus i32.

## The name maps

`fnIndexOfNode` (30 callers) now answers from `identDeclOf` first. An ablation that took the
declaration ahead of the old answer, and the clean form, were each all same. The by-name walk
stays as the fallback, so `fnIndexBySid` and `nestedNameBySid` stand. What reaches them: 6
`fnIndexOf`, 4 `fnIndexOfSid`, 10 `fnIndexOfAt`, 25 `fnIndexOfInScopeAt`, 3
`fnIndexOfInScopeChainAt` and 1 `fnIndexOfInScopeSid` call sites, plus the fallback.

## `collectA#2`

This is not attempted here, and here is its size. `mAssignTypeIndices` hands out every
heap-type index before the type section is written, and the type section is written before the
import, global and code sections, into one stream. First-use order therefore needs those
sections built into their own buffers and the type section assembled last. The walk and its
helpers (`collectAResetTables` … `collectAArmFieldNeeds`) are 866 lines. The flags it sets are
read at 289 sites: `aUsed` 77, `ba8Used` 40, `lUsed` 29, `slUsed` 26, `fa64Used` 25,
`ia64Used` 24, `mUsed` 23, `fa32Used` 21, `rlUsed` 15 and `raUsed` 9.
