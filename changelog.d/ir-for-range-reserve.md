## Codegen, memory & runtime (Track B)

- **IR builds range loops inside a list reserve region** (`for range in a reserve region`). Legacy weighs a counted push in the region as inline when it decides whether to unroll; it learns those pushes only when the region opens at emit time. The IR builder now plans the same pushes when it opens the region (`listReserveRegionPushes`, sharing `listReserveOpen`'s sizing decision), so its rolled-or-unrolled choice is legacy's, byte for byte.
