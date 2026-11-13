## Type system (Track A)

- **Unreached type-string parses are deleted behind loud floors (step 7, D6).** 19 of the census's 34 unreached parse sites are gone. The dead `shapeFieldParse` and the `removeAtomFromSet` chain, which the cuts left without a caller, go with them. No behaviour change: all 24,212 sweep programs are byte-identical. The render-parse baseline's ungraded count falls from 36 to 19 (at master `61b4a983`). `nameFieldCodeTy` drops its unread spelling parameter.
