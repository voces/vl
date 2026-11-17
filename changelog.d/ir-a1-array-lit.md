## Codegen, memory & runtime (Track B)

- **IR A1, list literals:** legacy's list literal takes its builder from one shared decision
  (`arrLitArmOf`), and the i32, f64, i64, f32 and string builders share their short tail. The
  IR builds those literals through it, and a `[]` binding legacy reserves stays a named miss
  through legacy's own scan. The self-compile hands 594 more functions to the IR and the corpus
  940. No emitted byte moves.
