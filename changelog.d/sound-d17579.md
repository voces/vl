## Codegen, memory & runtime (Track B)

- **D17579 closed:** an uncalled maker returning a hole lambda, beside a function returning a bundle record, is claimed by the IR: its open function result is the closure legacy returns, not the `i32` descriptor. The family C template under `VL_IR_REQUIRE_CLAIM=1` runs 57 of 66, as the default build does.
