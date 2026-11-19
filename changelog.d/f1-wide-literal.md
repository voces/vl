## Codegen, memory & runtime (Track B)

- **IR: an integer literal past the narrow reading:** an `i64` literal above `u32`'s range, or an `i32` hex pattern past `I32_MAX`, is now an IR immediate holding the bits legacy's literal writer spells (`parseI64Pair` halves, `parseI32`'s wrap), so `std:fmt`'s float formatter and every function it held back are built by the IR (674 more corpus functions).
