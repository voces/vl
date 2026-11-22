## Codegen, memory & runtime (Track B)

- **IR: a capturing lambda handed to a bundle parameter builds its record of closures, and a held record is handed on as it is**, on legacy's own arm: `bundleArgArmOf`, split out of the direct call's argument ladder. tests/cases `bundle argument` 124 → out of the top 60; +56 claimed functions over the five I8 populations. Byte-identical.
