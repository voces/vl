## Type system (Track A)

- **D16495 closed:** a radix constant whose 32-bit pattern is negative, cast from `i32` into `u8` (`0xFFFFFFFF as? u8`, `0x80000000 as? u8`, `(-0x1) as? u8`, `as! u8`), is now refused as never fitting, with the decimal spelling's words. The constant is judged as the `i32` it is (D3053). Before, it was accepted and left to the runtime. A float or `i64` target still reads the value the digits spell.
