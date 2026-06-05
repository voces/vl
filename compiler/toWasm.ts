import Binaryen from "binaryen";
import {
  arrayElementType,
  conditionNarrowing,
  defaultIntegerType,
  elseNarrowing,
  nonNullable,
  postGuardNarrowing,
  softenImplicitType,
  validateType,
  VLFunctionCallNode,
  VLFunctionDeclarationNode,
  VLObjectType,
  VLProgramNode,
  VLStatement,
  VLType,
  vlType,
} from "./toAST.ts";
import { defaultScope } from "./defaultScope.ts";
import { registerBuiltins } from "./wasmBuiltins.ts";
import { toWasmType as toWasmTypeOf } from "./wasmType.ts";

const raise = (err?: string | Error): never => {
  if (typeof err === "object" && err instanceof Error) throw err;
  throw new Error(err);
};

const ignoredKeys = new Set(Object.keys(defaultScope()));

export const toWasm = async (ast: VLProgramNode) => {
  // binaryen's default export is a synchronous module object (plain npm), or,
  // when the binaryen patch is applied (patch-package, used by the bundled
  // extension), an async init function returning that object. Support both so
  // the core runs under Deno/CLI (unpatched) and the esbuild bundle (patched).
  // deno-lint-ignore no-explicit-any
  const _Binaryen = Binaryen as any;
  const binaryen = typeof _Binaryen === "function"
    ? await _Binaryen()
    : _Binaryen;
  const m = new binaryen.Module();
  // Closures and the heap phase use WasmGC structs/arrays.
  m.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes);

  registerBuiltins(m, binaryen);

  let loopIndex = 0;
  // A reusable i32 desired-type, e.g. for array indices.
  const i32Type: VLType = { type: "Alias", name: "i32" };
  // Binary operators that yield a boolean (used by instance-aware type resolution).
  const COMPARE_OPS = new Set(["<", ">", "<=", ">=", "==", "!=", "&&", "||"]);

  // VL binary operator -> binaryen method name, by operand class. Integers are
  // signed (`div_s`/`rem_s`/`gt_s`/…); floats use the unsuffixed forms. Applied
  // as `m[wasmType][method]` (e.g. `m.i64.add`, `m.f32.lt`).
  const INT_BINOPS: Record<string, string> = {
    "+": "add", "-": "sub", "*": "mul", "/": "div_s", "%": "rem_s",
    "==": "eq", "!=": "ne", ">": "gt_s", "<": "lt_s", ">=": "ge_s",
    "<=": "le_s", "&&": "and",
  };
  const FLOAT_BINOPS: Record<string, string> = {
    "+": "add", "-": "sub", "*": "mul", "/": "div",
    "==": "eq", "!=": "ne", ">": "gt", "<": "lt", ">=": "ge", "<=": "le",
  };

  type ScopeEntry = [type: VLType, index: number];
  type Scope = Record<string, ScopeEntry>;
  const scopes: Scope[] = [];
  let currentScope: Scope;
  // `scopes` index where the current function's own scopes begin. A value
  // reference resolving below this belongs to an enclosing frame — i.e. a
  // capture, which closures (not yet implemented) would carry in an environment.
  const functionBoundaries: number[] = [];
  const withScope = <T>(scope: Scope, fn: () => T) => {
    scopes.push(scope);
    currentScope = scope;
    functionScopes.push({});
    const ret = fn();
    scopes.pop();
    functionScopes.pop();
    currentScope = scopes[scopes.length - 1];
    return ret;
  };

  // Locate a name in the scope stack. `capture` is true when it resolves to an
  // enclosing function's frame local (index >= 0; function-decl markers use -1
  // and dispatch via the table, not the frame) — i.e. a closed-over variable.
  const lookupName = (name: string) => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]) {
        const [type, index] = scopes[i][name];
        const boundary = functionBoundaries[functionBoundaries.length - 1] ?? 0;
        return { type, index, capture: i < boundary && index >= 0 };
      }
    }
    return null;
  };

  const getScopeEntry = (name: string): ScopeEntry => {
    const found = lookupName(name);
    if (!found) throw new Error(`Expected "${name}" to be in scope`);
    // Captures are handled by the Name case (read from the closure environment);
    // any other path reaching a capture is unsupported (e.g. assigning to one).
    if (found.capture && !captureCollector && !currentEnv) {
      throw new Error(
        `Closures: cannot yet write to or otherwise use captured "${name}".`,
      );
    }
    return [found.type, found.index];
  };

  let returnType: VLType | undefined = undefined;
  // The wasm type of the value the current function instance `return`s, captured
  // during body compilation. Used as the result type when the body ends in a
  // `return` (so its block is `unreachable`) and the declared return type is an
  // unresolved inference hole — i.e. a generic function with an inferred return.
  let returnedWasmType: number | undefined = undefined;
  let desiredType: VLType | undefined = undefined;
  const withDesiredType = <T>(type: VLType | undefined, fn: () => T) => {
    const oldType = desiredType;
    desiredType = type;
    const ret = fn();
    desiredType = oldType;
    return ret;
  };
  // Whether the current expression's value is wanted (return/operand position)
  // rather than discarded (statement position). This is signalled by whether a
  // desired type is *set* at all — the Block case passes `undefined` for the
  // non-tail statements it intends to drop. Note this must be set-vs-unset, not
  // `isSomething`: a function with an inferred (still-`Infer`) return type has a
  // desired type that is wanted but not yet concrete.
  const hasDesiredType = () => desiredType !== undefined;

  // A loop's `break` target — the outer block wrapping the loop. `loopLabels`
  // holds the matching `continue` (loop) labels; appending here keeps the
  // convention in one place for both the loops and the `Break`/`Continue` cases.
  const loopLabels: string[] = [];
  const brkLabel = (cont: string) => `${cont}__brk`;

  const functionScopes: Record<string, string>[] = [];
  const functions: Record<
    string,
    { declaration: VLFunctionDeclarationNode }
  > = {};
  // (resolved name + wasm parameter signature) -> emitted instance name. A
  // generic function (inferred / non-concrete params) yields one wasm instance
  // per distinct parameter ABI shape, so `apply(addi,…)` and `apply(addf,…)` —
  // same resolved name, different shapes — compile to two correctly-typed
  // instances. Keying on the *wasm* type also maximises sharing (every closure,
  // and every object of one shape, maps to a single wasm type), keeping the
  // instance count small.
  const instances = new Map<string, string>();
  // Per resolved name, how many instances exist — names the extra shapes
  // `name$1`, `name$2`, … (the first keeps the bare resolved name).
  const instanceCounts: Record<string, number> = {};
  // The wasm result type of each emitted instance, keyed by instance name. For
  // an instance with an inferred (unresolved) return type, this is read back
  // from the compiled body rather than the declaration.
  const instanceResult: Record<string, number> = {};
  // Functions referenced as *values* live in a wasm function table; a function
  // value is the i32 index into this table, which `call_indirect` dispatches on.
  const functionTable: string[] = [];

  // --- Closures (WasmGC environments) ---
  type EnvShape = {
    fields: string[]; // capture names, in struct-field order
    types: VLType[]; // their VL types
    heapType: number; // the env struct's wasm heap type
    refType: number; // a non-nullable ref to it
  };
  // While a closure body is compiled, captures it references are collected here
  // (name -> type, in encounter order) to shape the environment struct.
  let captureCollector: Map<string, VLType> | null = null;
  // While compiling a closure body, captured names read from this environment
  // (its `paramIndex` is the hidden leading `(ref env)` parameter, local 0).
  let currentEnv: (EnvShape & { paramIndex: number }) | null = null;
  // resolvedName -> its environment shape, so call sites can allocate + pass it.
  const closures: Record<string, EnvShape> = {};

  // Build a WasmGC struct type holding one (immutable) field per captured value.
  const buildEnvStruct = (fields: string[], types: VLType[]): EnvShape => {
    const tb = new binaryen.TypeBuilder(1);
    tb.setStructType(
      0,
      types.map((t) => ({
        type: toWasmType(t),
        packedType: binaryen.notPacked,
        mutable: false,
      })),
    );
    const heapType = tb.buildAndDispose()[0];
    return {
      fields,
      types,
      heapType,
      refType: binaryen.getTypeFromHeapType(heapType, false),
    };
  };

  // A function value is a "fat pointer": a uniform WasmGC struct holding the
  // callee's table index and its environment (a `structref`, null for a
  // non-capturing function). One struct type for *all* function values makes
  // them interchangeable regardless of captures, and lets a closure escape
  // (be stored/returned/passed) carrying its environment.
  let _closureStruct: { heapType: number; refType: number } | null = null;
  const closureStruct = () => {
    if (!_closureStruct) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setStructType(0, [
        { type: binaryen.i32, packedType: binaryen.notPacked, mutable: false },
        {
          type: binaryen.structref,
          packedType: binaryen.notPacked,
          mutable: false,
        },
      ]);
      const heapType = tb.buildAndDispose()[0];
      _closureStruct = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
      };
    }
    return _closureStruct;
  };
  const nullEnv = () => m.ref.null(binaryen.structref);

  // The environment argument for calling `resolvedName`: a struct of its
  // captured variables' current values (read in the current scope), or null.
  const envArgFor = (resolvedName: string): number => {
    const env = closures[resolvedName];
    if (!env) return nullEnv();
    return m.struct.new(
      env.fields.map((f, i) =>
        withDesiredType(
          env.types[i],
          () => toExpression({ type: "Name", name: f }),
        )
      ),
      env.heapType,
    );
  };

  // A function value (fat pointer) for a declared function: its table index +
  // environment, packed into the uniform closure struct. A value reference uses
  // the declaration's own (concrete) parameter types as its canonical instance.
  const closureValue = (resolvedName: string): number => {
    const { declaration } = functions[resolvedName];
    const instanceName = instantiate(
      resolvedName,
      declaration.parameters.map((p) => p.paramaterType),
    );
    const index = tableIndexOf(instanceName);
    return m.struct.new(
      [m.i32.const(index), envArgFor(instanceName)],
      closureStruct().heapType,
    );
  };

  // --- Objects (WasmGC structs) ---
  type ObjectStruct = {
    heapType: number;
    refType: number;
    fields: { name: string; type: VLType; index: number }[];
  };
  // Structural object shapes are interned to a WasmGC struct, keyed by a
  // canonical signature so identical shapes share a type. Fields are sorted by
  // name (deterministic order independent of literal/annotation order) and
  // mutable (so `o.x = …` can `struct.set`).
  const objectStructs = new Map<string, ObjectStruct>();
  const objectStruct = (type: VLObjectType): ObjectStruct => {
    const fields = type.properties
      .flatMap((p) =>
        p.name.type === "StringLiteral"
          ? [{ name: p.name.value, type: p.type }]
          : []
      )
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const sig = fields.map((f) => `${f.name}:${toWasmType(f.type)}`).join(",");
    let cached = objectStructs.get(sig);
    if (!cached) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setStructType(
        0,
        fields.map((f) => ({
          type: toWasmType(f.type),
          packedType: binaryen.notPacked,
          mutable: true,
        })),
      );
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
        fields: fields.map((f, index) => ({ ...f, index })),
      };
      objectStructs.set(sig, cached);
    }
    return cached;
  };

  // --- Arrays (WasmGC arrays) ---
  // An array type is a structural object carrying an `i32`-keyed index signature
  // (`{[i32]: T}` — see `arrayElementType`); that key is what selects the WasmGC-
  // array representation (contiguous, native `array.get` — the performance path)
  // over a struct. `length` rides as an intrinsic lowered to `array.len`.
  type ArrayType = { heapType: number; refType: number; element: VLType };
  const arrayTypes = new Map<number, ArrayType>();
  // Intern a WasmGC array type by its element's wasm type (so identical element
  // types share one array type). Mutable so `a[i] = v` can `array.set`.
  const arrayType = (element: VLType): ArrayType => {
    const elemWasm = toWasmType(element);
    let cached = arrayTypes.get(elemWasm);
    if (!cached) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setArrayType(0, elemWasm, binaryen.notPacked, true);
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
        element,
      };
      arrayTypes.set(elemWasm, cached);
    }
    return cached;
  };

  // Lazily-emitted wasm helper functions (string equality, string→memory copy),
  // each added to the module once on first use. Strings are i32-arrays of char
  // codes, so these are small loops over `array.get`.
  const _helpers = new Set<string>();
  // `__string_eq__(a, b)`: 1 if equal length + elements, else 0.
  const stringEqFn = (): string => {
    const name = "__string_eq__";
    if (!_helpers.has(name)) {
      _helpers.add(name);
      const at = arrayType(i32Type);
      const a = () => m.local.get(0, at.refType);
      const b = () => m.local.get(1, at.refType);
      const i = () => m.local.get(2, binaryen.i32);
      const len = () => m.local.get(3, binaryen.i32);
      const body = m.block(null, [
        m.if(
          m.i32.ne(m.array.len(a()), m.array.len(b())),
          m.return(m.i32.const(0)),
        ),
        m.local.set(3, m.array.len(a())),
        m.local.set(2, m.i32.const(0)),
        m.block("eq_brk", [
          m.loop(
            "eq_loop",
            m.block(null, [
              m.br("eq_brk", m.i32.ge_s(i(), len())),
              m.if(
                m.i32.ne(
                  m.array.get(a(), i(), binaryen.i32, false),
                  m.array.get(b(), i(), binaryen.i32, false),
                ),
                m.return(m.i32.const(0)),
              ),
              m.local.set(2, m.i32.add(i(), m.i32.const(1))),
              m.br("eq_loop"),
            ]),
          ),
        ]),
        m.i32.const(1),
      ], binaryen.i32);
      m.addFunction(
        name,
        binaryen.createType([at.refType, at.refType]),
        binaryen.i32,
        [binaryen.i32, binaryen.i32],
        body,
      );
    }
    return name;
  };
  // `__store_string__(offset, str)`: copy str's char codes as bytes into linear
  // memory at `offset` and return the length — bridges a GC string to `__log__`.
  const storeStringFn = (): string => {
    const name = "__store_string__";
    if (!_helpers.has(name)) {
      _helpers.add(name);
      const at = arrayType(i32Type);
      const offset = () => m.local.get(0, binaryen.i32);
      const str = () => m.local.get(1, at.refType);
      const i = () => m.local.get(2, binaryen.i32);
      const len = () => m.local.get(3, binaryen.i32);
      const body = m.block(null, [
        m.local.set(3, m.array.len(str())),
        m.local.set(2, m.i32.const(0)),
        m.block("ss_brk", [
          m.loop(
            "ss_loop",
            m.block(null, [
              m.br("ss_brk", m.i32.ge_s(i(), len())),
              m.i32.store8(
                0,
                0,
                m.i32.add(offset(), i()),
                m.array.get(str(), i(), binaryen.i32, false),
              ),
              m.local.set(2, m.i32.add(i(), m.i32.const(1))),
              m.br("ss_loop"),
            ]),
          ),
        ]),
        len(),
      ], binaryen.i32);
      m.addFunction(
        name,
        binaryen.createType([binaryen.i32, at.refType]),
        binaryen.i32,
        [binaryen.i32, binaryen.i32],
        body,
      );
    }
    return name;
  };

  // `__print_string__(str)`: stream a string's char codes to the host one at a
  // time (`__print_char__`), then `__print_str_flush__` emits the assembled
  // line. Backs `print(string)` without touching linear memory — the host can't
  // read a WasmGC array directly, but it can accumulate the code points.
  const printStringFn = (): string => {
    const name = "__print_string__";
    if (!_helpers.has(name)) {
      _helpers.add(name);
      const at = arrayType(i32Type);
      const str = () => m.local.get(0, at.refType);
      const i = () => m.local.get(1, binaryen.i32);
      const len = () => m.local.get(2, binaryen.i32);
      const body = m.block(null, [
        m.local.set(2, m.array.len(str())),
        m.local.set(1, m.i32.const(0)),
        m.block("ps_brk", [
          m.loop(
            "ps_loop",
            m.block(null, [
              m.br("ps_brk", m.i32.ge_s(i(), len())),
              m.call(
                "__print_char__",
                [m.array.get(str(), i(), binaryen.i32, false)],
                binaryen.none,
              ),
              m.local.set(1, m.i32.add(i(), m.i32.const(1))),
              m.br("ps_loop"),
            ]),
          ),
        ]),
        m.call("__print_str_flush__", [], binaryen.none),
      ], binaryen.none);
      m.addFunction(
        name,
        binaryen.createType([at.refType]),
        binaryen.none,
        [binaryen.i32, binaryen.i32],
        body,
      );
    }
    return name;
  };

  // Reference equality of two function values (fat-pointer closures): same
  // function (table index) AND same captured environment (`ref.eq`). Each operand
  // is a thunk re-read per use (binaryen wants trees, not shared refs).
  const closureRefEq = (
    aClo: () => number,
    bClo: () => number,
  ): number =>
    m.i32.and(
      m.i32.eq(
        m.struct.get(0, aClo(), binaryen.i32, false),
        m.struct.get(0, bClo(), binaryen.i32, false),
      ),
      m.ref.eq(
        m.struct.get(1, aClo(), binaryen.structref, false),
        m.struct.get(1, bClo(), binaryen.structref, false),
      ),
    );

  // Equality (i32 0/1) of two values of VL type `t`, given thunks that (re)produce
  // each side — the shared element/field/operand comparison behind array, object,
  // and top-level `==`. Numerics compare natively; strings/arrays/structs recurse;
  // a function value compares by reference (same function + same captured env).
  const valueEq = (t: VLType, a: () => number, b: () => number): number => {
    let ft = softenImplicitType(t);
    while (ft.type === "Infer") ft = softenImplicitType(ft.subType);
    if (ft.type === "Object" && ft.name === "f64") return m.f64.eq(a(), b());
    if (ft.type === "Object" && ft.name === "f32") return m.f32.eq(a(), b());
    if (ft.type === "Object" && ft.name === "i64") return m.i64.eq(a(), b());
    if (ft.type === "Object" && ft.name === "string") {
      return m.call(stringEqFn(), [a(), b()], binaryen.i32);
    }
    if (ft.type === "Function") return closureRefEq(a, b);
    const element = ft.type === "Object" ? arrayElementType(ft) : undefined;
    if (element) return m.call(arrayEqFn(element), [a(), b()], binaryen.i32);
    if (ft.type === "Object" && ft.name === undefined) {
      return m.call(objectEqFn(ft), [a(), b()], binaryen.i32);
    }
    return m.i32.eq(a(), b()); // i32 / boolean
  };

  // Per-element-type array equality: `__arr_eq_<n>__(a, b)` returns 1 iff the two
  // arrays have equal length and equal elements (each compared via `valueEq`, so
  // arrays of strings/structs/arrays recurse). `__string_eq__` is the same shape
  // specialized to i32 char codes.
  const arrayEqFns = new Map<number, string>();
  const arrayEqFn = (element: VLType): string => {
    const at = arrayType(element);
    const existing = arrayEqFns.get(at.heapType);
    if (existing) return existing;
    const name = `__arr_eq_${arrayEqFns.size}__`;
    arrayEqFns.set(at.heapType, name); // before body for cycle safety
    const elemWasm = toWasmType(element);
    const a = () => m.local.get(0, at.refType);
    const b = () => m.local.get(1, at.refType);
    const i = () => m.local.get(2, binaryen.i32);
    const len = () => m.local.get(3, binaryen.i32);
    const body = m.block(null, [
      m.if(
        m.i32.ne(m.array.len(a()), m.array.len(b())),
        m.return(m.i32.const(0)),
      ),
      m.local.set(3, m.array.len(a())),
      m.local.set(2, m.i32.const(0)),
      m.block("aeq_brk", [
        m.loop(
          "aeq_loop",
          m.block(null, [
            m.br("aeq_brk", m.i32.ge_s(i(), len())),
            m.if(
              m.i32.eqz(valueEq(
                element,
                () => m.array.get(a(), i(), elemWasm, false),
                () => m.array.get(b(), i(), elemWasm, false),
              )),
              m.return(m.i32.const(0)),
            ),
            m.local.set(2, m.i32.add(i(), m.i32.const(1))),
            m.br("aeq_loop"),
          ]),
        ),
      ]),
      m.i32.const(1),
    ], binaryen.i32);
    m.addFunction(
      name,
      binaryen.createType([at.refType, at.refType]),
      binaryen.i32,
      [binaryen.i32, binaryen.i32],
      body,
    );
    return name;
  };

  // Per-shape structural equality: `__eq_<n>__(a, b)` returns 1 iff every field
  // of the two structs is equal (native for numerics, `__string_eq__` for
  // strings, a recursive call for nested structs). The type checker guarantees
  // every field is equatable (no function fields).
  const objectEqFns = new Map<number, string>();
  const objectEqFn = (objType: VLObjectType): string => {
    const struct = objectStruct(objType);
    const existing = objectEqFns.get(struct.heapType);
    if (existing) return existing;
    const name = `__eq_${objectEqFns.size}__`;
    objectEqFns.set(struct.heapType, name); // before body for cycle safety
    const ref = struct.refType;
    let cond = m.i32.const(1);
    for (const field of struct.fields) {
      const ftWasm = toWasmType(field.type);
      // Re-readable thunks per side (binaryen wants trees; `valueEq` re-reads for
      // the by-reference function case). `valueEq` dispatches f64/f32/i64 native,
      // string/array/struct recursive, function by reference, else i32.
      const fieldEq = valueEq(
        field.type,
        () => m.struct.get(field.index, m.local.get(0, ref), ftWasm, false),
        () => m.struct.get(field.index, m.local.get(1, ref), ftWasm, false),
      );
      cond = m.i32.and(cond, fieldEq);
    }
    m.addFunction(
      name,
      binaryen.createType([ref, ref]),
      binaryen.i32,
      [],
      cond,
    );
    return name;
  };

  // The VL type of an expression *in the current instance's scope*. A generic
  // function is monomorphized per call, so a parameter's concrete shape lives in
  // the codegen scope, not the AST-inferred (declaration-time) type: resolve a
  // Name from scope and a PropertyAccess through its object's shape, falling back
  // to the AST type for literals/calls. (Name reads already use scope elsewhere;
  // this keeps object-shape resolution consistent with them.)
  // Flow-narrowing overlay (A5): inside `if x != null { … }`, `x`'s *type* is
  // narrowed to non-null here so member access resolves to the struct/array
  // shape. The local itself keeps its nullable wasm type (so `local.get` and
  // `struct.get`, which accepts a nullable ref, stay valid) — only the
  // type-level view is overridden, scoped to the branch.
  const narrowed: Record<string, VLType> = {};

  const codegenType = (node: VLProgramNode | VLStatement): VLType => {
    if (node.type === "Name") {
      if (node.name in narrowed) return narrowed[node.name];
      const found = lookupName(node.name);
      if (found) return found.type;
    }
    if (node.type === "PropertyAccess") {
      const obj = objectTypeOf(node.object);
      const field = obj.properties.find((p) =>
        p.name.type === "StringLiteral" && p.name.value === node.property
      );
      if (field) return field.type;
    }
    // Resolve an arithmetic result instance-aware (`self.x + b.x` → the operand's
    // concrete numeric); comparisons/logical → boolean. This lets a monomorphized
    // generic body's expressions concretize rather than carry declaration holes.
    if (node.type === "BinaryOperation" && node.operator !== "=") {
      if (COMPARE_OPS.has(node.operator)) {
        return { type: "Alias", name: "boolean" };
      }
      return codegenType(node.left);
    }
    // An object literal's field types come from its values (instance-aware), not
    // the once-inferred literal type.
    if (node.type === "ObjectLiteral") {
      return {
        type: "Object",
        properties: node.properties.map((p) => ({
          name: p.name.type === "Name"
            ? { type: "StringLiteral", value: p.name.name }
            : p.name.type === "StringLiteral"
            ? p.name
            : codegenType(p.name),
          type: codegenType(p.value),
        })),
      };
    }
    return vlType(node as Parameters<typeof vlType>[0]);
  };

  // Resolve an expression's structural object type (soften + unwrap an Infer).
  const objectTypeOf = (node: VLProgramNode | VLStatement): VLObjectType => {
    let t = softenImplicitType(codegenType(node));
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type !== "Object") {
      throw new Error(`Expected an object type, got "${t.type}"`);
    }
    return t;
  };

  // Resolve an expression's array type + (softened) element type, or null if it
  // isn't an array (e.g. a struct, which the caller handles separately).
  const arrayTypeOf = (
    node: VLProgramNode | VLStatement,
  ): { at: ArrayType; element: VLType } | null => {
    const element = arrayElementType(objectTypeOf(node));
    if (!element) return null;
    const soft = softenImplicitType(element);
    return { at: arrayType(soft), element: soft };
  };

  // A placeholder value of a captured variable's wasm type, used during the
  // capture-collection pass (whose body is discarded once captures are known).
  const zeroOf = (type: VLType): number => {
    const t = softenImplicitType(type);
    // A captured object is a struct ref; a null of its (nullable) ref type
    // suffices for the discarded pass-1 body.
    if (t.type === "Object" && t.name === undefined) {
      return m.ref.null(
        binaryen.getTypeFromHeapType(objectStruct(t).heapType, true),
      );
    }
    const wt = toWasmType(type);
    if (wt === binaryen.i64) return m.i64.const(BigInt(0));
    if (wt === binaryen.f32) return m.f32.const(0);
    if (wt === binaryen.f64) return m.f64.const(0);
    if (wt === binaryen.i32) return m.i32.const(0);
    throw new Error("Cannot capture this value type yet");
  };

  const getResolvedFunctionName = (name: string) => {
    let i = functionScopes.length - 1;
    while (i >= 0) {
      if (name in functionScopes[i]) return functionScopes[i][name];
      i--;
    }
    throw new Error(`Expected function ${name} to be in scope`);
  };

  // Emit the wasm function for `resolvedName` once. `paramTypes` supplies the
  // concrete parameter types to compile against (call-site argument types for a
  // direct call, the declaration's own types for a value reference) so that
  // untyped/inferred params (`function process(fn, a, b)`) get a real signature.
  const instantiate = (resolvedName: string, paramTypes: VLType[]): string => {
    const wasmParams = paramTypes.map(toWasmType);
    const key = `${resolvedName}#${wasmParams.join(",")}`;
    const cached = instances.get(key);
    if (cached) return cached;

    const count = instanceCounts[resolvedName] ?? 0;
    instanceCounts[resolvedName] = count + 1;
    const instanceName = count === 0 ? resolvedName : `${resolvedName}$${count}`;
    // Register before compiling the body so recursive self-calls resolve here.
    instances.set(key, instanceName);

    const { declaration } = functions[resolvedName];
    const oldReturnType = returnType;
    returnType = declaration.returnType;
    const oldReturnedWasmType = returnedWasmType;
    returnedWasmType = undefined;

    // Every function takes a leading `structref` environment parameter (local 0)
    // — null/ignored for a non-capturing function — so all function values share
    // one calling convention. The declared parameters therefore sit at index 1+.
    // With `collector` set, captured reads record themselves and emit a
    // placeholder; with `env` set, captured reads `ref.cast` the env parameter to
    // the closure's struct type and `struct.get` the field.
    const compileBody = (
      env: (EnvShape & { paramIndex: number }) | null,
      collector: Map<string, VLType> | null,
    ) => {
      const locals: number[] & { params?: number } = [];
      locals.params = declaration.parameters.length + 1;
      const oldCollector = captureCollector;
      const oldEnv = currentEnv;
      captureCollector = collector;
      currentEnv = env;
      functionBoundaries.push(scopes.length);
      const body = withScope(
        Object.fromEntries(
          declaration.parameters.map((
            p,
            i,
          ): [string, ScopeEntry] => [p.name, [paramTypes[i], i + 1]]),
        ),
        () =>
          withLocals(locals, () =>
            withDesiredType(
              declaration.returnType,
              () => toExpression(declaration.body),
            )),
      );
      functionBoundaries.pop();
      captureCollector = oldCollector;
      currentEnv = oldEnv;
      return { body, locals };
    };

    // Pass 1: discover captures. Its body is discarded if any are found.
    const collector = new Map<string, VLType>();
    let { body, locals } = compileBody(null, collector);

    if (collector.size) {
      const fields = [...collector.keys()];
      const env = buildEnvStruct(fields, fields.map((f) => collector.get(f)!));
      closures[instanceName] = env;
      // Pass 2: recompile with the env bound; captured reads -> cast + struct.get.
      ({ body, locals } = compileBody({ ...env, paramIndex: 0 }, null));
    }

    const params = binaryen.createType([binaryen.structref, ...wasmParams]);
    // An inferred return type (`Unknown`/`Infer`) has no wasm mapping; read the
    // actual result type back off the compiled body instead.
    let resultType: number;
    try {
      resultType = toWasmType(declaration.returnType);
    } catch {
      const bodyType = binaryen.getExpressionType(body);
      // A body ending in `return` (or a divergent `while true`) compiles to an
      // `unreachable` block; fall back to the recorded `return` value type — the
      // generic-inferred-return case where the declared type can't be mapped.
      resultType = bodyType === binaryen.unreachable &&
          returnedWasmType !== undefined
        ? returnedWasmType
        : bodyType;
    }
    instanceResult[instanceName] = resultType;
    m.addFunction(instanceName, params, resultType, locals, body);
    returnType = oldReturnType;
    returnedWasmType = oldReturnedWasmType;
    return instanceName;
  };

  // Reserve a table slot for an already-instantiated function, by its index.
  const tableIndexOf = (instanceName: string) => {
    const existing = functionTable.indexOf(instanceName);
    return existing === -1
      ? functionTable.push(instanceName) - 1
      : existing;
  };

  const getDirectFunction = (name: string, node: VLFunctionCallNode) => {
    // Don't need to instantiate built-ins
    if (ignoredKeys.has(name)) return name;

    const resolvedName = getResolvedFunctionName(name);
    // Compile the callee against this call's *unified parameter* types (the
    // call's instantiated signature), not the raw argument soft-types: for
    // `apply(addf, 1, 2)` the parameters resolve to f64 (from `addf`), so the
    // body must compile at f64 even though the literal arguments soften to i32.
    //
    // Exception: a *structural object* parameter must take the argument's own
    // shape, not the (possibly narrower) inferred param shape. WasmGC structs
    // aren't width-subtypes, and objects aren't coerced at the call boundary —
    // `getx({x, y})` passes an {x, y} struct, so the instance must be compiled
    // at {x, y} for `o.x` to read it. Numerics/functions keep the param type
    // (literals coerce to it; closures share one struct).
    const paramTypes = node.functionType
      ? node.functionType.paramaters.map((p, i) => {
        let pt = softenImplicitType(p.paramaterType);
        while (pt.type === "Infer") pt = softenImplicitType(pt.subType);
        if (pt.type === "Object" && pt.name === undefined && node.arguments[i]) {
          return softenImplicitType(vlType(node.arguments[i].value));
        }
        return p.paramaterType;
      })
      : node.arguments.map((a) => softenImplicitType(vlType(a.value)));
    return instantiate(resolvedName, paramTypes);
  };

  const getFunction = (node: VLFunctionCallNode) => {
    // Built-ins resolve directly to their wasm function name; they are never in
    // the value scope (the Program case filters Function-typed entries out), so
    // resolve them before getScopeEntry, which would otherwise throw.
    if (ignoredKeys.has(node.function)) return node.function;

    const [type, index] = getScopeEntry(node.function);

    if (type.type !== "Function") {
      throw new Error("Can only get function types");
    }

    let isDirect = true;
    try {
      getResolvedFunctionName(node.function);
    } catch {
      isDirect = false;
    }

    if (isDirect) return getDirectFunction(node.function, node);

    // Indirect: `node.function` is a value holding a closure struct (fat
    // pointer). Return that expression; the caller extracts its index + env.
    return m.local.get(index, closureStruct().refType);
  };

  let _locals: number[] & { params?: number };
  const withLocals = <T>(newLocals: number[], fn: () => T) => {
    const oldLocals = _locals;
    _locals = newLocals;
    const ret = fn();
    _locals = oldLocals;
    return ret;
  };
  // Allocate a fresh local of the given wasm type in the current function.
  const newLocal = (wasmType: number): number =>
    _locals.push(wasmType) - 1 + (_locals.params ?? 0);

  // Call a function *value* (a closure struct): stash it, then dispatch on its
  // table index, threading its environment as the leading argument.
  const indirectCall = (
    closureExpr: number,
    paramTypes: VLType[],
    operands: number[],
    returnType: number,
  ): number => {
    const clo = closureStruct().refType;
    const cloLocal = newLocal(clo);
    const idx = m.struct.get(0, m.local.get(cloLocal, clo), binaryen.i32, false);
    const env = m.struct.get(
      1,
      m.local.get(cloLocal, clo),
      binaryen.structref,
      false,
    );
    const indirect = m.call_indirect(
      "table",
      idx,
      [env, ...operands],
      binaryen.createType([binaryen.structref, ...paramTypes.map(toWasmType)]),
      returnType,
    );
    return m.block(
      null,
      [m.local.set(cloLocal, closureExpr), indirect],
      returnType,
    );
  };

  let lambdaCounter = 0;
  // Register a function declaration (named or anonymous) and return its unique
  // wasm-side name. Named functions key on their name (a shadowing nested decl
  // gets a numeric suffix) and bind a value-scope entry so later references
  // resolve; anonymous functions (used directly as a value) get a synthesized
  // name and bind nothing. The function emits no wasm here — it's instantiated
  // lazily on first use (direct call, or `closureValue` for a value).
  const registerFunctionDecl = (node: VLFunctionDeclarationNode): string => {
    const base = node.name ?? `__lambda_${lambdaCounter++}__`;
    let name = base;
    let i = 1;
    while (name in functions) name = `${base}_${i++}`;
    functions[name] = { declaration: node };
    if (node.name) {
      functionScopes[functionScopes.length - 1][node.name] = name;
      // The scope entry's index is unused for declared functions (-1).
      currentScope[node.name] = [vlType(node), -1];
    }
    return name;
  };

  const handleFunctionDecl = (node: VLFunctionDeclarationNode) => {
    registerFunctionDecl(node);
  };

  // Lower a statement list to wasm expressions. Nested function declarations
  // register lazily (emitting nothing); the tail (last non-declaration) keeps the
  // ambient desired type — so a value-producing block returns it, while a void
  // context (`__program__`) drops it — and earlier statements are always dropped.
  // Shared by the Program and Block cases.
  const lowerStatements = (statements: VLStatement[]): number[] => {
    let tail = -1;
    for (let i = statements.length - 1; i >= 0; i--) {
      if (statements[i].type !== "FunctionDeclaration") {
        tail = i;
        break;
      }
    }
    // Overlay entries we add for post-guard narrowing, restored at the end so
    // the narrowing doesn't leak past this statement list.
    const saved: Record<string, VLType | undefined> = {};
    const out: number[] = [];
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const v = stmt.type === "FunctionDeclaration"
        ? handleFunctionDecl(stmt)
        : i === tail
        ? toExpression(stmt)
        : withDesiredType(undefined, () => toExpression(stmt));
      if (typeof v === "number") out.push(v);
      // Post-guard narrowing (A5): after a divergent guard (`if x == null
      // { return }`), narrow `x` to non-null for the rest of this block.
      const name = postGuardNarrowing(stmt);
      if (name) {
        const entry = lookupName(name);
        if (entry) {
          if (!(name in saved)) saved[name] = narrowed[name];
          narrowed[name] = nonNullable(entry.type);
        }
      }
    }
    for (const name in saved) {
      if (saved[name] === undefined) delete narrowed[name];
      else narrowed[name] = saved[name];
    }
    return out;
  };

  const toExpressionRaw = (node: VLProgramNode | VLStatement): number => {
    // console.log(
    //   "toExpression",
    //   inspect(node, { depth: Infinity, compact: true }),
    //   desiredType,
    // );
    switch (node.type) {
      case "Program": {
        const modifiedScope = Object.fromEntries(
          Object.entries(node.scope)
            .filter(([k, v]) => !ignoredKeys.has(k) && v.type !== "Function")
            .map(([k, v], i): [string, ScopeEntry] => [k, [v, i]]),
        );
        const locals: number[] = [];
        functionBoundaries.push(scopes.length);
        return withLocals(locals, () =>
          withScope(
            modifiedScope,
            () =>
              m.addFunction(
                "__program__",
                binaryen.none,
                binaryen.none,
                // This really doesn't work with closures...
                locals,
                m.block(null, lowerStatements(node.statements)),
              ),
          ));
      }
      case "IntegerLiteral": {
        const type = desiredType?.type === "Object"
          ? desiredType?.name || "i32"
          : desiredType?.type === "Alias" // TODO: Should be concrete, but right now the built-ins have Aliases
          ? desiredType.name
          // No desired type: widen to the narrowest integer type that holds the
          // literal exactly (i32, else i64) rather than wrapping into i32.
          : defaultIntegerType(node.text, node.value) ?? "i64";
        if (
          type !== "i32" && type !== "i64" && type !== "f32" && type !== "f64"
        ) throw new Error("Expected numeric type");
        // binaryen >=120: i64.const takes a single bigint (was low/high i32 pair).
        if (type === "i64") return m.i64.const(BigInt(node.text));
        return m[type].const(node.value);
      }
      case "BooleanLiteral":
        return m.i32.const(node.value ? 1 : 0);
      case "NullLiteral": {
        // `null` takes its representation from the desired nullable type: a
        // niche sentinel for a nullable value type, else a typed `ref.null`.
        let dt = desiredType ? softenImplicitType(desiredType) : undefined;
        while (dt && dt.type === "Infer") dt = softenImplicitType(dt.subType);
        if (!dt || dt.type !== "Nullable") {
          throw new Error("`null` needs a nullable type from context");
        }
        // A boxed nullable union (`i32 | null`, `string | i32 | null`) → the
        // `null`-tagged box.
        const boxed = unionInfo(dt);
        if (boxed && boxed.hasNull) {
          return boxUnion(boxed, boxed.nullTag, null, null);
        }
        const sentinel = nullSentinel(dt.subType);
        if (sentinel !== null) return m.i32.const(sentinel);
        // `ref.null` takes a nullable ref *type* (not a heap type).
        return m.ref.null(
          binaryen.getTypeFromHeapType(refHeapType(dt.subType), true),
        );
      }
      case "Is": {
        const checksNull = node.checkType.type === "Alias" &&
          node.checkType.name === "null";
        // A boxed value union discriminates on its tag: `x is T` compares the
        // tag field to T's tag (`null` included).
        let t = softenImplicitType(codegenType(node.value));
        while (t.type === "Infer") t = softenImplicitType(t.subType);
        const info = unionInfo(t);
        if (info) {
          const tag = checksNull ? info.nullTag : variantTag(info, node.checkType);
          return m.i32.eq(
            m.struct.get(0, toExpression(node.value), binaryen.i32, false),
            m.i32.const(tag),
          );
        }
        // A niche / reference nullable: `x is null` → null test; `x is T` (T the
        // non-null variant) → its negation.
        const isNull = nullnessTest(node.value);
        return checksNull ? isNull : m.i32.eqz(isNull);
      }
      case "StringLiteral": {
        // A string literal is a WasmGC i32-array of its code points.
        const at = arrayType(i32Type);
        const chars = [...node.value].map((c) => m.i32.const(c.codePointAt(0)!));
        return m.array.new_fixed(at.heapType, chars);
      }
      case "RealLiteral": {
        const type = desiredType?.type === "Object"
          ? desiredType?.name || "f64"
          : desiredType?.type === "Alias" // TODO: Should be concrete, but right now the built-ins have Aliases
          ? desiredType.name
          : "f64";
        if (type !== "f32" && type !== "f64") {
          throw new Error("Expected numeric type");
        }
        return m[type].const(node.value);
      }
      case "FunctionCall": {
        // `print(x)` is a compiler builtin (no module/import system yet): lower
        // it to a type-appropriate host call. Numerics/bool go through a direct
        // value import; a string streams its char codes to the host (no linear
        // memory). We branch on the emitted value's wasm type so the call
        // signature always matches, refining i32 → bool/i32 and a ref → string
        // by the VL-level type.
        if (node.function === "print") {
          const arg = node.arguments[0].value;
          let t = softenImplicitType(codegenType(arg));
          while (t.type === "Infer") t = softenImplicitType(t.subType);
          const name = t.type === "Object" || t.type === "Alias"
            ? t.name
            : undefined;
          // Evaluate in value (wanted) position: a bare `toExpression` in
          // statement context would `drop` a function-call argument (yielding a
          // `none`-typed value). The argument's own type is the desired type.
          const value = withDesiredType(t, () => toExpression(arg));
          const wt = binaryen.getExpressionType(value);
          if (wt === binaryen.i64) {
            return m.call("__print_i64__", [value], binaryen.none);
          }
          if (wt === binaryen.f32) {
            return m.call("__print_f32__", [value], binaryen.none);
          }
          if (wt === binaryen.f64) {
            return m.call("__print_f64__", [value], binaryen.none);
          }
          if (wt === binaryen.i32) {
            return m.call(
              name === "boolean" ? "__print_bool__" : "__print_i32__",
              [value],
              binaryen.none,
            );
          }
          if (name === "string") {
            return m.call(printStringFn(), [value], binaryen.none);
          }
          throw new Error(
            `print: unsupported argument type "${name ?? t.type}" ` +
              "(only numerics, boolean, and string are supported so far)",
          );
        }
        const func = getFunction(node) as unknown as string | number;
        // For an indirect call the callee is a value whose concrete signature
        // is bound in scope by the current monomorphization (more precise than
        // the AST's once-inferred `functionType`, which may still hold holes).
        let functionType = node.functionType;
        if (typeof func !== "string") {
          const scoped = getScopeEntry(node.function)[0];
          if (scoped.type === "Function") functionType = scoped;
        }
        if (!functionType) {
          throw new Error("Expected functionType to be set on function");
        }

        // TODO: named params
        const operands = node.arguments.map((a, i) =>
          withDesiredType(
            functionType.paramaters[i]?.paramaterType,
            () => toExpression(a.value),
          )
        );
        // Direct calls to functions with an inferred return type read their
        // result type from the emitted instance; otherwise map the declared type.
        const returnType = typeof func === "string" && func in instanceResult
          ? instanceResult[func]
          : toWasmType(functionType.return);

        let call: number;
        if (typeof func === "string") {
          if (ignoredKeys.has(func)) {
            // `__store_string__` is emitted lazily as a wasm helper (it needs the
            // string array type); ensure it exists before the call.
            if (func === "__store_string__") storeStringFn();
            // A builtin: it has its own signature with no environment parameter.
            call = m.call(func, operands, returnType);
          } else {
            // A VL function: prepend the environment (captures struct or null).
            call = m.call(func, [envArgFor(func), ...operands], returnType);
          }
        } else {
          // Indirect call through a function value (closure struct).
          call = indirectCall(
            func,
            functionType.paramaters.map((p) => p.paramaterType),
            operands,
            returnType,
          );
        }

        return !hasDesiredType() && returnType !== binaryen.none
          ? m.drop(call)
          : call;
      }
      case "Call": {
        // Calling an arbitrary expression value, e.g. `o.f(args)`. The callee
        // evaluates to a closure struct; dispatch through it.
        const functionType = node.functionType;
        if (!functionType) {
          throw new Error("Expected functionType to be set on a Call");
        }
        const operands = node.arguments.map((a, i) =>
          withDesiredType(
            functionType.paramaters[i]?.paramaterType,
            () => toExpression(a.value),
          )
        );
        const returnType = toWasmType(functionType.return);
        const call = indirectCall(
          toExpression(node.callee),
          functionType.paramaters.map((p) => p.paramaterType),
          operands,
          returnType,
        );
        return !hasDesiredType() && returnType !== binaryen.none
          ? m.drop(call)
          : call;
      }
      case "VariableDeclaration": {
        const index = _locals.push(toWasmType(node.variableType)) - 1 +
          (_locals.params ?? 0);
        currentScope[node.name] = [node.variableType, index];
        if (node.value) {
          return m.local.set(
            index,
            withDesiredType(node.variableType, () => toExpression(node.value!)),
          );
        }
        return m.i32.const(0); // Hmm...
      }
      case "FunctionDeclaration": {
        // A function literal in value position (RHS of a binding, an object
        // field, an argument): register it and produce its fat-pointer closure
        // value — the same representation a function-name reference yields.
        return closureValue(registerFunctionDecl(node));
      }
      case "Name": {
        const found = lookupName(node.name);
        if (found?.capture) {
          // A closed-over variable: read from the environment (or, during the
          // capture-collection pass, record it and emit a typed placeholder).
          if (currentEnv) {
            // The env parameter is a generic `structref`; cast to this closure's
            // env struct, then read the captured field.
            return m.struct.get(
              currentEnv.fields.indexOf(node.name),
              m.ref.cast(
                m.local.get(currentEnv.paramIndex, binaryen.structref),
                currentEnv.refType,
              ),
              toWasmType(found.type),
              false,
            );
          }
          if (captureCollector) {
            if (!captureCollector.has(node.name)) {
              captureCollector.set(node.name, found.type);
            }
            return zeroOf(found.type);
          }
        }
        const entry = getScopeEntry(node.name);
        if (entry[0].type === "Function") {
          // A function used as a value. A declared function becomes a fresh fat
          // pointer (table index + environment); a function-valued local (e.g. a
          // parameter) already holds a closure struct.
          let resolved: string | null = null;
          try {
            resolved = getResolvedFunctionName(node.name);
          } catch {
            resolved = null;
          }
          return resolved
            ? closureValue(resolved)
            : m.local.get(entry[1], closureStruct().refType);
        }
        // A union local narrowed to a single concrete variant (`if x is i32
        // { x }`) is read as that variant — pull the payload out of the
        // `{ tag, value }` struct and recover the variant. Only when narrowed to
        // exactly one *non-null* member (a sub-union, or a bare `null`, stays
        // boxed).
        const info = unionInfo(entry[0]);
        if (info && node.name in narrowed) {
          const nt = narrowed[node.name];
          const member = findVariant(info, nt);
          if (member && variantTag(info, nt) !== info.nullTag && !unionInfo(nt)) {
            const payload = m.struct.get(
              1,
              m.local.get(entry[1], info.refType),
              info.payloadWasm,
              false,
            );
            // Recover against the union's own member type (canonical), not the
            // narrowed alias, which may not be classifiable on its own.
            return unboxPayload(info, member, payload);
          }
        }
        return m.local.get(entry[1], toWasmType(entry[0]));
      }
      case "ObjectLiteral": {
        const struct = objectStruct(objectTypeOf(node));
        // Fields are emitted in the struct's (sorted) order, each from its
        // matching literal property.
        const operands = struct.fields.map((f) => {
          const prop = node.properties.find((p) =>
            (p.name.type === "Name" && p.name.name === f.name) ||
            (p.name.type === "StringLiteral" && p.name.value === f.name)
          );
          if (!prop) throw new Error(`Object literal missing field "${f.name}"`);
          return withDesiredType(f.type, () => toExpression(prop.value));
        });
        return m.struct.new(operands, struct.heapType);
      }
      case "ArrayLiteral": {
        const info = arrayTypeOf(node);
        if (!info) throw new Error("Array literal did not resolve to an array");
        const values = node.values.map((v) =>
          withDesiredType(info.element, () => toExpression(v))
        );
        return m.array.new_fixed(info.at.heapType, values);
      }
      case "IndexAccess": {
        const info = arrayTypeOf(node.array);
        if (!info) throw new Error("Index access on a non-array");
        return m.array.get(
          toExpression(node.array),
          withDesiredType(i32Type, () => toExpression(node.index)),
          toWasmType(info.element),
          false,
        );
      }
      case "PropertyAccess": {
        const objType = objectTypeOf(node.object);
        // `array.length` is intrinsic — lower it to `array.len` (no stored field).
        if (arrayElementType(objType)) {
          if (node.property === "length") {
            return m.array.len(toExpression(node.object));
          }
          throw new Error(`Array has no member "${node.property}"`);
        }
        const struct = objectStruct(objType);
        const field = struct.fields.find((f) => f.name === node.property);
        if (!field) {
          throw new Error(`Object has no field "${node.property}"`);
        }
        return m.struct.get(
          field.index,
          toExpression(node.object),
          toWasmType(field.type),
          false,
        );
      }
      case "UnaryOperation": {
        const op = node.operator;
        // Logical not on a boolean (an i32 0/1): eqz maps 0→1, nonzero→0.
        if (op === "!") {
          return m.i32.eqz(toExpression(node.operand));
        }
        // `++` / `--` mutate a variable (the AST guards non-Name operands).
        if (node.operand.type !== "Name") {
          throw new Error(`${op} requires a variable operand`);
        }
        const [, idx] = getScopeEntry(node.operand.name);
        const delta = op === "++" ? 1 : -1;
        const next = m.i32.add(
          m.local.get(idx, binaryen.i32),
          m.i32.const(delta),
        );
        // In statement position the result is unused — just mutate.
        if (!hasDesiredType()) return m.local.set(idx, next);
        // Prefix returns the new value; postfix returns the old (undo the delta
        // after tee-ing the incremented value back).
        const teed = m.local.tee(idx, next, binaryen.i32);
        return node.prefix ? teed : m.i32.sub(teed, m.i32.const(delta));
      }
      case "BinaryOperation": {
        const op = node.operator;
        // Assignment is handled before the operator-method machinery below: the
        // LHS (a Name or `obj.field`) is not a value to evaluate, and an object
        // type carries no `=` method to look up.
        if (op === "=") {
          if (node.left.type === "IndexAccess") {
            const access = node.left;
            const info = arrayTypeOf(access.array);
            if (!info) throw new Error("Index assignment on a non-array");
            const index = withDesiredType(
              i32Type,
              () => toExpression(access.index),
            );
            const value = withDesiredType(
              info.element,
              () => toExpression(node.right),
            );
            const set = m.array.set(
              toExpression(access.array),
              index,
              value,
            );
            // In value position, read the element back.
            const wasmType = toWasmType(info.element);
            return desiredType
              ? m.block(null, [
                set,
                m.array.get(
                  toExpression(access.array),
                  withDesiredType(i32Type, () => toExpression(access.index)),
                  wasmType,
                  false,
                ),
              ], wasmType)
              : set;
          }
          if (node.left.type === "PropertyAccess") {
            const access = node.left;
            const struct = objectStruct(objectTypeOf(access.object));
            const field = struct.fields.find((f) => f.name === access.property);
            if (!field) {
              throw new Error(`Object has no field "${access.property}"`);
            }
            const value = withDesiredType(
              field.type,
              () => toExpression(node.right),
            );
            const set = m.struct.set(
              field.index,
              toExpression(access.object),
              value,
            );
            // In value position, read the field back (re-evaluates the object).
            const wasmType = toWasmType(field.type);
            return desiredType
              ? m.block(null, [
                set,
                m.struct.get(
                  field.index,
                  toExpression(access.object),
                  wasmType,
                  false,
                ),
              ], wasmType)
              : set;
          }
          if (node.left.type !== "Name") {
            throw new Error(`binop = for non-names/properties not handled`);
          }
          const [type, localIndex] = getScopeEntry(node.left.name);
          const wasmType = toWasmType(type);
          const set = m.local.set(
            localIndex,
            withDesiredType(type, () => toExpression(node.right)),
          );
          return desiredType
            ? m.block(null, [set, m.local.get(localIndex, wasmType)], wasmType)
            : set;
        }
        // `x == null` / `x != null`: a nullness test (sentinel compare for a
        // niche-nullable, `ref.is_null` for a nullable ref). Handled before
        // operand typing, since `null` carries no numeric/operator type.
        if (op === "==" || op === "!=") {
          const leftNull = node.left.type === "NullLiteral";
          const rightNull = node.right.type === "NullLiteral";
          if (leftNull || rightNull) {
            const isNull = nullnessTest(leftNull ? node.right : node.left);
            return op === "==" ? isNull : m.i32.eqz(isNull);
          }
        }
        // Resolve from the instance scope (not the once-inferred AST type), so a
        // monomorphized generic's operand — e.g. `self.x` where `self` is bound to
        // a concrete shape this instance — is seen as its concrete numeric type.
        const leftType = softenImplicitType(codegenType(node.left));
        const NUMERIC = ["i32", "i64", "f32", "f64", "boolean"];
        let rightType: VLType;
        {
          if (leftType.type !== "Object") rightType = leftType;
          // A builtin numeric op is symmetric: the right operand takes the
          // left's concrete numeric type, so a literal coerces to it (`i64var *
          // 2` lowers `2` as i64, not its i32 default). Using the operator
          // method's param type instead would yield a `Union` the literal
          // codegen can't resolve.
          else if (leftType.name && NUMERIC.includes(leftType.name)) {
            rightType = leftType;
          } else {
            const opFunc = leftType.properties.find((p) =>
              validateType(p.name, { type: "StringLiteral", value: op })
            )?.type;
            rightType = opFunc?.type === "Function"
              ? opFunc.paramaters[0].paramaterType ?? raise("op missing param")
              // Structural `==`/`!=` has no operator method — the right operand
              // is just the same object type.
              : (op === "==" || op === "!=")
              ? leftType
              : raise("op not function");
          }
        }

        // Function values compare by reference (same function + same env).
        if (leftType.type === "Function" && (op === "==" || op === "!=")) {
          const clo = closureStruct().refType;
          const aLocal = newLocal(clo);
          const bLocal = newLocal(clo);
          const eq = closureRefEq(
            () => m.local.get(aLocal, clo),
            () => m.local.get(bLocal, clo),
          );
          return m.block(null, [
            m.local.set(aLocal, toExpression(node.left)),
            m.local.set(bLocal, toExpression(node.right)),
            op === "==" ? eq : m.i32.eqz(eq),
          ], binaryen.i32);
        }
        // Array `==`/`!=`: length + element compare via a per-element-type
        // helper (recurses through `valueEq`). Must precede the structural-struct
        // branch below, which would otherwise treat the array as a struct.
        if (
          leftType.type === "Object" && leftType.name === undefined &&
          (op === "==" || op === "!=")
        ) {
          const element = arrayElementType(leftType);
          if (element) {
            const eq = m.call(
              arrayEqFn(element),
              [toExpression(node.left), toExpression(node.right)],
              binaryen.i32,
            );
            return op === "==" ? eq : m.i32.eqz(eq);
          }
        }
        // String operators (strings are WasmGC i32-arrays of char codes):
        // `==`/`!=` element-compare via the `__string_eq__` helper; `+`
        // concatenates (allocate an i32-array of len(a)+len(b) and copy in).
        if (leftType.type === "Object" && leftType.name === "string") {
          if (op === "==" || op === "!=") {
            const eq = m.call(
              stringEqFn(),
              [toExpression(node.left), toExpression(node.right)],
              binaryen.i32,
            );
            return op === "==" ? eq : m.i32.eqz(eq);
          }
          if (op !== "+") raise(`string operator ${op} not implemented`);
          const at = arrayType(i32Type);
          const aLocal = newLocal(at.refType);
          const bLocal = newLocal(at.refType);
          const outLocal = newLocal(at.refType);
          const a = () => m.local.get(aLocal, at.refType);
          const b = () => m.local.get(bLocal, at.refType);
          const out = () => m.local.get(outLocal, at.refType);
          return m.block(null, [
            m.local.set(aLocal, toExpression(node.left)),
            m.local.set(bLocal, toExpression(node.right)),
            m.local.set(
              outLocal,
              m.array.new(
                at.heapType,
                m.i32.add(m.array.len(a()), m.array.len(b())),
                m.i32.const(0),
              ),
            ),
            m.array.copy(
              out(),
              m.i32.const(0),
              a(),
              m.i32.const(0),
              m.array.len(a()),
            ),
            m.array.copy(
              out(),
              m.array.len(a()),
              b(),
              m.i32.const(0),
              m.array.len(b()),
            ),
            out(),
          ], at.refType);
        }
        if (
          leftType.type === "Object" &&
          (leftType.name === "i32" || leftType.name === "i64" ||
            leftType.name === "boolean" || leftType.name === "f32" ||
            leftType.name === "f64")
        ) {
          // Native numeric op. Integer types (incl. boolean, an i32) share one
          // signed op set; float types share another. The wasm namespace is the
          // type's name — `m.i64.add`, `m.f32.lt`, … — with boolean using i32.
          const name = leftType.name;
          const isInt = name === "i32" || name === "i64" || name === "boolean";
          const wasmName = name === "boolean" ? "i32" : name;
          const method = (isInt ? INT_BINOPS : FLOAT_BINOPS)[op] ??
            raise(`binop ${op} not handled on ${name}`);
          return m[wasmName][method](
            withDesiredType(leftType, () => toExpression(node.left)),
            withDesiredType(rightType, () => toExpression(node.right)),
          );
        }
        // Structural equality on a plain data struct (no custom `==`/`!=`
        // operator field): compare fields recursively via a per-shape helper.
        if (
          leftType.type === "Object" && leftType.name === undefined &&
          (op === "==" || op === "!=")
        ) {
          const objType = objectTypeOf(node.left);
          const hasCustom = objectStruct(objType).fields.some((f) =>
            f.name === op
          );
          if (!hasCustom) {
            const eq = m.call(
              objectEqFn(objType),
              [toExpression(node.left), toExpression(node.right)],
              binaryen.i32,
            );
            return op === "==" ? eq : m.i32.eqz(eq);
          }
        }
        // User-defined operator: a structural object carries a method field named
        // for the operator (e.g. `"+"`). Dispatch through it like a member call —
        // `struct.get` the method closure, then `indirectCall` with the right
        // operand. (The type checker already verified the method + operand.)
        if (leftType.type === "Object" && leftType.name === undefined) {
          const struct = objectStruct(objectTypeOf(node.left));
          const field = struct.fields.find((f) => f.name === op);
          const methodType = field ? softenImplicitType(field.type) : undefined;
          if (!field || !methodType || methodType.type !== "Function") {
            throw new Error(`Object has no operator method "${op}"`);
          }
          const closure = m.struct.get(
            field.index,
            toExpression(node.left),
            closureStruct().refType,
            false,
          );
          const operand = withDesiredType(
            methodType.paramaters[0]?.paramaterType,
            () => toExpression(node.right),
          );
          return indirectCall(
            closure,
            methodType.paramaters.map((p) => p.paramaterType),
            [operand],
            toWasmType(methodType.return),
          );
        }
        throw new Error(
          `Have only handled i32 with ${op}, got ${leftType.type}${
            leftType.type === "Object"
              ? leftType.name ? ` (${leftType.name})` : ""
              : ""
          }`,
        );
      }
      case "Block": {
        const stmts = withScope({}, () => lowerStatements(node.statements));
        // The block's result type follows the desired type — but a generic body's
        // desired type can be an unresolved inference hole (e.g. an inferred
        // return `Union<Infer, Infer>`) with no wasm mapping. Then take the
        // concrete type of the block's tail expression instead.
        let blockType: number | undefined = undefined;
        if (desiredType) {
          try {
            blockType = toWasmType(desiredType);
          } catch {
            const tail = stmts[stmts.length - 1];
            const t = tail !== undefined ? binaryen.getExpressionType(tail) : 0;
            if (t !== binaryen.none && t !== binaryen.unreachable) blockType = t;
          }
        }
        return m.block(null, stmts, blockType);
      }
      case "If": {
        const cond = node.conditionals[0].condition;
        // Flow narrowing (A5): inside `if x is A { … }`, override `x`'s type in
        // the `narrowed` overlay while compiling that branch, then restore.
        const narrow = conditionNarrowing(cond);
        const withNarrowed = <T>(name: string, type: VLType, body: () => T) => {
          const prev = narrowed[name];
          narrowed[name] = type;
          const r = body();
          if (prev === undefined) delete narrowed[name];
          else narrowed[name] = prev;
          return r;
        };
        // The variable's type *as currently narrowed* (an outer branch may have
        // already refined it), so nested narrowings compose rather than reset.
        const curType = (name: string) =>
          narrowed[name] ?? lookupName(name)?.type;
        const thenStmt = () => toExpression(node.conditionals[0].statement);
        const thenBranch = () => {
          const base = narrow && curType(narrow.name);
          return narrow?.nonNullOn === "then" && base
            ? withNarrowed(
              narrow.name,
              narrow.thenType ?? nonNullable(base),
              thenStmt,
            )
            : thenStmt();
        };
        // The else side (a further `else if` chain, or the `else`), narrowed by
        // the condition's complement — `if x is A { … } else { /* x: U − A */ }`.
        const elseStmt = (): number | undefined =>
          node.conditionals.length > 1
            ? toExpression({ ...node, conditionals: node.conditionals.slice(1) })
            : node.else
            ? toExpression(node.else)
            : undefined;
        const elseBranch = (): number | undefined => {
          const hasElse = node.conditionals.length > 1 || node.else !== undefined;
          const base = narrow && curType(narrow.name);
          if (hasElse && base) {
            const elseType = elseNarrowing(cond, base);
            if (elseType && elseType.type !== "Never") {
              return withNarrowed(narrow!.name, elseType, elseStmt);
            }
          }
          return elseStmt();
        };
        return m.if(
          withDesiredType(
            { type: "Alias", name: "boolean" },
            () => toExpression(cond),
          ),
          thenBranch(),
          elseBranch(),
        );
      }
      case "Return":
        // TODO: need returnType in global scope
        return withDesiredType(returnType, () => {
          if (!node.value) return m.return(undefined);
          const value = toExpression(node.value);
          // Record the concrete result type for `instantiate`'s fallback (used
          // when the body ends in `return` so its block is `unreachable`).
          const vt = binaryen.getExpressionType(value);
          if (vt !== binaryen.unreachable) returnedWasmType = vt;
          return m.return(value);
        });
      case "While": {
        // (block $brk (loop $cont (br_if $brk (eqz cond)) body (br $cont)))
        // $cont is the continue target (re-checks the condition each pass).
        const cont = node.label ?? `loop${loopIndex++}`;
        const brk = brkLabel(cont);
        loopLabels.push(cont);
        const loop = m.block(brk, [
          m.loop(
            cont,
            m.block(null, [
              m.br(brk, m.i32.eqz(toExpression(node.condition))),
              toExpression(node.statement),
              m.br(cont),
            ]),
          ),
        ]);
        loopLabels.pop();
        return loop;
      }
      case "For": {
        // (block $brk
        //   i = from                          ; declares the loop variable
        //   to = <to>, step = <step>          ; evaluated once into locals
        //   (loop $loop
        //     ;; inclusive, direction-aware exit:
        //     (br_if $brk ((step>=0 && i>to) || (step<0 && i<to)))
        //     (block $cont body)               ; continue → falls through to step
        //     i = i + step
        //     (br $loop)))
        const cont = node.label ?? `loop${loopIndex++}`;
        const loopLabel = `${cont}__loop`;
        const brk = brkLabel(cont);
        loopLabels.push(cont);
        const variableType = softenImplicitType(vlType(node.from));
        const stepExpr: VLStatement = node.step ??
          { type: "IntegerLiteral", value: 1, text: "1" };
        const toLocal = newLocal(binaryen.i32);
        const stepLocal = newLocal(binaryen.i32);
        // Declare the loop variable (i = from); this registers its scope entry.
        const declare = toExpression({
          type: "VariableDeclaration",
          name: node.variable,
          variableType,
          value: node.from,
          mutable: true,
        });
        const [, varIndex] = getScopeEntry(node.variable);
        const i = () => m.local.get(varIndex, binaryen.i32);
        const to = () => m.local.get(toLocal, binaryen.i32);
        const step = () => m.local.get(stepLocal, binaryen.i32);
        const loop = m.block(brk, [
          declare,
          m.local.set(toLocal, withDesiredType(i32Type, () => toExpression(node.to))),
          m.local.set(stepLocal, withDesiredType(i32Type, () => toExpression(stepExpr))),
          m.loop(
            loopLabel,
            m.block(null, [
              // Inclusive exit; the comparison flips with the step's sign so
              // descending loops (negative step) work, not just ascending ones.
              m.br(
                brk,
                m.i32.or(
                  m.i32.and(
                    m.i32.ge_s(step(), m.i32.const(0)),
                    m.i32.gt_s(i(), to()),
                  ),
                  m.i32.and(
                    m.i32.lt_s(step(), m.i32.const(0)),
                    m.i32.lt_s(i(), to()),
                  ),
                ),
              ),
              m.block(cont, [toExpression(node.statement)]),
              m.local.set(varIndex, m.i32.add(i(), step())),
              m.br(loopLabel),
            ]),
          ),
        ]);
        loopLabels.pop();
        return loop;
      }
      case "ForIn": {
        // (block $brk
        //   arr = <iterable>                 ; evaluated once
        //   len = array.len(arr)
        //   i = 0
        //   (loop $loop
        //     (br_if $brk (i >= len))
        //     var = array.get(arr, i)        ; bind the element
        //     (block $cont body)
        //     i = i + 1
        //     (br $loop)))
        const cont = node.label ?? `loop${loopIndex++}`;
        const loopLabel = `${cont}__loop`;
        const brk = brkLabel(cont);
        loopLabels.push(cont);

        const info = arrayTypeOf(node.iterable);
        if (!info) throw new Error("for…in over a non-array");
        const elemWasm = toWasmType(info.element);
        const arrLocal = newLocal(info.at.refType);
        const lenLocal = newLocal(binaryen.i32);
        const iLocal = newLocal(binaryen.i32);
        const varLocal = newLocal(elemWasm);
        // The body resolves the loop variable to its local (element type).
        currentScope[node.variable] = [info.element, varLocal];
        const arr = () => m.local.get(arrLocal, info.at.refType);
        const i = () => m.local.get(iLocal, binaryen.i32);

        const loop = m.block(brk, [
          m.local.set(arrLocal, toExpression(node.iterable)),
          m.local.set(lenLocal, m.array.len(arr())),
          m.local.set(iLocal, m.i32.const(0)),
          m.loop(
            loopLabel,
            m.block(null, [
              m.br(brk, m.i32.ge_s(i(), m.local.get(lenLocal, binaryen.i32))),
              m.local.set(varLocal, m.array.get(arr(), i(), elemWasm, false)),
              m.block(cont, [toExpression(node.statement)]),
              m.local.set(iLocal, m.i32.add(i(), m.i32.const(1))),
              m.br(loopLabel),
            ]),
          ),
        ]);
        loopLabels.pop();
        return loop;
      }
      case "Continue":
        return m.br(node.label ?? loopLabels[loopLabels.length - 1]);
      case "Break":
        // Branch to the (innermost, or labelled) loop's break target — the outer
        // block, so control resumes after the whole loop.
        return m.br(
          brkLabel(node.label ?? loopLabels[loopLabels.length - 1]),
        );
      default:
        throw new Error(
          `Unhandled AST -> WASM "${(node as { type: string }).type}" expression`,
        );
    }
  };

  // VLType -> binaryen wasm type, bound to this module's binaryen instance.
  // The WasmGC heap type backing a reference-typed VL type (struct / array /
  // string / closure). Used to form a *nullable* ref (`ref null $t`) for a
  // `Nullable<T>`. A non-reference subtype (numeric) would need boxing.
  const refHeapType = (node: VLType): number => {
    let t = softenImplicitType(node);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "Function") return closureStruct().heapType;
    if (t.type === "Object") {
      const element = arrayElementType(t);
      if (element) return arrayType(element).heapType;
      if (t.name === undefined) return objectStruct(t).heapType;
    }
    throw new Error(
      `Nullable of non-reference type "${
        t.type === "Object" ? t.name : t.type
      }" needs boxing (not yet supported)`,
    );
  };

  // A *niche* encoding for a nullable value type — `null` hides in a spare value
  // of the payload, so no box (Rust's `Option<bool>`). A `boolean` is 0/1, so 2
  // encodes `null` in a plain i32. Returns the sentinel, or null when the
  // subtype is a reference (use a nullable ref + `ref.null` instead).
  const NULL_SENTINEL = 2;
  const nullSentinel = (subType: VLType): number | null => {
    let t = softenImplicitType(subType);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    return t.type === "Object" && t.name === "boolean" ? NULL_SENTINEL : null;
  };

  // `<value> is null` test: a sentinel compare for a niche-nullable, else
  // `ref.is_null` for a nullable ref.
  const nullnessTest = (valueExpr: VLProgramNode | VLStatement): number => {
    let t = softenImplicitType(codegenType(valueExpr));
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    // A boxed nullable value union → compare its tag field to the `null` tag.
    const info = unionInfo(t);
    if (info && info.hasNull) {
      return m.i32.eq(
        m.struct.get(0, toExpression(valueExpr), binaryen.i32, false),
        m.i32.const(info.nullTag),
      );
    }
    const sentinel = t.type === "Nullable" ? nullSentinel(t.subType) : null;
    const value = toExpression(valueExpr);
    return sentinel !== null
      ? m.i32.eq(value, m.i32.const(sentinel))
      : m.ref.is_null(value);
  };

  const toWasmType = (node: VLType): number => {
    let t = softenImplicitType(node);
    // Unwrap inference holes resolved during monomorphization (`Infer<i32>` ->
    // i32); softening keeps the wrapper, but codegen wants the concrete type.
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    // A value union (`boolean | i32`, `i32 | null` — no niche) is a boxed tagged
    // GC struct. Binaryen's Heap2Local scalarizes the box where it doesn't
    // escape, so the common case costs no allocation.
    const info = unionInfo(t);
    if (info) return info.refType;
    // A nullable value type with a niche → its payload's wasm type (the sentinel
    // lives in a spare value). A nullable reference → a nullable ref.
    if (t.type === "Nullable") {
      if (nullSentinel(t.subType) !== null) return binaryen.i32;
      return binaryen.getTypeFromHeapType(refHeapType(t.subType), true);
    }
    if (t.type === "Object") {
      // An `i32`-index-sig object is a WasmGC array — this covers `[i32]`-arrays
      // and `string` (an i32-array of char codes). A *structural* object (no
      // builtin `name`) without an index sig is a WasmGC struct.
      const element = arrayElementType(t);
      if (element) return arrayType(element).refType;
      if (t.name === undefined) return objectStruct(t).refType;
    }
    // A function value is a fat-pointer closure struct.
    if (t.type === "Function") return closureStruct().refType;
    return toWasmTypeOf(binaryen, t);
  };

  // --- Tagged unions (WasmGC structs) ---
  // A union is a `{ tag: i32, value }` struct: `tag` selects the variant, `value`
  // carries the payload. Two payload shapes:
  //   • "value" kind — every member shares one numeric/boolean wasm rep
  //     (`boolean | i32`, `i32 | null`): `value` is that rep directly. The common,
  //     cheap case; binaryen's Heap2Local scalarizes the box where it doesn't
  //     escape, so it usually costs no allocation.
  //   • "boxed" kind — reference members or mixed reps (`string | i32`,
  //     `{x} | {y}`, `boolean | i64`): `value` is `anyref`. A reference member is
  //     stored as-is; a value member is wrapped in a one-field `{ rep }` box. A
  //     variant is recovered by `ref.cast` (+ a `struct.get` for value members).
  // (Niche cases — a nullable reference, and `boolean | null` via a sentinel —
  // stay unboxed; `unionInfo` returns null for them so they keep their encoding.)
  type UnionKind = "value" | "boxed";
  type UnionInfo = {
    kind: UnionKind;
    variants: VLType[]; // the non-null members, in a canonical (key) order
    hasNull: boolean;
    payloadWasm: number; // value: the shared rep; boxed: `anyref`
    heapType: number;
    refType: number;
    nullTag: number; // the tag value standing for `null`, or -1 when not nullable
  };
  const UNION_REPS = ["i32", "i64", "f32", "f64", "boolean"];
  // The builtin scalar name backing a type (`i32`/`boolean`/…), or null for a
  // reference type, `null`, or anything without a uniform value representation.
  const valueTypeName = (type: VLType): string | null => {
    let t = softenImplicitType(type);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "BooleanLiteral") return "boolean";
    const name =
      t.type === "Object" || t.type === "Alias" || t.type === "Custom"
        ? t.name
        : undefined;
    return name && UNION_REPS.includes(name) ? name : null;
  };
  // The wasm rep for a builtin scalar name (`boolean` rides in an i32).
  const repWasm = (name: string): number =>
    name === "i64"
      ? binaryen.i64
      : name === "f32"
      ? binaryen.f32
      : name === "f64"
      ? binaryen.f64
      : binaryen.i32;
  // A stable discriminant key for a variant — a value member by (rep, boolean?)
  // so `boolean` and `i32` (same rep) stay distinct while an `i32` *literal*
  // still matches the `i32` member; a reference member by its interned wasm ref
  // type so distinct shapes get distinct tags. Used both to order variants
  // canonically and to map a checked/assigned type back to its tag.
  const variantKey = (type: VLType): string => {
    let t = softenImplicitType(type);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "Alias" && t.name === "null") return "null";
    const vn = valueTypeName(t);
    if (vn !== null) return `v:${repWasm(vn)}:${vn === "boolean" ? "b" : "n"}`;
    // A bare numeric literal carries no scalar `name`, but its rep is fixed.
    if (t.type === "IntegerLiteral") return `v:${binaryen.i32}:n`;
    if (t.type === "RealLiteral") return `v:${binaryen.f64}:n`;
    return `r:${toWasmType(t)}`;
  };
  // A *globally* stable tag per variant key (and for `null`). Tags must agree
  // across every union a value flows through — in particular a value boxed as
  // `string | i32 | boolean` keeps its tag when narrowed to the sub-union
  // `i32 | boolean`, so the tag cannot be a per-union dense index; it is interned
  // here so the same variant always maps to the same tag.
  const unionTags = new Map<string, number>();
  const tagOf = (key: string): number => {
    let tag = unionTags.get(key);
    if (tag === undefined) {
      tag = unionTags.size;
      unionTags.set(key, tag);
    }
    return tag;
  };
  // Intern the `{ tag: i32, value: <payload> }` struct by payload wasm type, so
  // unions sharing a payload share one struct (all boxed unions share `anyref`;
  // `boolean | i32` and `i32 | null` share i32).
  const unionStructs = new Map<number, { heapType: number; refType: number }>();
  const unionStruct = (payloadWasm: number) => {
    let cached = unionStructs.get(payloadWasm);
    if (!cached) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setStructType(0, [
        { type: binaryen.i32, packedType: binaryen.notPacked, mutable: false },
        { type: payloadWasm, packedType: binaryen.notPacked, mutable: false },
      ]);
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
      };
      unionStructs.set(payloadWasm, cached);
    }
    return cached;
  };
  // Intern the one-field `{ rep }` box that wraps a value member inside a boxed
  // union's `anyref` payload (keyed by rep).
  const valueBoxStructs = new Map<number, { heapType: number; refType: number }>();
  const valueBoxStruct = (rep: number) => {
    let cached = valueBoxStructs.get(rep);
    if (!cached) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setStructType(0, [
        { type: rep, packedType: binaryen.notPacked, mutable: false },
      ]);
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
      };
      valueBoxStructs.set(rep, cached);
    }
    return cached;
  };
  // Describe a tagged union, or null if `type` isn't one (a niche nullable, or a
  // non-union). Variants are sorted by `variantKey` so tag assignment is
  // canonical — `boolean | i32` and `i32 | boolean` agree, so a value flows
  // between the two orderings soundly.
  const unionInfo = (type: VLType): UnionInfo | null => {
    let t = softenImplicitType(type);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    let raw: VLType[];
    let hasNull: boolean;
    if (t.type === "Union") {
      // `flattenType` usually pulls `null` out into a `Nullable`, but tolerate a
      // stray `null` member (extracted below).
      raw = t.subTypes;
      hasNull = false;
    } else if (t.type === "Nullable") {
      // `boolean | null` hides null in a sentinel; a nullable reference uses
      // `ref.null`. Neither boxes.
      if (nullSentinel(t.subType) !== null) return null;
      let sub = softenImplicitType(t.subType);
      while (sub.type === "Infer") sub = softenImplicitType(sub.subType);
      raw = sub.type === "Union" ? sub.subTypes : [sub];
      hasNull = true;
    } else {
      return null;
    }
    // Split `null`/`Never` out of the member list (neither is a payload-bearing
    // variant — `null` rides in the tag, `Never` is unreachable). A degenerate
    // result — no real variant, or one variant with no null — isn't a union to
    // box (e.g. an inferred-void `Nullable<null>`, or a lone type), so bail.
    const nonNull: VLType[] = [];
    for (const v of raw) {
      let s = softenImplicitType(v);
      while (s.type === "Infer") s = softenImplicitType(s.subType);
      if (s.type === "Alias" && s.name === "null") hasNull = true;
      else if (s.type !== "Never") nonNull.push(v);
    }
    if (nonNull.length === 0 || (nonNull.length === 1 && !hasNull)) return null;
    const variants = nonNull.sort((a, b) => {
      const ka = variantKey(a);
      const kb = variantKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const nullTag = hasNull ? tagOf("null") : -1;
    // "value" kind when every member is a scalar of one shared rep; else "boxed".
    const names = variants.map(valueTypeName);
    const reps = names.map((n, i) => n !== null ? repWasm(n) : toWasmType(variants[i]));
    const sameValueRep = names.every((n) => n !== null) &&
      reps.every((r) => r === reps[0]);
    const payloadWasm = sameValueRep ? reps[0] : binaryen.anyref;
    const struct = unionStruct(payloadWasm);
    return {
      kind: sameValueRep ? "value" : "boxed",
      variants,
      hasNull,
      payloadWasm,
      heapType: struct.heapType,
      refType: struct.refType,
      nullTag,
    };
  };
  // The union member matching `type` (by discriminant key), or undefined.
  const findVariant = (info: UnionInfo, type: VLType): VLType | undefined => {
    const key = variantKey(type);
    return info.variants.find((v) => variantKey(v) === key);
  };
  // The (global) tag for a checked/assigned variant `type` within `info` (`null`
  // → `nullTag`), or -1 if `type` matches no member of `info`.
  const variantTag = (info: UnionInfo, type: VLType): number => {
    let t = softenImplicitType(type);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "Alias" && t.name === "null") return info.nullTag;
    return findVariant(info, t) ? tagOf(variantKey(t)) : -1;
  };
  // Wrap a freshly-produced variant value into a union's payload field. For the
  // value kind the payload *is* the rep; for the boxed kind a reference is stored
  // as-is (upcast to `anyref`) and a scalar goes into its `{ rep }` box.
  const boxPayload = (
    info: UnionInfo,
    variantType: VLType,
    value: number,
  ): number => {
    if (info.kind === "value") return value;
    const vn = valueTypeName(variantType);
    if (vn === null) return value; // a reference — already an `anyref` subtype
    return m.struct.new([value], valueBoxStruct(repWasm(vn)).heapType);
  };
  // Recover a variant value from a union's payload field (the inverse of
  // `boxPayload`): a no-op for the value kind, a `ref.cast` (+ `struct.get` for a
  // scalar) for the boxed kind.
  const unboxPayload = (
    info: UnionInfo,
    variantType: VLType,
    payload: number,
  ): number => {
    if (info.kind === "value") return payload;
    const vn = valueTypeName(variantType);
    if (vn === null) return m.ref.cast(payload, toWasmType(variantType));
    const box = valueBoxStruct(repWasm(vn));
    return m.struct.get(0, m.ref.cast(payload, box.refType), repWasm(vn), false);
  };
  // A typed zero, for the value-kind payload slot of a boxed `null` (unread).
  const wasmZero = (wasm: number): number => {
    if (wasm === binaryen.i64) return m.i64.const(BigInt(0));
    if (wasm === binaryen.f32) return m.f32.const(0);
    if (wasm === binaryen.f64) return m.f64.const(0);
    return m.i32.const(0);
  };
  // Build a union value: `{ tag, payload }`. `variantType` is null only for the
  // `null` tag (its payload is an unread zero / `ref.null`).
  const boxUnion = (
    info: UnionInfo,
    tag: number,
    variantType: VLType | null,
    value: number | null,
  ): number => {
    const payload = variantType === null || value === null
      ? (info.kind === "value"
        ? wasmZero(info.payloadWasm)
        : m.ref.null(binaryen.anyref))
      : boxPayload(info, variantType, value);
    return m.struct.new([m.i32.const(tag), payload], info.heapType);
  };
  // Box a freshly-produced value into the desired union, when it isn't already
  // one. The single value-flow boxing hook: every boundary that wants a value
  // (assignment, argument, operand, return) sets `desiredType`, so wrapping
  // `toExpression` here covers them all. A `null` is boxed by the NullLiteral
  // case directly; an already-union value (variable, call result) is left as is.
  const coerceUnion = (
    value: number,
    node: VLProgramNode | VLStatement,
  ): number => {
    if (!hasDesiredType() || node.type === "NullLiteral") return value;
    const info = unionInfo(desiredType!);
    if (!info) return value;
    const wt = binaryen.getExpressionType(value);
    // Nothing to box: a control-flow statement (`return`/`break`, an `unreachable`
    // block) or a discarded (`none`) value, or a value that is *already* the box
    // (a union variable, a call returning the union, a branch boxed internally).
    if (
      wt === binaryen.unreachable || wt === binaryen.none || wt === info.refType
    ) return value;
    let nt = softenImplicitType(codegenType(node));
    while (nt.type === "Infer") nt = softenImplicitType(nt.subType);
    if (nt.type === "Union" || nt.type === "Nullable") return value;
    const tag = variantTag(info, nt);
    if (tag < 0) return value;
    // Box against the union's own member type, not the source expression's (a
    // literal `5` has type `IntegerLiteral`, which `boxPayload` can't classify).
    return boxUnion(info, tag, findVariant(info, nt) ?? null, value);
  };
  // Lower an expression, then box it into the desired union if one is wanted.
  const toExpression = (node: VLProgramNode | VLStatement): number =>
    coerceUnion(toExpressionRaw(node), node);

  // console.log(inspect(logSimplified(ast), { depth: Infinity }));
  m.setStart(toExpression(ast));

  // Functions referenced as values were collected into `functionTable` during
  // codegen; lay them out in a wasm table so `call_indirect` can dispatch.
  if (functionTable.length) {
    m.addTable("table", functionTable.length, functionTable.length);
    m.addActiveElementSegment(
      "table",
      "table-segment",
      functionTable,
      m.i32.const(0),
    );
  }

  // Guarded so the compiler core stays runtime-agnostic: it's also bundled into
  // the Node-based LSP server, where `Deno` is undefined.
  const debug = "Deno" in globalThis ? Deno.env.get("VL_DEBUG") : undefined;
  if (debug) {
    console.log("result");
    console.log(m.emitText());
  }
  // if (!m.validate()) throw new Error("validation error");
  m.optimize();
  if (debug) {
    console.log("optimized");
    console.log(m.emitText());
  }
  if (!m.validate()) throw new Error("validation error");
  return m.emitBinary();
};

