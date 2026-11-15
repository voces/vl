## Codegen, memory & runtime (Track B)

- **D3463 closed:** a `u8[]` or `u16[]` literal past the 10,000-operand `array.new_fixed` cap now builds when one of its elements is computed. It builds chunk by chunk, as the other scalar lists do. Before, it was refused at emit as too long.
