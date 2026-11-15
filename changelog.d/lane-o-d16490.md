## Infrastructure (Track F)

- **D16460 filed, with three oracle cases:** the oracle found that a literal `let` stored an `f32` becomes `f64` when a float literal also joins its stores (`t = f; t = t - 0.1`) or when the literal is a float (`let t = 0.0; t = f`). The compiler prints `1.4` where ruling 4.3 at stores gives `1.399999976158142`. `scripts/oracle/ruling-grid.ts` gains the three cases.
