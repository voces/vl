## Codegen, memory & runtime (Track B)

- **Slot store stage 3 design:** mono's pins move into the elaboration one writer at a time, each under its own gate, into a side table that bounds the place classes; mono applies them where it writes them today. Closes D16768 when built.
