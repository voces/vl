## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` test a generic instance decides without a row.** An arm the box lacks (`tagAbsent`) is a constant `false`, and `recv is V` where `V` has no row evaluates its receiver and answers the pin's constant. Both follow `emitIsTestVariant`'s plan (`variantIsArmOf`), which legacy now asks too (distilled corpus `is arm tag tagAbsent` 49 → 0).
