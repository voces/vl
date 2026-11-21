## Codegen, memory & runtime (Track B)

- **IR coverage: a bare-arm global's initializer is delivered at the cell's type.** A start body missed every global whose cell is one union arm (`global initializer variant`); legacy writes it through `emitVariantCoerce` at the arm's row. The IR now delivers the initializer at the cell's type, so the variant coercion arm builds it at that row, with the same arm unbox check the plain arm has (tests/cases start bodies covered and matched +13).
