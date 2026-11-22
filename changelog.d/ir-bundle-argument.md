## Codegen, memory & runtime (Track B)

- **IR: a capturing lambda handed to a bundle parameter builds its record of closures, and a held record is handed on as it is**, on legacy's own arm: `bundleArgArmOf`, split out of the direct call's argument ladder. tests/cases `bundle argument` rows 161 → 42, the rest being the function-read and choice arms; +56 claimed functions over the five I8 populations. Byte-identical.
