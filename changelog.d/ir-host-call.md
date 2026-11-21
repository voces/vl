## Codegen, memory & runtime (Track B)

- **IR coverage, host calls:** a `std:fs`-floor intrinsic (`__fs_*__`, `__args_*__`, `__proc_*__`,
  `__env_get__`) or a user `extern function` builds through the IR as one `RCallHost`. Its
  arguments are taken at the widths one shared plan names (`hostCallPlanOf`), then the call of the
  reserved import legacy also writes. Legacy's two host arms are one. No emitted byte moves.
