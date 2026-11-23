## Codegen, memory & runtime (Track B)

- **IR coverage, `rep ?` (D17077):** a `??` chain's re-associated inner link over a map read, minted with no type of its own in a hole instance, is built at the map's non-null value rep and held at that type; one at a box is built at the map's value rep and boxed (N7's delivery). The 8 `d3127` N12 corpus cells are covered; the 6 S3 cells move to `box ladder` (N9) and the F4 cell stays at `union if arm coalesce chain` (N2). No legacy bytes moved.
