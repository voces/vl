## Codegen, memory & runtime (Track B)

- **IR coverage, a statement call through a tagged function set:** `u(8)`, `for f in fs { f(x) }`
  and the like, where the callee holds one of a known set of functions, build through the IR as
  legacy's dispatch. A void set writes void `if`s and a valued one drops its result; a dispatch's
  arm keeps its plain call where legacy disarms its tail cursor. A loop variable holding a function
  keys as a plain closure call (IR-N6). No emitted byte moves.
