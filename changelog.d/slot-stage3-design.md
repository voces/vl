## Codegen, memory & runtime (Track B)

- **Slot store stage 3 design:** mono's pins are decided before mono, kept in a side table keyed by the solved instantiation, and applied by mono where it writes them today; a closed slot fact bounds its class first (S3a). Closes D16768 when built.
