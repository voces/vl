# emit_mono.vl — who decides a function-holding slot's storage (inventory, master @ 498e6419+, 2026-11-14)

Read-only survey. Line numbers are `compiler/emit_mono.vl` unless noted; length is inclusive line count
from a scratch call graph of every top-level function (each runs to the next top-level `function`). Callers/elab-calls/D-ids are extracted mechanically (D-ids = those in the
function's leading comment block or its inline comments); holder, fact and status are read from the code.

**Status vocabulary (column "elab facts read → status")**
* **FULL** — the elaboration already has the whole answer; mono only re-keys it or copies it into syntax.
* **CHECK** — elab has the full answer and it is what mono writes, but mono re-derives it and refuses on disagreement.
* **PARTIAL** — mono takes the elab fact first and falls back to / overrides it with its own derivation (named).
* **NONE** — no elaboration fact; mono derives it (named source).
* **consumes** — a pure output stage: takes a type its caller decided and writes it.

Total: **113 functions, ~4,278 lines** (112 top-level functions + the `=`-store arm of `monoWalk`, L22783–22890).
By status: NONE 42 fns / 1,408 L · FULL 30 / 721 · PARTIAL 29 / 1,901 · consumes 9 / 195 · CHECK 1 / 22 · other 2 / 31.

Note on D-ids from the brief: `D16200`, `D16162`, `D15940` are cited in emit_mono comments only once
(`D16162`, L15714 in `monoPinStoredRecords`). From `git log`: D16200 (#8026) changed `monoRetypeMapReads`
(loop variable over a map of maps) + `monoReadIsBinding`; D16162 (#8028) `monoPinStoredRecords`; D15940
(#8020) was closed **in `emit_elab.vl` only** (map-cell deliveries) — the mono refusal it hit
(`monoPinMapValues` "stored functions close at another type than its slot fact") stays as a cross-check.
Other recent spelling fixes: D16121 (#8018/#8023) `monoPinMapSlot`/`monoLetWholeWrites` (+ elab
`elabPushRecvDecl`, `elabSlotAliasOn`); D15943 (#8008) `monoCloseMapListLits`; D16161 (#8005), D15941 (#7995)
`monoPinMapSlot`; D15925 (#8007) `monoCoerceRetAtPin`.

Entry points into this machinery: `monoWalkLetDecl` (L22974: `monoPinListElems` → `monoPinRecordFields` →
`monoPinFieldContainers` → `monoPinMapValues`, then `monoCoerceFnValue(n.letInit, n.letType)` which reads
the just-synthesized `letType`), `monoWalk` (returns: `monoCoerceRetAtPin`/`monoPinReturnedObj`/
`monoPinReturnedList` L22770–22773; `=` stores L22783–22890; push L22679), `monomorphize`
(`monoSlotRecordsApply`, `monoPinLamAtDelivery`), `monoPruneTemplates` (cells, stubs).

### F1. Slot pin resolution — the closed fn type / pin key a slot is delivered at

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoDeclPathKeysIn` | 16801 | 39 | any slot path (`e`/`v`/`f.<n>`) of a binding or literal / every delivery (reads' destinations, calls through reads) | the distinct param-signature pin keys of the closed fn types elab delivers the slot at (or, with `rets`, the results annotated returns deliver); PIN_DECLINE when the slot is per-instance and no instance given | pin keys + their fn types (pure) | [elabKeyAt, elabSlotAnnRets, elabSlotDeliveries, elabSlotPerInstance] FULL: re-keys `elabSlotDeliveries`/`elabSlotAnnRets` into pin strings; dedup by param spelling is mono's | monoDeclPathKeys, monoDeclPathPinsPerInstance | — |
| 2 | `monoDeclPathKeys` | 16776 | 20 | as above | `monoDeclPathKeysIn`, retried at the frame's instance template when declined | pure | [—] FULL | monoBindingAtPin, monoCallWrittenLet, monoDeclPathPins, monoPinListElems, monoPinRecordField, monoSlotPinNameTys, monoSlotRetCount, monoSlotRetName, monoStoredSlotFnTy | — |
| 3 | `monoDeclPathPins` | 16770 | 6 | written `let` slot | pin keys only | pure | [—] FULL | monoHoleGenFnPin, monoIfBoundRetAtPin, monoNoteRetCopyRead, monoPinNestedListElems, monoRetSlotsSplit, monoSlotSigName | — |
| 4 | `monoDeclPathPinsPerInstance` | 16796 | 5 | binding slot in a generic | whether the slot's pin differs per instance | pure | [—] FULL (`elabSlotPerInstance`) | monoPinListElems | — |
| 5 | `monoSlotDeliveryTy` | 14429 | 22 | binding slot / all deliveries | the ONE closed fn type elab delivers the slot at (optionally omitting calls the flow rewrite repointed) | pure | [elabKeyAt, elabSlotDeliveries, elabSlotDeliveriesOmitting, elabSlotPerInstance] PARTIAL: elab list is the answer; the omit set `mfrSetCalls` is mono's flow-rewrite output passed into `elabSlotDeliveriesOmitting` | monoCoerceWrittenCell, monoPinListElems, monoStoredSlotFnTy | — |
| 6 | `monoFlowSlotPins` | 12880 | 17 | binding slot | pin keys of deliveries left after omitting calls the flow rewrite pointed at a generic | pure | [elabSlotDeliveriesOmitting] PARTIAL: same omit-set dependency on `mfrSetCalls` | monoPinListElems, monoStoredSlotFnTy | — |
| 7 | `monoFlowHeldOneGen` | 12971 | 11 | binding slot | whether every fn the slot can hold is one generic (so no slot pin is needed) | pure | [elabSlotHeldFns] PARTIAL: `elabSlotHeldFns` + mono's `mfrGen`/`monoFlowLeafGen` | monoPinListElems | D9791 |
| 8 | `monoStoredSlotFnTy` | 15935 | 69 | slot of a binding (map value, list element, record field of stored records, returned literal) / `m[k]=`, `set`, push, stored literals | the one fn type the slot is built at, every stored value instanced there | instancing (`monoCoerceFnValueTys`), delivery note, `monoPinWrittenLam` refusal, nodeTyRecord via `monoRecordOpen`, internal `emitFailAt` when one pin but no delivery type | [elabSlotUncalled, elabSlotUncalledOmitting] PARTIAL: base `monoSlotDeliveryTy`; uncalled → `elabUncalledSlotTy`; >1 pin → narrowed by flow-rewrite pins; no pin on an instance copy → template's slot (`nodeSrc`); then OVERRIDDEN by the values' own results at the pin params (`monoValsOwnFnTy`) | monoPinFieldContainer, monoPinListElems, monoPinMapSlot, monoPinStoredRecords, monoRetLitElemTy | — |
| 9 | `monoStoredSlotDecline` | 15836 | 7 | — | maps a `monoStoredSlotFnTy` miss to refuse(-1)/decline(0) | — | [—] n/a | monoPinListElems, monoPinMapValues | — |
| 10 | `monoValsOwnFnTy` | 14482 | 12 | values delivered to a slot | the one fn type the values' own results give at the pin's params; -2 on disagreement | pure | [—] NONE: checker types of the values (`monoValueAtAnnTy`) | monoPinListElems, monoStoredSlotFnTy | — |
| 11 | `monoListStoresAgree` | 14451 | 31 | list element / literal, re-points, `xs[i]=` | whether all stored fns agree on one result at the pin's params | pure (gate) | [—] NONE: values' own checker types | monoPinListElems | — |
| 12 | `monoPinFnParamTys` | 24258 | 21 | binding slot | param types of the delivery whose pin key is `sig` | pure | [elabSlotDeliveries] FULL (`elabSlotDeliveries`) | monoCallWrittenLet, monoPinRecordField, monoSlotPinAnn, monoSlotPinNameTys | — |
| 13 | `monoSlotPinNameTys` | 24191 | 19 | binding or literal slot | the pin SPELLING (`(p)=>r`) a value delivered to the slot is instanced at; return from annotated returns else `void` | spelling string + param tys | [—] FULL facts (via `monoDeclPathPins`, `monoSlotRetName`); spelling is mono's | monoCallIfBound, monoCellPinNameTys, monoCoerceLitPart, monoCoerceRetAtPin, monoDeliverLitAt, monoIfBoundRetAtPin, monoPlacePinNameTys | D9381, D9431 |
| 14 | `monoPlacePinNameTys` | 24173 | 18 | place `x`, `x[i]`, `x.f` / `=`, index store, push | the pin spelling for a value stored into a place | spelling | [—] FULL after mono resolves the place expression to (decl, path) itself | monoNotePushDeliveries, monoWalk | — |
| 15 | `monoCellPinNameTys` | 22166 | 11 | capture cell element `cell[0]` / write | pin spelling the cell is called at | spelling | [—] FULL after mono's cell resolution | monoWalk | — |
| 16 | `monoSlotSigName` | 24241 | 8 | slot | pin spelling keeping a fn-value pin as its wasm signature (hole-lambda closure sig) | spelling | [—] FULL | monoBindingAtPin | — |
| 17 | `monoSlotRetName` | 24249 | 9 | slot | the one result annotated returns give the slot, else `void` | spelling | [—] FULL (`elabSlotAnnRets` via keys) | monoSlotPinNameTys, monoSlotSigName | — |
| 18 | `monoSlotRetCount` | 24936 | 12 | binding | how many distinct results annotated returns pin | pure | [—] FULL | monoCoerceRetAtPin, monoNoteRetCopyRead | — |
| 19 | `monoSlotPinAnn` | 24210 | 31 | slot pin of a binding frame | the fn-type spelling a pin names, from its closed param types | spelling; `emitFail` when unspellable | [—] NONE directly; consumes `monoPinFnParamTys` (FULL) | monoSlotPinNameTys | D9381, D9431 |

### F2. Uncalled slot — the type an uncalled slot holds its fns at, and stubbing

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoUncalledSlotFnTy` | 16004 | 22 | slot nothing calls (list element, nested element, map value) | the type an uncalled slot holds its fns at; values not instanced, served by the uncalled stub | writes BACK into elab (`elabValueSlotNote`), `monoReachNote` | [elabUncalledSlotTy, elabValueSlotNote] FULL (`elabUncalledSlotTy`) | monoPinNestedListElems, monoStoredSlotFnTy, monoUncalledListElems | D9063 |
| 2 | `monoUncalledListElems` | 14390 | 33 | un-annotated list / literal init, `xs[i]=`, push | list annotated at `[uncalled ty]` | annotation `letType`, nodeTyRecord on init/elements, `monoRecordOpen` on pushed | [—] FULL (fact); the delivered-value set is mono's own enumeration | monoPinListElems | D9100 |
| 3 | `monoSpreadHostInert` | 14371 | 19 | list literal that spreads lists / spread | whether a spreading literal of inert values takes its spread lists' type (no pin needed) | pure (gate) | [elabValueSlotUncalled] PARTIAL: `elabValueSlotUncalled` + mono syntax checks (unwritten, no push) | monoPinListElems | D9100, D9482 |
| 4 | `monoLamStoredAsElement` | 26291 | 58 | lambda bound by a `const` and named as a list/cell element | whether every list holding it is bound to an unread name, so it can be stubbed | pure → feeds `monoStubSlots` | [—] NONE: mono name search (`monoFrameNameUnread`) | monoPruneTemplates | D3851, D3864 |
| 5 | `monoUnreadLamSlots` | 26475 | 18 | hole lambda initializing an unread `const` | which lifted slots are stubbed (i32-default param never validated) | slot list → `monoStubSlots` | [—] NONE: mono name search | monoPruneTemplates | — |

### F3. Container-binding storage — the closed type an un-annotated fn-holding list/map/record binding is built at

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoPinListElems` | 13855 | 191 | un-annotated list `let`/`const` / literal init, re-point to list literal, `xs[i]=`, push, spread (declines), slice | the closed fn type of the list's element slot (or, for a list of maps, the whole list type) | annotation `letType`; nodeTyRecord on init, elements, re-points; instancing of elements/writes/re-points/pushed; delivery note for hole lambdas; read retype (`monoRetypeSlotReads` per instance, `monoRetypeMethodReads` for `pop`, `monoRetypeMapReads`); refusal `monoGenericListFail` | [elabNodeTyAt, elabSlotTyAt, elabSlotUncalled, elabSlotUncalledOmitting, fnTagListTy] PARTIAL: element type = `monoSlotDeliveryTy` (elab deliveries), else `elabSlotTyAt([e])`; OVERRIDDEN by elements' own results (`monoValsOwnFnTy`); two pins resolved by flow-rewrite tables (`mfrSetCalls`, `mfrSpreadDone`, `mfrSliced`, `mfrRepointed`); empty list filled by push → `monoStoredSlotFnTy` over pushed args. Does NOT annotate with `elabSlotTyAt(at, [])` for the fn-list case | monoWalkLetDecl | D10082, D6602, D9173, D9441, D9595, D9660 |
| 2 | `monoPinNestedListElems` | 14046 | 75 | list of list literals, written nowhere / literal init | the inner element's closed fn type | annotation; nodeTyRecord on init, inner lits, elements; instancing | [elabSlotTyAt, elabSlotUncalled, elabSlotUncalledOmitting] PARTIAL: `elabSlotTyAt([e,e])` when exactly one pin; fallbacks: elements' `const` bindings' mono-written annotations (`monoBoundFnListElemsTy`), uncalled type | monoPinListElems | D9140, D9173, D9661, D9662, D9711 |
| 3 | `monoBoundFnListElemsTy` | 24815 | 37 | list literals whose elements read `const`s | the one list-of-fns type the element consts were annotated at | nodeTyRecord on reads (`monoRecordInstOpen`) | [elabSlotTyAt] PARTIAL: reads mono's OWN earlier `letType`, cross-checked/replaced by `elabSlotTyAt(dx)` | monoPinNestedListElems, monoRetLitElemTy | — |
| 4 | `monoPinMapValues` | 15219 | 22 | un-annotated `const`/`let` map / `m[k]=`, `set`, whole writes | the map's type | annotation `letType` = elab fact; refusal `emitFail` ("stored functions close at another type than its slot fact" — D15940's message) | [elabSlotTyAt] CHECK: elab (`elabSlotTyAt(at,[])`) has the full answer and is what is written; mono re-derives via `monoPinMapSlot` and refuses on disagreement | monoWalkLetDecl | D4579, D9101 |
| 5 | `monoPinMapSlot` | 15402 | 265 | map initializer or a record field's map (`fld`) / `m[k]=`, `m.set`, `d.f[k]=`, `d.f.set`; aliases: `const` bound to held binding, constant-index element, held literal's field, `let` written with held bindings, fns returning the map | the map type, chosen per VALUE SHAPE: fn → `monoStoredSlotFnTy`; list of lists → `elabSlotTyAt` whole; list of records / record → `monoPinStoredRecords`; stored call → `monoCloseRetFnTy`; list of fns → `monoStoredSlotFnTy(v.e)`; map of maps → stored maps' own closed type | nodeTyRecord on `mx` and alias inits; alias annotation `a.letType` (L15651); read retype (`monoRetypeMapReads` incl. `()` call results) | [elabSlotTyAt] PARTIAL: only the list-of-lists arm reads the elab fact whole; declines on `monoMapValueUnpinnedCall` (`?.` calls the flow table does not pin) | monoPinFieldContainer, monoPinMapValues | D9062, D9502 |
| 6 | `monoOpenMapValTy` | 15388 | 14 | map expression | the checker's open value type of a map | pure (gate) | [—] NONE: checker type | monoPinMapSlot, monoPinMapValues | D9062 |
| 7 | `monoLetWritesClosed` | 15241 | 37 | binding / whole writes | whether every write stores a read of an already-closed binding | pure (gate) | [elabIdentityTy, elabSlotTyAt] PARTIAL: `elabSlotTyAt`/`elabIdentityTy` of written bindings, mono walk-state | monoPinFieldContainers, monoPinMapValues | D9101 |
| 8 | `monoLetWritesAt` | 15278 | 15 | `let` / whole writes, fresh `Map()` writes | whether the binding's slot fact is `t` | nodeTyRecord on `Map()` writes | [elabSlotTyAt] FULL (`elabSlotTyAt`) | monoPinFieldContainers, monoPinMapValues | D9301 |
| 9 | `monoPinStoredRecords` | 15667 | 146 | record literals stored at a map slot / `m[k]=`, `set` | the record type each stored literal takes, field by field: inline fn list → slot pin; record-literal field → stored record recursively (D16162); else field slot fact (D9183); else `monoStoredSlotFnTy`; whole = `elabSlotTyAt(path)` else fields' | nodeTyRecord / `monoRecordObjLitAt` on each stored literal | [elabSlotTyAt] PARTIAL: elab fact when present; D15494 fallback (generic called at two sigs ⇒ no fact) to the type the fields give | monoPinMapSlot | D15494, D16162, D9183, D9301 |
| 10 | `monoPinRecordFields` | 14560 | 24 | un-annotated `const` record literal / field init, `d.f = v` | per field (skips tagged: `fnTagTyIsTagged`/`fnTagHoldsTy`), dispatch | — | [fnTagHoldsTy, fnTagTyIsTagged] see next | monoWalkLetDecl | D5061, D5079 |
| 11 | `monoPinRecordField` | 14805 | 44 | record field / field init, `d.f = v` | instance the field's value(s) at the one delivery pin; node type = field slot fact | instancing; delivery note; nodeTyRecord on value (not in shared generic instance); read retype `monoRetypeSlotReads`; lambda refusal | [elabSlotTyAt] FULL: both the pin (`monoDeclPathKeys`) and the type (`elabSlotTyAt`) are elab's; mono gates on exactly one pin | monoPinRecordFields | D5079, D9061, D9062 |
| 12 | `monoPinFieldContainers` | 14849 | 66 | un-annotated record binding whose fields hold maps/lists of fns / init, whole writes, `const` aliases | the record's type with its container fields closed | nodeTyRecord on record, writes' literals, alias reads; `monoSupersededObjTys`, `monoGradualObjList` | [elabSlotTyAt] PARTIAL: via `monoPinObjFields`; gated by `monoLetWritesAt` | monoWalkLetDecl | D15297, D9061, D9062 |
| 13 | `monoPinObjFields` | 15005 | 55 | record type literal at path `pre` | the record type at a dotted path | pure (+pinned paths) | [elabSlotTyAt] PARTIAL: `elabSlotTyAt` else the type its fields give (D15494) | monoPinFieldContainers, monoPinFieldValue | D15494, D9103 |
| 14 | `monoPinFieldValue` | 15060 | 47 | record field path | the type a field takes from its value (nested record literal/binding, or container) | nodeTyRecord on value | [elabSlotTyAt] PARTIAL: `elabSlotTyAt`, else the binding's own (mono-written) annotation | monoPinObjFields | D15494 |
| 15 | `monoPinFieldContainer` | 15153 | 48 | record field holding map/list of fns / literal, `d.f[k]=`, `d.f.set`, `d.f.push` | the field container's type | nodeTyRecord on value; read retype | [elabSlotTyAt] PARTIAL: `elabSlotTyAt`; else the read binding's `monoLetTyIx` (mono annotation), `monoPinMapSlot`, or `[monoStoredSlotFnTy(elements+stored+pushed)]` | monoObjLitFieldsPin, monoPinFieldValue, monoRecordObjLitAt | D15494 |

### F4. Elab-built held value — copy the elaboration's closed record/list type onto literals

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoPinListRecords` | 14121 | 19 | un-annotated list of record literals / literal, re-points, `xs[i]=` | list annotated at the elab's record-list type | annotation `letType`; read retype | [—] FULL (through `monoHeldRecordListAt`) | monoPinListElems | D15294, D9140 |
| 2 | `monoHeldRecordListAt` | 14140 | 59 | record-list literal of a binding or a function result | the list type the literal is built at | nodeTyRecord on literal and re-points; `structTyMarkAliasable` | [elabNodeRepAt, elabSlotTyAt] FULL: `elabSlotTyAt([e])`, or `elabNodeRepAt` in a generic instance; declines when `monoHeldReadsBuiltAt` fails | monoPinListRecords, monoPinReturnedList | D15294 |
| 3 | `monoHeldValueAt` | 14199 | 68 | each held value (literal, part, function) / any | build a value at the closed type elab gives its holder | nodeTyRecord (`monoRecordOpen`); instancing; `monoHeldInert`; `monoReachNote`; `monoSupersededObjTys`, `monoGradualObjList` | [—] FULL (consumes the elab type) | monoHeldRecordListAt | — |
| 4 | `monoHeldReadsBuiltAt` | 14267 | 37 | stored record literals reading bindings | whether bindings the fields read were already built at the field's type | pure (gate) | [—] NONE: mono walk state (mono's own annotations) | monoHeldRecordListAt | — |
| 5 | `monoPinReturnedList` | 14304 | 16 | function result / `return`, body value | returned record-list literal at its binding's type | via `monoHeldRecordListAt` | [elabNodeTyAt, fnTagListTy] FULL (`elabNodeTyAt`, `fnTagListTy` gates) | monoWalk, monoWalkFnBodyIn | — |
| 6 | `monoPinReturnedObj` | 14915 | 17 | function result / returned record literal | the returned record's closed type with each fn field's slot set | via `monoRecordObjLitAt` | [elabHeldValTy] PARTIAL: `elabHeldValTy` + `idSlotHeldTy`; fallback `monoObjLitFieldsPin` | monoWalk | D15297 |
| 7 | `monoObjLitFieldsPin` | 14969 | 36 | open fields of a record literal | fields: closed binding read → its type, inline fn list → its slot pin, nested → recurse | nodeTyRecord | [—] NONE: mono's closed bindings and slot pins (fallback of the above) | monoPinReturnedObj | D9103, D9254, D9301 |
| 8 | `monoRecordObjLitAt` | 15329 | 50 | record literal + fields | record `t` onto literal and its open fields | nodeTyRecord | [—] consumes given type | monoPinFieldContainers, monoPinReturnedObj, monoPinStoredRecords, monoRetFnListTy | D15551 |
| 9 | `monoSlotRecordsApply` | 14701 | 20 | bindings holding a returned record of members whole | types each such binding before the walk | dispatch | [elabSlotRecCount, elabSlotRecDeclAt] FULL (`elabSlotRecCount`, `elabSlotRecDeclAt`) | monomorphize | — |
| 10 | `monoPinSlotRecords` | 14721 | 42 | record-literal field holding a returned record / init | field typed at the record's row | nodeTyRecord; read retype; row minting (`monoBundleRecordAt`) | [elabSlotFieldRecord] FULL (`elabSlotFieldRecord`) | monoSlotRecordsApply | — |
| 11 | `monoPinSlotRecordList` | 14763 | 23 | list literal field of such records | list of that record | annotation `letType`; nodeTyRecord; read retype | [elabSlotFieldRecord] FULL | monoPinSlotRecords | — |
| 12 | `monoPinSlotRecordMap` | 14786 | 19 | fresh `Map()` field of such records | map of that record | annotation; nodeTyRecord; read retype (index, `get`) | [elabSlotFieldRecord] FULL | monoPinSlotRecords | — |
| 13 | `monoCloseRetFnTy` | 17572 | 11 | stored call result in a map / `m[k]=f()` | the closed type of a stored call of an un-annotated fn | nodeTyRecord (`monoRecordOpen`) | [elabHeldValTy] FULL (`elabHeldValTy`); declines when `monoRetSlotsSplit` | monoPinMapSlot | D9504 |
| 14 | `monoRetSlotsSplit` | 17583 | 16 | returned list literal | whether its element slot has >1 pin | pure | [—] FULL (pins) | monoCloseRetFnTy | D9716 |

### F5. Function result — the type/instance a returned fn-holding value is built at

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoCoerceRetAtPin` | 24570 | 105 | function result / `return`, tail value, `if`/`match` join arms | the instance a returned generic is delivered at past the return; joined literals at the tagged join type | nodeTyRecord / `nodeTyRecordIn`; instancing; read retype; `monoRetCopyReads` refusal ledger | [elabHoleGenFlowTy, elabRetTaggedJoinTy] PARTIAL: `elabRetTaggedJoinTy`, `elabHoleGenFlowTy`; else the flow pin of the read (`monoSlotPinNameTys`), else left to emit's refusal | monoWalk, monoWalkFnBodyIn | D15925, D5360, D5400, D9410, D9432 |
| 2 | `monoRetFnListTy` | 24685 | 54 | returned list literal of fns / lists of fns | element type the returned literal is instanced at | nodeTyRecord; instancing via `monoDeliverLitAt` | [elabHeldValTy, elabRetTaggedJoinTy] PARTIAL: `elabRetTaggedJoinTy`, `elabHeldValTy`; fallback `monoRetLitElemTy` | monoCoerceRetAtPin | D15226, D9410, D9503 |
| 3 | `monoRetLitElemTy` | 24781 | 34 | returned literal's slot | the element type from the pin, or each element's list type | nodeTyRecord | [—] PARTIAL: `monoBoundFnListElemsTy` (mono annotations) or `monoStoredSlotFnTy` with the literal itself as holder | monoRetFnListTy | — |
| 4 | `monoRecordJoinedLit` | 24739 | 42 | returned literal holding a tagged set | record every literal of the joined result at `t` | nodeTyRecord | [elabRepRestamp, elabRestampNote, fnTagLeafJoin] FULL (`elabRepRestamp`, `fnTagLeafJoin`) | monoCoerceRetAtPin, monoRetFnListTy | D15226 |
| 5 | `monoIfBoundRetAtPin` | 10870 | 43 | value past a return that is an `if` of generics / return | instance each arm at the binding's flow pin | instancing; read retype | [fnTagTyIsTagged] PARTIAL: flow pin, else the first arm's read pin | monoCoerceRetAtPin | D7001, D7011 |
| 6 | `monoNoteRetCopyRead` | 24923 | 13 | generic read returned past two pins | note for refusal | `monoRetCopyReads` | [—] FULL (pins) | monoCoerceRetAtPin | D9380, D9383 |

### F6. Delivery instancing — which instance each delivered value is

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoCoerceFnValueTys` | 10514 | 130 | any holder / any delivery | instance a generic/hole/alias/`if`/cell value at fn type `tnameTy` with params `delTys` | instancing (`monoInstanceFor` → instance registry `monoKeys`/`monoInstName`/`monoInstFe`, in-place rename `monoRenamedFe`); read retype | [—] NONE: consumes the type its caller decided | monoCallIfBound, monoCellValueTakeAt, monoCoerceChoiceBinding, monoCoerceFnValue, monoCoerceFnValueName, monoCoerceLitPart, monoCoerceNamedGenericTys, monoCoerceRetAtPin, monoDeliverAtPinTys, monoHeldValueAt, monoIfBoundRetAtPin, monoPinListElems, monoPinNestedListElems, monoPinRecordField, monoPinTyParamComposite, monoStoredSlotFnTy, monoWalk | D16074, D3894, D3902, D3905, D3932, D3939, D3948, D4303, D9010, D9080 |
| 2 | `monoNoteBindDeliveryAt` | 23795 | 5 | list element / map value / field / push, element store | note a binding/hole-lambda delivered at `annTy` | delivery note (`monoNoteBindDeliveryCall`, uses `elabValueInstSig`) | [—] consumes | monoDeliverAtPinTys, monoPinListElems, monoPinRecordField, monoStoredSlotFnTy | D3867 |
| 3 | `monoDeliverAtPin` | 24105 | 7 | any / push | deliver value at the instance a pin names | instancing | [—] consumes | monoBindingAtPin, monoNotePushDeliveries | — |
| 4 | `monoDeliverAtPinTys` | 24112 | 21 | any | same with param types | instancing; delivery note | [elabStampAt] consumes (`elabStampAt` for literal parts) | monoDeliverAtPin, monoDeliverLitAt, monoNotePushDeliveries, monoWalk | — |
| 5 | `monoDeliverLitAt` | 24040 | 56 | list/record literal parts at slot `path` / literal init, write, return | each fn the literal holds delivered at its slot's flow pin, else the slot's own hole-free fn type (D9340) | instancing | [—] PARTIAL: flow pin, else checker slot type | monoCoerceRetAtPin, monoDeliverLitAtPlace, monoRetFnListTy | D9340 |
| 6 | `monoDeliverLitAtPlace` | 24022 | 18 | literal stored into a place / `=`, index store, push | `monoDeliverLitAt` for a place | instancing | [—] consumes | monoNotePushDeliveries, monoWalk | D9340 |
| 7 | `monoNotePushDeliveries` | 23975 | 30 | list element, map value / `push`, `set` | each pushed arg at the list element's pin; a `set` value at the checker stamp | instancing | [—] PARTIAL: push → place pin (elab); set → checker stamp | monoWalk | D3867 |
| 8 | `monoCoerceLitPart` | 10454 | 11 | literal element/field | coerce a part at its slot's pin | instancing | [elabStampAt] FULL pin; `elabStampAt` | monoCoerceFnValueTys, monoPinLitFieldCall | — |
| 9 | `monoPinWrittenLam` | 14537 | 23 | list element / record field / written lambda literal | pin an un-annotated-param lambda at the slot's fn type | `emitFailAt` refusal | [—] consumes | monoPinListElems, monoPinRecordField, monoStoredSlotFnTy | D12238 |
| 10 | `monoCellLamTake` | 17117 | 24 | capture cell / hole lambda | pin a hole lambda at `ft` if it can take it | lambda instancing | [—] consumes | monoCellValueTakeAt, monoLamLitTakeTys, monoPinWrittenLam | — |
| 11 | `monoListElemHoleLamFe` | 11456 | 52 | list element through never-written bindings | which hole lambda an element names | pure | [—] NONE: syntax walk | monoPinListElems, monoPinRecordField, monoStoredSlotFnTy | D9595, D9652, D9980 |
| 12 | `monoCallIfBound` | 10832 | 38 | `let` bound to an `if` of generics / call through it | instance each arm at the binding's pin, else at THIS call's type (D6991) | instancing; read retype | [fnTagTyIsTagged] PARTIAL: flow pin, else the call delivery's own type | monoWalkIdentCall | D6991, D7001, D7011, D9120 |
| 13 | `monoCallWrittenLet` | 11097 | 32 | written un-annotated `let` / call through it | instance initializer and writes at this call's pin; refuse a second type | instancing; read retype | [—] PARTIAL: `monoDeclPathKeys` + the call's own type | monoWalkIdentCall | D3939, D3957 |
| 14 | `monoBindingAtPin` | 24441 | 59 | binding / reads delivered at pin | bindings instanced at their slot pin | instancing; read retype; `emitFail` | [fnTagTyIsTagged] FULL pins (`monoSlotSigName`) | monoBindingsAtPin | D15433, D5062, D5970 |
| 15 | `monoCoerceChoiceBinding` | 10988 | 41 | never-written `const` of an `if` of open fns / read delivered at a fn type | instance each arm at the delivery; refuse a second | instancing; nodeTyRecord binding+read; read retype | [fnTagTyIsTagged] NONE: the delivery's type (from the caller) | monoCoerceFnValueTys | D15063 |
| 16 | `monoWalk `=` arm (L22783–22890)` | 22783 | 108 | binding `x = v`, element `x[i] = v`, field `x.f = v`, cell `c[0] = v` | the instance a written value takes: `elabStampAt` when closed, else place/cell pin, else the element's own concrete type; refuses a different result (D9093, D15190) | instancing; delivery of literals; `emitFailAt` | [elabStampAt] PARTIAL: `elabStampAt` → pin → checker type | monoWalk | D3909, D3957, D9093, D9670, D15190 |

### F7. Read retyping — reads of a decided holder take its type

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoRetypeMapReads` | 16026 | 124 | reads of a map/list binding or field; values, `const` aliases, `??`, `for` loop variables (D16200), call results | type reads at the container type `nt` and value reads at `ft` | nodeTyRecord on reads; `monoRecordOpen` on fallback literals; recursion into record fields/members and nested maps | [—] NONE: consumes the type mono just decided | monoHeldRecPaths, monoPinFieldContainer, monoPinListElems, monoPinListRecords, monoPinMapSlot, monoRetypeRecFieldReads | D9063, D9183 |
| 2 | `monoRetypeSlotReads` | 14584 | 52 | reads of slot `f.<n>`/`e` of a binding + never-written aliases | reads typed at the pinned fn type | nodeTyRecord; per-instance `monoFieldReadTys` (`monoNoteFieldReadTy`) in shared generic instances | [—] NONE (consumes) | monoPinListElems, monoPinRecordField, monoPinSlotRecordList, monoPinSlotRecordMap, monoPinSlotRecords | D5061, D5079, D7283 |
| 3 | `monoRetypeRecFieldReads` | 14932 | 22 | reads through record fields | dispatch per field | read retype | [—] NONE | monoRetypeMapReads | — |
| 4 | `monoRetypeRecMemberReads` | 16199 | 34 | `root.f` reads through nested records | reads at field types; container values | nodeTyRecord | [—] NONE | monoRetypeMapReads | D9252, D9253 |
| 5 | `monoRetypeHeldFnReads` | 16233 | 52 | value reads of a container + `const`s bound to one | reads at `ft` where stale | nodeTyRecord | [—] NONE | monoRetypeRecMemberReads | D9064, D9065 |
| 6 | `monoRetypeMethodReads` | 16426 | 21 | `d.<method>()` calls (`pop`, `get`) | method result type | nodeTyRecord | [—] NONE | monoPinListElems, monoPinSlotRecordMap | — |
| 7 | `monoRetypeCallsAt` | 16285 | 62 | calls through a retyped read; `?.` guards | call result types where the checker guessed another | nodeTyRecord | [—] NONE | monoRetypeMapReads | D9064, D9065 |
| 8 | `monoHeldRecPaths` | 15107 | 28 | reads through record path of containers | types reads; records pinned paths | read retype | [—] NONE | monoPinFieldValue, monoRetypeRecFieldReads | — |
| 9 | `monoFnReadTyStale` | 16412 | 14 | read | whether a read needs retyping | pure | [—] NONE | monoRetypeHeldFnReads, monoRetypeMapReads | — |
| 10 | `monoNoteFieldReadTy` | 14690 | 11 | read in a generic instance | record per-instance read type | `monoFieldReadTys` (read by emit_classify `monoFieldReadTyAt`) | [—] NONE | monoRetypeSlotReads | — |
| 11 | `monoCloseMapListLits` | 16150 | 22 | list literal pushed/set into a closed holder (D15943 per git log) | literal typed at the holder's element/value type | nodeTyRecord | [—] NONE: holder's checked type | monoRetypeMapReads | — |
| 12 | `monoIsMapValueRead` | 16447 | 15 | `d[k]`/`d.get(k)` | predicate | pure | [—] NONE | monoMapValueUnpinnedCall, monoRetypeMapReads | — |
| 13 | `monoCloseListCbBindReads` | 23018 | 22 | reads of a `let` bound to a closed `.map` | reads at the init's type (D9766) | nodeTyRecord | [—] NONE | monoWalkLetDecl | D9766 |
| 14 | `monoClosedReadTy` | 14954 | 15 | identifier read of a closed binding | the binding's closed type, recorded on the read | nodeTyRecord | [—] NONE: mono's annotations | monoElabDeliver, monoHeldReadsBuiltAt, monoHeldValueAt, monoObjLitFieldsPin | D9254, D9301 |
| 15 | `monoInitHeldTy` | 26020 | 16 | binding initializer | the type an init holds, a read of a mono-closed binding included | nodeTyRecord | [—] NONE | monoBindingAdoptInit | — |

### F8. Capture cells — the fn type of a captured written `let`'s cell

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoCoerceWrittenCell` | 11129 | 54 | capture cell of a captured written `let` / seed, `d[0]=v` | the cell's fn type; seed and writes instanced there | read retype (`monoRetypeCell`); refusals `emitFail`, `monoCellValueFail`, `monoCellWriterSigFail` | [fnTagTyIsTagged] PARTIAL: `monoSlotDeliveryTy([])` (elab) else the instance's `tnameTy` | monoCellCall, monoCellValueTakeAt, monoCoerceAliasOfCell, monoCoerceFnValueTys | D3939, D3957 |
| 2 | `monoCellValueTakeAt` | 16946 | 91 | value written into a cell | whether a value can be taken at `tnameTy` | instancing | [—] NONE | monoCoerceWrittenCell | D3857, D3939, D3949, D3950, D4843 |
| 3 | `monoRetypeCell` | 26429 | 15 | cell decl, element, reads | record `ft` on cell (`[ft]`), elem, reads | nodeTyRecord | [—] consumes | monoCoerceWrittenCell, monoRetypeLamCells | — |
| 4 | `monoRetypeLamCells` | 26349 | 56 | cells of an instantiated lambda frame | retype hole-typed cells at the instance's type | read retype | [—] NONE: instance substitution (`monoPinSubTyOf`) | monoPruneTemplates | D3851 |

### F9. Lambda/callback parameter pins

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoPinLamAtDelivery` | 25217 | 21 | un-annotated lambda parameter / callback delivery | instance the lambda at the ONE closed param list elab delivers it at | instancing (`monoInstanceFor`) | [elabLamDeliveredParams] FULL (`elabLamDeliveredParams`); built-in `.map` row: `monoCbFnListRowSpell` | monomorphize | D3820, D3834, D9712 |
| 2 | `monoPinLamAtTys` | 25267 | 32 | lambda parameters | instance at given param tys | instancing | [—] consumes | monoPinLamAtDelivery, monoPinLamFromFlow | — |
| 3 | `monoCbFnListRowSpell` | 25238 | 29 | callback over a mono-annotated `((..)=>..)[][]` binding | row spelling | pure | [elabSlotTyAt] PARTIAL: reads mono's OWN `letType`, then `elabSlotTyAt` | monoPinLamAtDelivery | D9712 |
| 4 | `monoLamParamPinAnn` | 3646 | 35 | lambda param in an instance | synthesized annotation for an un-annotated param | synthesized TypeRef (`synthTypeRefOfTy`) | [elabLamInstParamTy, elabLamParamTy] PARTIAL: `monoSubstInst` first, `elabLamInstParamTy`/`elabLamParamTy` override | monoLamSubstParams | D3098, D7181 |
| 5 | `monoPinValueLambda` | 4754 | 21 | lambda as value | dispatch per-instance clone | clone | [—] NONE | monoPinBodyLambdasRaw | — |
| 6 | `monoPinMapLambdas` | 4921 | 161 | `.map`/`.filter` callback param | clone the callback with param pinned to the element | clone + rebuilt `mkLet` | [elabInstNodeTy, elabValueInstSig, elabWalkTop] PARTIAL: `elabValueInstSig`, `elabInstNodeTy`, receiver param elem | monoMakeInstanceBodyRewrite | D1990, D2334 |
| 7 | `monoPinFnValueTy` | 4702 | 19 | callee/arg fn value | the pinned fn type of a value at the instance | nodeTyRecord on remade node | [—] NONE: instance substitution (`monoPinnedTyOf`) | monoPinBodyLambdasRaw | D2552, D9220 |

### F10. Declared/place type readers (annotated slots, places, loop vars)

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoClosedSlotTyAt` | 21325 | 18 | annotated slot in a generic | declared slot type under the instance's typed bindings | pure | [—] NONE: `monoTypedBinds` | monoPinAnnotatedParam, monoPinTyParamComposite, monoSlotParamTysAt | — |
| 2 | `monoSlotParamTysAt` | 21343 | 17 | annotated fn slot in a generic | its param types under typed bindings | pure | [—] NONE | monoHandWrittenLet, monoPinTyParamComposite | D9130 |
| 3 | `monoPlaceHeldTy` | 2391 | 8 | place (binding, field, element) | the type a place holds | pure | [—] NONE: checker/annotation types | monoArgClosedPinTy, monoReadIsNarrowed | — |
| 4 | `monoElemPlaceHeldTy` | 2399 | 7 | `xs[i]` | element type | pure | [—] NONE | monoPlaceHeldTy | — |
| 5 | `monoLoopVarRecordPin` | 1340 | 16 | `for-in` variable typed as a record | the record pin name | pin name (`monoAnnPinName`) | [—] NONE: checker type | monoArgTyNameRep | D9641 |

### F11. Delivery enumeration — which values a slot receives

| # | function | line | len | holder / delivery | fact | outputs | elab facts read → status | callers | D ids |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `monoMapStoredValues` | 16512 | 38 | map binding/field / `d[k]=v`, `d.set(k,v)`, field forms | the values stored, with their write frames | pure | [—] NONE: mono's write index (`monoWritesOf`) + frame resolution; elab has `elabSlotHeldFns` (fns only) | monoPinFieldContainer, monoPinMapSlot | — |
| 2 | `monoMethodStoredArgs` | 16557 | 35 | binding/field / `d.<method>(…)` (push, set) | last args of method calls, with frames | pure | [—] NONE | monoMapStoredValues, monoPinFieldContainer, monoPinListElems, monoUncalledListElems | D6881, D7000, D7002 |
| 3 | `monoLetRepointLits` | 14320 | 27 | `let` list / re-point `xs = [..]` or `xs = ys` | re-pointed list literals with frames | pure | [—] NONE | monoPinListElems | D9170 |
| 4 | `monoLetWholeWrites` | 15379 | 9 | binding / `d = v` incl. capture cell | whole writes | pure | [—] NONE | monoLetWritesAt, monoLetWritesClosed, monoPinFieldContainers, monoPinMapSlot | — |
| 5 | `monoMapStoredFields` | 15917 | 18 | stored record literals | field values | pure | [—] NONE | monoPinStoredRecords, monoStoredFnListLits | — |
| 6 | `monoStoredFnListLits` | 15897 | 20 | stored record literals | inline fn-list field values | pure | [—] NONE | monoPinStoredRecords | — |
| 7 | `monoMapValueUnpinnedCall` | 16474 | 38 | map value reads under `?.` | whether a call the flow table does not pin exists (decline gate) | pure | [—] NONE | monoPinMapSlot | — |
---

## (a) Families by the FACT computed

| family | fact | fns | lines | status mix |
|---|---|---|---|---|
| F1 Slot pin resolution | the closed fn type / pin key a binding-or-literal slot is delivered at (and its spelling) | 19 | 368 | mostly FULL (re-keys `elabSlotDeliveries`/`elabSlotAnnRets`); PARTIAL where the flow-rewrite omit set enters (`monoSlotDeliveryTy`, `monoFlowSlotPins`, `monoFlowHeldOneGen`) and in `monoStoredSlotFnTy` (overrides with values' own results); NONE for `monoValsOwnFnTy`/`monoListStoresAgree` |
| F2 Uncalled slot / stub | the type an uncalled slot holds its fns at; whether a lambda slot is stubbed | 5 | 150 | FULL (`elabUncalledSlotTy`) for the type; NONE for the stub decisions (name searches) |
| F3 Container-binding storage | the closed type an un-annotated list / map / record-of-containers binding (or field) is built at, per value shape | 15 | 1,086 | PARTIAL dominant; one CHECK (`monoPinMapValues`); `monoPinRecordField` FULL. `monoPinMapSlot` (265 L) + `monoPinListElems` (191 L) + `monoPinStoredRecords` (146 L) = 602 L |
| F4 Elab-built held value | copy elab's closed record/list type (slot fact, held-value type, slot record) onto literals, parts and stored calls | 14 | 433 | FULL dominant — already "mono only copies"; `monoPinReturnedObj` PARTIAL (`monoObjLitFieldsPin` fallback) |
| F5 Function result | the type/instance a returned fn-holding value or join is built at | 6 | 291 | PARTIAL (`elabRetTaggedJoinTy`/`elabHeldValTy`/`elabHoleGenFlowTy`, then flow pin, then left to emit's refusal) |
| F6 Delivery instancing | which instance each delivered value (generic, hole lambda, alias, `if` choice, literal part) is | 16 | 655 | consumes / NONE (takes the slot type from F1/F3), PARTIAL where a call's own type is the fallback (`monoCallIfBound`, `monoCallWrittenLet`, `monoWalk` `=` arm) |
| F7 Read retyping | each read of a decided holder (values, aliases, `??`, `for` loop vars, method results, call results) takes its type | 15 | 510 | NONE — all consume mono's own decision; elab has no read-side fact consulted |
| F8 Capture cells | a captured written `let`'s cell fn type | 4 | 216 | PARTIAL (`monoSlotDeliveryTy([])`), NONE (instance substitution) |
| F9 Lambda/callback params | the param types an un-annotated lambda / callback instance is pinned at | 7 | 318 | FULL (`elabLamDeliveredParams`) / PARTIAL (`monoSubstInst` then elab override; mono-own annotations) |
| F10 Declared/place type readers | declared type of an annotated slot under instance bindings; type a place holds; loop-var record pin | 5 | 66 | NONE (checker + `monoTypedBinds`) |
| F11 Delivery enumeration | which values (with write frames) a slot receives: `[k]=`, `set`, `push`, re-points, whole writes, stored fields | 7 | 185 | NONE — mono walks its own write index (`monoWritesOf`); elab's `elabSlotHeldFns` covers fns only, without frames |
| **total** | | **113** | **~4,278** | |

The decision proper (F1+F3+F5, i.e. "which type is this slot built at") is 40 fns / 1,745 L; the rest are
its delivery (F6), its read-back (F7) and supporting enumerations (F11).

## (b) Distinct fallback sources mono uses when elab declines (or is overridden)

1. **Mono's flow-rewrite tables** — `mfrSetCalls` (omit set passed into `elabSlotDeliveriesOmitting`), `mfrRepointed`
   (`elabSlotUncalledOmitting`), `mfrSpreadDone`, `mfrSliced`, `mfrGen`/`monoFlowLeafGen` (one-generic test). Used to
   collapse two pins to one (`monoPinListElems`, `monoStoredSlotFnTy`, `monoFlowSlotPins`, `monoFlowHeldOneGen`).
2. **The delivered values' own checker types** at the pin's params — `monoValsOwnFnTy`/`monoValueAtAnnTy`/`monoListStoresAgree`;
   this OVERRIDES the elab delivery type when the values agree on another result (`monoPinListElems` L13979,
   `monoStoredSlotFnTy` L15981).
3. **Mono's own earlier synthesized annotations** (`letType` written by a previous walk step) — `monoBoundFnListElemsTy`,
   `monoPinFieldValue`/`monoPinFieldContainer` (`monoLetTyIx`), `monoCbFnListRowSpell`, `monoHeldReadsBuiltAt`,
   `monoClosedReadTy`, `monoInitHeldTy` (walk-order dependent).
4. **The type the fields/parts give** when a generic is called at two signatures and elab has no slot fact (D15494) —
   `monoPinObjFields`, `monoPinStoredRecords`, `monoPinFieldContainer`.
5. **Per-value-shape derivation from stored values** — `monoPinMapSlot` arms (stored maps' own closed type for maps of maps;
   stored record literals' fields; `monoStoredSlotFnTy` over stored/pushed values).
6. **The call delivery itself** — this call's type when the binding has no flow pin (`monoCallIfBound` D6991,
   `monoCallWrittenLet`, `monoCoerceChoiceBinding`).
7. **Checker stamps / checked types** — `elabStampAt` then checker type in the `=` arm and `monoNotePushDeliveries` (`set`),
   the slot's own hole-free fn type in `monoDeliverLitAt` (D9340), `monoOpenMapValTy`, `monoPlaceHeldTy`, `monoLoopVarRecordPin`.
8. **Instance substitution / typed bindings** — `monoSubstInst`, `monoPinSubTyOf`, `monoPinnedTyOf`, `monoTypedBinds`
   (`monoLamParamPinAnn`, `monoRetypeLamCells`, `monoPinFnValueTy`, `monoClosedSlotTyAt`).
9. **The instance's template slot** — `nodeSrc[at]` in `monoStoredSlotFnTy`; `monoFrameInstTmpl` retry in `monoDeclPathKeys`.
10. **Mono name/syntax searches** — `monoFrameNameUnread`, `monoLamUnread`, `monoListElemHoleLamFe`, `monoWritesOf`-based
    enumeration (F11), `monoMapValueUnpinnedCall`.
11. **Leave it to emit's refusal** — `monoCoerceRetAtPin`, `monoIfBoundRetAtPin` (no pin → value untouched).

## (c) Output mechanisms (what emit and later mono read)

| mechanism | written by | read by |
|---|---|---|
| **Synthesized annotation `LetDecl.letType = synthTypeRefOfTy(t)`** | `monoPinListElems` (L13910, L14009), `monoPinNestedListElems` (L14057, 14089, 14108), `monoPinListRecords` (L14131), `monoUncalledListElems` (L14413), `monoPinSlotRecordList` (L14778), `monoPinSlotRecordMap` (L14796), `monoPinMapValues` (L15235), `monoPinMapSlot` alias (L15651) | later mono steps (`monoCoerceFnValue(n.letInit, n.letType)` in `monoWalkLetDecl`; `monoLetTyIx`; `monoBoundFnListElemsTy`); emit via `nodeTyIxOf(d.letType)`/`tyNameOf(d.letType)` — `.letType` read 90× in emit_classify, 59× emit_elab, 21× emit_rewrite, 18× emit_collect, … |
| **Node type column `nodeTyRecord(node, ty)`** (and `monoRecordOpen`, `monoRecordInstOpen`, `monoRecordObjLitAt` wrappers) | nearly every F3/F4/F5/F7 fn — init, elements, re-points, stored values, reads | emit via `nodeTyIxOf(ix)` (check_node_tys.vl L329) |
| **Per-frame node type `nodeTyRecordIn(fx, ix, ty)`** | `monoCoerceRetAtPin` (join spine), `monoRecordOpen` in nested-generic frames | `nodeTyIxIn(ix, fx)` (check_node_tys.vl L137) |
| **Per-instance read type `monoFieldReadTys`** (`monoNoteFieldReadTy`) | `monoRetypeSlotReads` in shared generic instances | emit_classify `monoFieldReadTyAt` (L5245; used L5306, 13789, 14064) |
| **Instance registry + in-place rename** (`monoInstanceFor` → `monoKeys`/`monoInstName`/`monoInstFe`, `monoRenamedFe`, `monoArgInstFe`; lambda clones) | `monoCoerceFnValueTys`, `monoPinLamAtTys`, `monoPinLamAtDelivery`, `monoElemsAtSet`, `monoPinMapLambdas` | emit reads the renamed identifiers / `fnStmts` instance slots |
| **Delivery notes** (`monoNoteBindDeliveryCall`, `monoBindCalled`, `monoLastInstFe`) | `monoNoteBindDeliveryAt` from F1/F3/F6 | later mono instancing |
| **Inert/reach ledgers** `monoHeldInert`, `monoReachNote`, `monoStubSlots`, `monoRetCopyReads` | `monoHeldValueAt`, `monoUncalledSlotFnTy`, `monoPruneTemplates` (via F2), `monoNoteRetCopyRead` | value_reach.vl (`monoHeldInert`), emit stub/refusal checks (`monoStubValueOk`) |
| **Write-back into elab** `elabValueSlotNote(x, at, path)` | `monoUncalledSlotFnTy` | elab's value-slot table (`elabValueSlotAt/Path`) |
| **Shape-row ledgers** `monoSupersededObjTys`, `monoGradualObjList`, `structTyMarkAliasable`, `monoBundleRecordAt` | `monoPinFieldContainers`, `monoHeldValueAt`, `monoHeldRecordListAt`, `monoPinSlotRecords*` | emit_shape_rows.vl L835, emit_collect.vl L5911 |
| **Synthesized param annotation** (`monoLamParamPinAnn` → `synthTypeRefOfTy`) | F9 | instance lambda's `Param` type |
| **Refusals** `emitFail`/`emitFailAt`, `monoGenericListFail`, `monoCellValueFail`, `monoCellWriterSigFail`, `monoSlotPinAnn` | F1/F3/F6/F8 | — |

So emit reads the decision through three channels: the **`letType` annotation** (binding storage), the
**node type column** (`nodeTyIxOf` / `nodeTyIxIn` — literals, elements, reads), and **instance tables /
renamed identifiers** (which instance each value is), plus the per-instance side table `monoFieldReadTys`.
