## Self-hosting & modules (Track H)

- **Step 7 L2:** the i32-list, string-list and literal-set-list tests at `checkArrTy`, the ref-list row's stored spelling, `gaeArgIsTyParam`, `shapeFieldElemName` and `annShapeIndexOf` read the type (`tyIsI32List`, `tyIsStrList`, `tyIsStrLitSetList`); eleven `emit_base` spelling predicates and `tyname.arrElemIs` are deleted, and `nameIsMap` goes with its last caller; `emit_base` has no render-parse site left.
