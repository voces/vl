## Codegen, memory & runtime (Track B)

- **Step 7, D16032: the checklist's quick wins and the element-union readers.** `unionRowArmTys` drops a name fallback that could not hit. `emitUnionCoerceUnder` reads its record set through the row its type keys. The ref-list element-union readers read the row the slot's element type keys, instead of turning it back into a name. All 4,760 programs that reach these sites build byte-identical.
