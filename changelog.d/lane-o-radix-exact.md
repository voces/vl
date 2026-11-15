## Infrastructure (Track F)

- **The oracle follows rulings 4.1 (clarified) and 4.2:** a radix literal at a float destination or peer must be exact there (only `as f32`/`as f64` rounds), and a radix constant tree read at an `f64` computes at 64 bits with integer division; radix `/`, `%`, shifts and bitwise operators now run at their use's width instead of declining. Spec T2.3 says both; the arith fuzz subset grows from 1096 to 1234 of 1600, and six stale `known.txt` lines go.
