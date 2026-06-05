// Registers VL's runtime prelude on a binaryen module: the imported memory and
// __log__, plus the __store_*/__load_*/__memory_* memory builtins. `binaryen`
// is the (dynamically-typed) binaryen instance; `m` is a binaryen Module.
// deno-lint-ignore-file no-explicit-any
export const registerBuiltins = (m: any, binaryen: any) => {
  m.addMemoryImport("memory", "imports", "memory");

  m.addFunctionImport(
    "__log__",
    "imports",
    "__log__",
    binaryen.createType([binaryen.i32, binaryen.i32]),
    0,
  );

  // Render `length` raw bytes at an offset as a string (pairs with
  // `__store_string__`, which copies a GC string's bytes into linear memory).
  m.addFunctionImport(
    "__log_string__",
    "imports",
    "__log_string__",
    binaryen.createType([binaryen.i32, binaryen.i32]),
    0,
  );

  // TODO: These don't need to be actual funcitons... can inline. But I think binaryen does that for us.
  m.addFunction(
    "__store_i32__",
    binaryen.createType([binaryen.i32, binaryen.i32]),
    binaryen.none,
    [],
    m.i32.store(
      0,
      4,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.i32),
    ),
  );

  m.addFunction(
    "__load_i32__",
    binaryen.i32,
    binaryen.i32,
    [],
    m.i32.load(0, 4, m.local.get(0, binaryen.i32)),
  );

  m.addFunction(
    "__store_i64__",
    binaryen.createType([binaryen.i32, binaryen.i64]),
    binaryen.none,
    [],
    m.i64.store(
      0,
      8,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.i64),
    ),
  );

  m.addFunction(
    "__store_f32__",
    binaryen.createType([binaryen.i32, binaryen.f32]),
    binaryen.none,
    [],
    m.f32.store(
      0,
      4,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.f32),
    ),
  );

  m.addFunction(
    "__store_f64__",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.none,
    [],
    m.f64.store(
      0,
      8,
      m.local.get(0, binaryen.i32),
      m.local.get(1, binaryen.f64),
    ),
  );

  m.addFunction(
    "__memory_grow__",
    binaryen.i32,
    binaryen.i32,
    [],
    m.memory.grow(m.local.get(0, binaryen.i32)),
  );

  m.addFunction(
    "__memory_size__",
    binaryen.none,
    binaryen.i32,
    [],
    m.memory.size(),
  );
};
