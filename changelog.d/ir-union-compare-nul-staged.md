## Codegen, memory & runtime (Track B)

- **IR: a union `==` on its null legs over a call box or a call operand builds in the IR** (D17065, D17066): legacy's null-leg arms take their level and slots through shared pieces, and the IR parks the same sides as effects. D17065's grids: 88 uncovered union-compare rows → 50, all on other mechanisms.
