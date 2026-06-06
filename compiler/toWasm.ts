import Binaryen from "binaryen";
import type { Narrowing } from "./typecheck.ts";
import {
  arrayElementType,
  defaultIntegerType,
  distinctScalars,
  elseNarrowings,
  getConcreteType,
  isMapType,
  isSetType,
  mapKeyValueType,
  nonNullable,
  orderArgumentsByParameters,
  placeKey,
  postGuardNarrowings,
  softenImplicitType,
  thenNarrowings,
  validateType,
  VLCallNode,
  VLExpression,
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
import {
  lowerStringMethodCall,
  type StringBuiltinContext,
} from "./builtins/strings.ts";
import {
  type ListBuiltinContext,
  lowerListMethodCall,
} from "./builtins/lists.ts";
import {
  type MapBuiltinContext,
  type MapType as MapTypeInfo,
  lowerMapMethodCall,
  MAP_COUNT,
  MAP_KEYS,
  MAP_LIVE,
  MAP_SIZE,
  MAP_VALS,
  mapGetFn,
  mapNewFn,
  mapSetFn,
} from "./builtins/maps.ts";

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
    "+": "add",
    "-": "sub",
    "*": "mul",
    "/": "div_s",
    "%": "rem_s",
    "==": "eq",
    "!=": "ne",
    ">": "gt_s",
    "<": "lt_s",
    ">=": "ge_s",
    "<=": "le_s",
    "&&": "and",
  };
  const FLOAT_BINOPS: Record<string, string> = {
    "+": "add",
    "-": "sub",
    "*": "mul",
    "/": "div",
    "==": "eq",
    "!=": "ne",
    ">": "gt",
    "<": "lt",
    ">=": "ge",
    "<=": "le",
  };

  type ScopeEntry = [type: VLType, index: number];
  type Scope = Record<string, ScopeEntry>;
  const scopes: Scope[] = [];
  let currentScope: Scope;
  // `scopes` index where the current function's own scopes begin. A value
  // reference resolving below this belongs to an enclosing frame — i.e. a
  // capture, which closures (not yet implemented) would carry in an environment.
  const functionBoundaries: number[] = [];

  // --- Module globals (mutable module-level state) ---
  // A top-level mutable binding of *scalar* type (i32/i64/f32/f64) is lowered to
  // a real wasm `global`, not a `__program__` local. This is what lets a function
  // read AND write it through the *shared* global (`global.get`/`global.set`)
  // rather than a private captured copy — the natural compiler idiom of
  // module-level counters / positions reassigned from inside a function (the
  // bootstrap motivation, Track H). Reference-typed bindings (objects, lists,
  // strings, closures) stay on the existing capture path: mutating a *field* of a
  // global object already works (the captured ref points at shared heap, and
  // `struct.set` mutates it), so only scalar reassignment-through-a-function was
  // broken. Keyed by name; the value is the binding's VL type. A global's wasm
  // type is `toWasmType(type)`; it is created lazily (once) on declaration.
  const moduleGlobals = new Map<string, VLType>();
  const declaredGlobals = new Set<string>();
  // Whether `name` resolves to a module global *here* — i.e. it is registered as
  // one and not shadowed by a nearer (function-local) binding of the same name.
  const isModuleGlobal = (name: string): boolean => {
    if (!moduleGlobals.has(name)) return false;
    // A function parameter / inner `let` of the same name shadows the global. The
    // global's scope entry sits at scope index 0 (the program scope), so if
    // `lookupName` finds the name at a deeper scope it is a shadowing local.
    for (let i = scopes.length - 1; i >= 1; i--) {
      if (name in scopes[i]) return false;
    }
    return true;
  };
  // Whether a binding's type lowers to a wasm scalar (i32/i64/f32/f64) — the
  // value types that are safely held in a mutable global and reassigned through
  // `global.set` without nullable-ref complications. Anything that doesn't map
  // (an inferred/unresolved type) or maps to a ref is not globalized here.
  const isScalarWasm = (type: VLType): boolean => {
    // Keep nullable/union bindings on the local/capture path: they carry boxed /
    // niche representations and per-branch narrowing that the early-returning
    // global read/write paths don't reproduce. Only plain scalars are globalized.
    const soft = softenImplicitType(type);
    if (
      soft.type === "Nullable" || soft.type === "Union" ||
      soft.type === "Infer"
    ) return false;
    let wt: number;
    try {
      wt = toWasmType(type);
    } catch {
      return false;
    }
    return wt === binaryen.i32 || wt === binaryen.i64 ||
      wt === binaryen.f32 || wt === binaryen.f64;
  };

  // Whether a binding's type lowers to a WasmGC *reference* that can live in a
  // mutable global cell — a string, a structural object/struct, a list, a map,
  // or a function/closure. These are exactly the types `refHeapType` resolves a
  // heap type for, so the global can be declared as the *nullable* ref form and
  // zero-initialized with `ref.null` (the start function then `global.set`s the
  // real initializer, like the scalar path). Reads cast the nullable cell back
  // to the non-null value type callers expect. This is the ref counterpart of
  // `isScalarWasm`: it is what lets a ref-typed module binding (a string-interning
  // table, the current source string, an accumulator) be reassigned inside one
  // function and seen by another — the bootstrap motivation (Track H).
  const isGlobalizableRef = (type: VLType): boolean => {
    // Nullable / union bindings carry niche / boxed reps the early-returning
    // global read/write paths don't reproduce — keep them on the local/capture
    // path, mirroring `isScalarWasm`.
    const soft = softenImplicitType(type);
    if (
      soft.type === "Nullable" || soft.type === "Union" ||
      soft.type === "Infer"
    ) return false;
    try {
      // `refHeapType` throws for non-reference types; if it resolves, the binding
      // is a ref we can globalize.
      refHeapType(type);
      return true;
    } catch {
      return false;
    }
  };

  // The wasm type of a module global's cell. A scalar rides in its plain value
  // type; a reference rides in the *nullable* ref form so the cell can be
  // zero-initialized (`ref.null`) before the start function writes the real
  // value. Reads of a ref global add `ref.as_non_null` to recover the non-null
  // type that the rest of codegen expects from `toWasmType`.
  const globalCellType = (type: VLType): number =>
    isScalarWasm(type)
      ? toWasmType(type)
      : binaryen.getTypeFromHeapType(refHeapType(type), true);

  // Read a module global by name, restoring the binding's non-null value type:
  // `global.get` yields the cell's (possibly nullable-ref) type, so a ref global
  // is narrowed with `ref.as_non_null`. The global is always initialized by the
  // start function before any other code runs, so the cast never traps.
  const globalRead = (name: string, type: VLType): number => {
    const get = m.global.get(name, globalCellType(type));
    return isScalarWasm(type) ? get : m.ref.as_non_null(get);
  };

  // Collect every identifier (`Name` node) referenced inside any function body
  // among `statements` (recursively, including nested functions). A generic
  // tree walk over plain AST objects/arrays — no per-node-type enumeration —
  // gathering `{ type: "Name", name }`. Used to decide which top-level scalars
  // need to be real wasm globals (only those a function reads/writes). Slightly
  // over-collecting (e.g. a shadowed name) is harmless: it only globalizes a
  // binding that would otherwise stay a local, and reads/writes still resolve
  // correctly via `isModuleGlobal`'s shadowing check.
  const collectFunctionBodyNames = (statements: VLStatement[]): Set<string> => {
    const names = new Set<string>();
    const walk = (v: unknown): void => {
      if (v === null || typeof v !== "object") return;
      if (Array.isArray(v)) {
        for (const x of v) walk(x);
        return;
      }
      const node = v as { type?: unknown; name?: unknown };
      if (node.type === "Name" && typeof node.name === "string") {
        names.add(node.name);
      }
      for (const key in node) {
        if (key === "scope") continue; // bookkeeping, not AST to descend into
        walk((node as Record<string, unknown>)[key]);
      }
    };
    for (const stmt of statements) {
      if (stmt.type === "FunctionDeclaration") walk(stmt.body);
    }
    return names;
  };

  // Ensure the wasm global exists, initialized to a zero/default constant. The
  // binding's actual initializer runs as a `global.set` in `__program__` (the
  // start function), which executes before any other function — so reads always
  // see the initialized value, never the placeholder zero.
  const ensureGlobal = (name: string, type: VLType): void => {
    if (declaredGlobals.has(name)) return;
    declaredGlobals.add(name);
    m.addGlobal(name, globalCellType(type), true, zeroOf(type));
  };

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
      if (Object.hasOwn(scopes[i], name)) {
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

  // A struct's string-keyed fields, sorted by name (the canonical field order).
  // Index-signature / non-string keys are dropped — arrays use a separate
  // representation and dynamic keys are a future map.
  const structFields = (type: VLObjectType) =>
    type.properties
      .flatMap((p) =>
        p.name.type === "StringLiteral"
          ? [{ name: p.name.value, type: p.type }]
          : []
      )
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

  // A structural struct: an anonymous object that isn't an array (a builtin like
  // `i32`/`string` carries a `name`; an array carries an `i32` index sig). Only
  // these can be (mutually) recursive, so they drive the cycle handling below.
  const isStructObject = (t: VLType): t is VLObjectType =>
    t.type === "Object" && t.name === undefined && !arrayElementType(t);

  // Follow a (possibly nullable) field/type to the struct it denotes, or null —
  // used to walk recursive edges. A recursive self-reference is an `Alias` leaf
  // (`_softenImplicitType` preserves it); the outer `softenImplicitType` wrapper
  // here resolves that leaf to its concrete struct body.
  const asStructTarget = (type: VLType): VLObjectType | null => {
    let t = softenImplicitType(type);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "Nullable") {
      t = softenImplicitType(t.subType);
      while (t.type === "Infer") t = softenImplicitType(t.subType);
    }
    return isStructObject(t) ? t : null;
  };

  // A canonical, cycle-safe signature for a shape. Recursion is carried by the
  // type-alias name (`Tree`), which `_softenImplicitType` keeps as an `Alias`
  // leaf — so a self-reference closes the cycle by name, and two shapes that are
  // structurally equal (however derived) get the same signature and share one
  // WasmGC struct. A non-struct leaf falls back to its wasm type (no struct
  // cycle possible), matching the pre-recursion interning.
  const structSig = (type: VLType, nameStack: string[] = []): string => {
    let t = type;
    while (t.type === "Infer") t = t.subType;
    let prefix = "";
    if (t.type === "Nullable") {
      prefix = "?";
      t = t.subType;
      while (t.type === "Infer") t = t.subType;
    }
    if (t.type === "Alias" && t.name !== "null") {
      // A recursive reference: close the cycle with a *relative-depth* back-ref
      // (de Bruijn style) rather than the name, so two structurally-identical
      // recursive types canonicalize to one signature (and share one WasmGC
      // struct) regardless of what they're named. Else expand the body once,
      // pushing the name so its own self-references resolve to this depth.
      const i = nameStack.indexOf(t.name);
      if (i >= 0) return `${prefix}@${nameStack.length - i}`;
      return prefix +
        structSig(getConcreteType(t, undefined), [...nameStack, t.name]);
    }
    const soft = softenImplicitType(t);
    if (isStructObject(soft)) {
      return prefix + `{${
        structFields(soft)
          .map((f) => `${f.name}:${structSig(f.type, nameStack)}`)
          .join(",")
      }}`;
    }
    return prefix + `#${toWasmType(t)}`;
  };

  const objectStruct = (type: VLObjectType): ObjectStruct => {
    const sig = structSig(type);
    const cached = objectStructs.get(sig);
    if (cached) return cached;

    // Discover the struct shapes reachable from `type` and the reference edges
    // between them, so we can isolate the *recursion group* — the set of shapes
    // that are mutually recursive with `type` (its strongly-connected component).
    // Only that group needs a shared WasmGC rec group with forward references; a
    // non-recursive nested struct is built independently (keeping its own
    // identity, so identical shapes still share one type across the module).
    const nodes = new Map<
      string,
      { fields: { name: string; type: VLType }[]; targets: string[] }
    >();
    const visit = (t: VLObjectType) => {
      const s = structSig(t);
      if (objectStructs.has(s) || nodes.has(s)) return;
      const fields = structFields(t);
      const targets: string[] = [];
      nodes.set(s, { fields, targets });
      for (const f of fields) {
        const target = asStructTarget(f.type);
        if (target) {
          targets.push(structSig(target));
          visit(target);
        }
      }
    };
    visit(type);

    // The SCC of `sig`: every reachable node is reachable *from* `sig` (we walked
    // from it), so a node shares `sig`'s component iff it can reach `sig` back.
    const reachesRoot = (start: string): boolean => {
      const stack = [start];
      const seen = new Set<string>();
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === sig) return true;
        if (seen.has(cur)) continue;
        seen.add(cur);
        // A node already finalized (built earlier) can't be part of this group.
        for (const t of nodes.get(cur)?.targets ?? []) stack.push(t);
      }
      return false;
    };
    const group = [...nodes.keys()].filter(reachesRoot);
    const sigToIndex = new Map(group.map((s, i) => [s, i]));

    const tb = new binaryen.TypeBuilder(group.length);
    // A mutually-recursive component must form one rec group so its members may
    // forward-reference each other; a self-referential single struct likewise.
    const recursive = group.some((s) =>
      nodes.get(s)!.targets.some((t) => sigToIndex.has(t))
    );
    if (recursive) tb.createRecGroup(0, group.length);
    // A field's wasm type: a forward (builder-local) reference for an in-group
    // (recursive) struct, else normal lowering — which builds and caches a
    // non-recursive nested struct independently, referenced as a finalized type.
    const fieldWasmType = (ft: VLType): number => {
      const target = asStructTarget(ft);
      const idx = target && sigToIndex.get(structSig(target));
      if (idx !== undefined && idx !== null) {
        let nt = softenImplicitType(ft);
        while (nt.type === "Infer") nt = softenImplicitType(nt.subType);
        return tb.getTempRefType(
          tb.getTempHeapType(idx),
          nt.type === "Nullable",
        );
      }
      return toWasmType(ft);
    };
    group.forEach((s, i) => {
      tb.setStructType(
        i,
        nodes.get(s)!.fields.map((f) => ({
          type: fieldWasmType(f.type),
          packedType: binaryen.notPacked,
          mutable: true,
        })),
      );
    });
    const heapTypes = tb.buildAndDispose();
    group.forEach((s, i) => {
      objectStructs.set(s, {
        heapType: heapTypes[i],
        refType: binaryen.getTypeFromHeapType(heapTypes[i], false),
        fields: nodes.get(s)!.fields.map((f, index) => ({ ...f, index })),
      });
    });
    return objectStructs.get(sig)!;
  };

  // --- Arrays (WasmGC arrays) ---
  // An array type is a structural object carrying an `i32`-keyed index signature
  // (`{[i32]: T}` — see `arrayElementType`); that key is what selects the WasmGC-
  // array representation (contiguous, native `array.get` — the performance path)
  // over a struct. `length` rides as an intrinsic lowered to `array.len`.
  // `elemWasm` is the *logical* element wasm type (what a read yields to the
  // surface); `backingWasm` is the wasm type of the array's *slots*. They differ
  // only when the element is a non-nullable reference (a struct/list/closure/
  // string ref): a `(ref $t)` array slot is non-defaultable, so `array.new_default`
  // (used by every allocate-then-fill path — grow, map, filter, `+`) is illegal.
  // We widen such backings to `(ref null $t)`, whose default is `ref.null`; reads
  // off `[0, len)` are always populated, so they `ref.as_non_null` back to the
  // logical type (see `arrayReadCast`). Value/niche/already-nullable elements are
  // defaultable, so `backingWasm == elemWasm` and the cast is a no-op.
  type ArrayType = {
    heapType: number;
    refType: number;
    element: VLType;
    elemWasm: number;
    backingWasm: number;
  };
  const arrayTypes = new Map<number, ArrayType>();
  // Intern a WasmGC array type by its element's wasm type (so identical element
  // types share one array type). Mutable so `a[i] = v` can `array.set`.
  const arrayType = (element: VLType): ArrayType => {
    const elemWasm = toWasmType(element);
    let cached = arrayTypes.get(elemWasm);
    if (!cached) {
      const backingWasm = nonNullRefElement(element)
        ? nullableOf(elemWasm)
        : elemWasm;
      const tb = new binaryen.TypeBuilder(1);
      tb.setArrayType(0, backingWasm, binaryen.notPacked, true);
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
        element,
        elemWasm,
        backingWasm,
      };
      arrayTypes.set(elemWasm, cached);
    }
    return cached;
  };

  // True when `element` lowers to a *non-nullable* WasmGC reference (struct,
  // list, closure, named/string array, or a boxed union) — the only elements
  // whose backing array slot is non-defaultable. Value scalars, niche-nullables
  // (i32 rep), and already-nullable refs are excluded (their slots default fine).
  const nonNullRefElement = (element: VLType): boolean => {
    let t = softenImplicitType(element);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "Nullable") return false; // already a nullable ref or niche
    if (valueTypeName(t) !== null) return false; // i32/i64/f32/f64/boolean
    if (unionInfo(t)) return true; // boxed tagged union (non-null struct)
    if (t.type === "Function") return true;
    if (isListType(t)) return true;
    if (t.type === "Object") {
      if (arrayElementType(t)) return true; // string / raw array ref
      if (t.name === undefined) return true; // structural object struct
    }
    return false;
  };

  // The nullable form of an interned non-nullable ref wasm type, by round-tripping
  // through its heap type (binaryen exposes nullability only via heap-type refs).
  const nullableOf = (refWasm: number): number =>
    binaryen.getTypeFromHeapType(binaryen.getHeapType(refWasm), true);

  // Read an element out of a backing slot at its logical (surface) wasm type. When
  // the backing was widened to nullable (non-null ref element), narrow the slot
  // back with `ref.as_non_null` — sound because reads only ever touch the
  // populated `[0, len)` region (the spare `[len, cap)` slots are never read).
  const arrayReadCast = (at: ArrayType, value: number): number =>
    at.backingWasm === at.elemWasm ? value : m.ref.as_non_null(value);

  // --- Lists (the committed growable `T[]` representation, B6) ---
  // A `T[]` value (a structural object carrying an `[i32]:T` index signature that
  // is NOT `string`) lowers to a WasmGC struct `{ backing: (ref (array mut T)),
  // len: i32, cap: i32 }` — the `{ptr,len,cap}` triple (collections-design §VL.1).
  // `backing` reuses the per-element `arrayType` interner above; `len` is the
  // user-visible size (`.length`, bounds, iteration), `cap` the allocated slots.
  // The TYPE-SYSTEM representation of `T[]` stays `{[i32]:T}` (load-bearing for
  // generic inference / equatability / `.length` typing) — this is a codegen rep.
  type ListType = {
    heapType: number;
    refType: number;
    element: VLType;
    backing: ArrayType;
  };
  // Struct field indices, fixed by `setStructType` order below.
  const LIST_BACKING = 0;
  const LIST_LEN = 1;
  const LIST_CAP = 2;
  const listTypes = new Map<number, ListType>();
  // Intern the list struct type by the backing array's wasm type (so identical
  // element types share one struct). All three fields mutable: `backing` so a
  // grow can swap in a larger array, `len`/`cap` for `push`/`pop`/`clear`.
  const listType = (element: VLType): ListType => {
    const backing = arrayType(element);
    let cached = listTypes.get(backing.heapType);
    if (!cached) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setStructType(0, [
        { type: backing.refType, packedType: binaryen.notPacked, mutable: true },
        { type: binaryen.i32, packedType: binaryen.notPacked, mutable: true },
        { type: binaryen.i32, packedType: binaryen.notPacked, mutable: true },
      ]);
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
        element,
        backing,
      };
      listTypes.set(backing.heapType, cached);
    }
    return cached;
  };

  // Is `t` a *list* (the growable `T[]` rep) rather than a raw i32-array? Both
  // `string` and `T[]` match `arrayElementType` (a `string` is an Object named
  // "string" carrying `[i32]:i32`), so the discriminator is the *absence* of a
  // nominal `name`: an anonymous `[i32]:T` object is a list, a named one (string)
  // stays on the raw `arrayType` path. EVERY flipped codegen site guards on this,
  // not bare `arrayElementType`.
  const isListType = (t: VLType): boolean => {
    let s = softenImplicitType(t);
    while (s.type === "Infer") s = softenImplicitType(s.subType);
    return s.type === "Object" && s.name === undefined &&
      arrayElementType(s) !== null;
  };

  // --- Maps (the separate hash type, B6a) ---
  // A `Map<K,V>` (a `{[K]:V}` index-sig object with a NON-i32 key — `string` for
  // now) lowers to an ordered open-addressing hash struct (see builtins/maps.ts):
  // `{ keys, vals, live, index, count, size }`. Iteration walks `keys`/`vals` in
  // insertion order (DETERMINISTIC — the replay requirement) skipping tombstones.
  // The TYPE-SYSTEM representation stays `{[K]:V}` (generic inference / member
  // typing unaffected) — this is purely a codegen rep.
  // Is `t` a reference (non-defaultable) wasm type? `array.new_default` requires a
  // defaultable element, so a map's key/val arrays storing refs must use a
  // *nullable* element ref (null is the default). Scalars are defaultable as-is.
  const isRefElement = (t: VLType): boolean => {
    let s = softenImplicitType(t);
    while (s.type === "Infer") s = softenImplicitType(s.subType);
    if (s.type === "Function") return true;
    if (s.type === "Object") return s.name === "string" || (s.name === undefined);
    if (s.type === "Nullable" || s.type === "Union") return true;
    return false;
  };
  // The wasm type stored in a map's key/val array slot: a *nullable* ref for a
  // reference element (so `array.new_default` null-inits and the helper signatures
  // match), else the plain scalar wasm type.
  const mapElemWasm = (element: VLType): number => {
    const soft = softenImplicitType(element);
    return isRefElement(soft)
      ? binaryen.getTypeFromHeapType(refHeapType(soft), true)
      : toWasmType(soft);
  };
  // An array type whose element is a *nullable* ref when the element is a
  // reference (so `array.new_default` can null-init), else the plain scalar array.
  const mapArrayTypes = new Map<number, ArrayType>();
  const mapArrayType = (element: VLType): ArrayType => {
    const soft = softenImplicitType(element);
    if (!isRefElement(soft)) return arrayType(soft);
    const elemWasm = binaryen.getTypeFromHeapType(refHeapType(soft), true);
    let cached = mapArrayTypes.get(elemWasm);
    if (!cached) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setArrayType(0, elemWasm, binaryen.notPacked, true);
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
        element: soft,
        // Map backing arrays store the (nullable) ref element directly, so the
        // slot type and the logical element type coincide — `arrayReadCast` is a
        // no-op (no `ref.as_non_null` narrowing, unlike list backings, B6a/gap-1).
        elemWasm,
        backingWasm: elemWasm,
      };
      mapArrayTypes.set(elemWasm, cached);
    }
    return cached;
  };

  const mapTypes = new Map<string, MapTypeInfo>();
  const mapType = (key: VLType, value: VLType): MapTypeInfo => {
    const keys = mapArrayType(softenImplicitType(key));
    const vals = mapArrayType(softenImplicitType(value));
    const flags = arrayType(i32Type);
    const cacheKey = `${keys.heapType}:${vals.heapType}`;
    let cached = mapTypes.get(cacheKey);
    if (!cached) {
      const tb = new binaryen.TypeBuilder(1);
      tb.setStructType(0, [
        { type: keys.refType, packedType: binaryen.notPacked, mutable: true },
        { type: vals.refType, packedType: binaryen.notPacked, mutable: true },
        { type: flags.refType, packedType: binaryen.notPacked, mutable: true },
        { type: flags.refType, packedType: binaryen.notPacked, mutable: true },
        { type: binaryen.i32, packedType: binaryen.notPacked, mutable: true },
        { type: binaryen.i32, packedType: binaryen.notPacked, mutable: true },
      ]);
      const heapType = tb.buildAndDispose()[0];
      cached = {
        heapType,
        refType: binaryen.getTypeFromHeapType(heapType, false),
        key: softenImplicitType(key),
        value: softenImplicitType(value),
        keys,
        vals,
        flags,
        keyElemWasm: mapElemWasm(key),
        valElemWasm: mapElemWasm(value),
        keyIsRef: isRefElement(softenImplicitType(key)),
        valIsRef: isRefElement(softenImplicitType(value)),
      };
      mapTypes.set(cacheKey, cached);
    }
    return cached;
  };

  // Is `t` a map (a `{[K]:V}` with a non-i32 key)? Mirrors the typecheck-side
  // `isMapType`. Every flipped codegen site guards on this.
  const isMapTypeCodegen = (t: VLType): boolean => {
    let s = softenImplicitType(t);
    while (s.type === "Infer") s = softenImplicitType(s.subType);
    return isMapType(s);
  };

  // Is `t` a `Set<T>` (the boolean-valued `{[T]:boolean}` representation)? Used to
  // route a set's `.values()` to its element (key) array. Mirrors `isSetType`.
  const isSetTypeCodegen = (t: VLType): boolean => {
    let s = softenImplicitType(t);
    while (s.type === "Infer") s = softenImplicitType(s.subType);
    return isSetType(s);
  };

  // Resolve an expression's map struct type + key/value types, or null.
  const mapTypeOf = (
    node: VLProgramNode | VLStatement,
  ): { mt: MapTypeInfo; key: VLType; value: VLType } | null => {
    const objType = softenImplicitType(codegenType(node));
    let s = objType;
    while (s.type === "Infer") s = softenImplicitType(s.subType);
    const kv = mapKeyValueType(s);
    if (!kv) return null;
    const key = softenImplicitType(kv.key);
    const value = softenImplicitType(kv.value);
    return { mt: mapType(key, value), key, value };
  };

  // A stable per-module suffix for a map type's emitted helper names.
  const mapHelperTags = new Map<number, number>();
  const mapHelperTag = (mt: MapTypeInfo): number => {
    let t = mapHelperTags.get(mt.heapType);
    if (t === undefined) {
      t = mapHelperTags.size;
      mapHelperTags.set(mt.heapType, t);
    }
    return t;
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

  // `__i32_to_string__(n)`: render a signed i32 as a VL string (WasmGC i32-array
  // of digit char codes), handling 0 and negatives. Standard itoa: digits are
  // extracted from the NEGATIVE magnitude (`n <= 0`) so INT_MIN doesn't overflow
  // a sign flip, written into a fixed 11-slot scratch from the right, then the
  // used suffix (plus a leading '-' for negatives) is copied into an
  // exact-length result array. Backs `toString(i32)`.
  const i32ToStringFn = (): string => {
    const name = "__i32_to_string__";
    if (!_helpers.has(name)) {
      _helpers.add(name);
      const at = arrayType(i32Type);
      // Locals: 0 = value (param); 1 = scratch array; 2 = write pos; 3 = neg
      // flag; 4 = working magnitude (<= 0); 5 = result array; 6 = result length.
      const value = () => m.local.get(0, binaryen.i32);
      const scratch = () => m.local.get(1, at.refType);
      const p = () => m.local.get(2, binaryen.i32);
      const neg = () => m.local.get(3, binaryen.i32);
      const n = () => m.local.get(4, binaryen.i32);
      const result = () => m.local.get(5, at.refType);
      const rlen = () => m.local.get(6, binaryen.i32);
      const body = m.block(null, [
        // scratch = new i32[11] (max "-2147483648" is 11 chars)
        m.local.set(1, m.array.new(at.heapType, m.i32.const(11), m.i32.const(0))),
        m.local.set(2, m.i32.const(11)),
        m.local.set(3, m.i32.lt_s(value(), m.i32.const(0))),
        // n = value <= 0 ? value : -value  (magnitude as a non-positive number)
        m.local.set(
          4,
          m.if(
            neg(),
            value(),
            m.i32.sub(m.i32.const(0), value()),
            binaryen.i32,
          ),
        ),
        m.loop(
          "itoa_loop",
          m.block(null, [
            m.local.set(2, m.i32.sub(p(), m.i32.const(1))),
            // digit code = 48 + (0 - (n % 10)); n <= 0 so n % 10 is in -9..0
            m.array.set(
              scratch(),
              p(),
              m.i32.add(
                m.i32.const(48),
                m.i32.sub(m.i32.const(0), m.i32.rem_s(n(), m.i32.const(10))),
              ),
            ),
            m.local.set(4, m.i32.div_s(n(), m.i32.const(10))),
            m.br("itoa_loop", m.i32.ne(n(), m.i32.const(0))),
          ]),
        ),
        // Prepend '-' (45) for negatives.
        m.if(
          neg(),
          m.block(null, [
            m.local.set(2, m.i32.sub(p(), m.i32.const(1))),
            m.array.set(scratch(), p(), m.i32.const(45)),
          ]),
        ),
        m.local.set(6, m.i32.sub(m.i32.const(11), p())),
        m.local.set(5, m.array.new(at.heapType, rlen(), m.i32.const(0))),
        m.array.copy(result(), m.i32.const(0), scratch(), p(), rlen()),
        result(),
      ], at.refType);
      m.addFunction(
        name,
        binaryen.createType([binaryen.i32]),
        at.refType,
        [at.refType, binaryen.i32, binaryen.i32, binaryen.i32, at.refType, binaryen.i32],
        body,
      );
    }
    return name;
  };

  // `__bool_to_string__(b)`: render a boolean as the VL string `"true"`/`"false"`
  // (a WasmGC i32-array of char codes). Backs `toString(boolean)`.
  const boolToStringFn = (): string => {
    const name = "__bool_to_string__";
    if (!_helpers.has(name)) {
      _helpers.add(name);
      const at = arrayType(i32Type);
      const lit = (s: string) =>
        m.array.new_fixed(at.heapType, [...s].map((c) => m.i32.const(c.charCodeAt(0))));
      const body = m.if(
        m.local.get(0, binaryen.i32),
        lit("true"),
        lit("false"),
        at.refType,
      );
      m.addFunction(
        name,
        binaryen.createType([binaryen.i32]),
        at.refType,
        [],
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
    // An anonymous `[i32]:T` element is a *list* (struct rep) — compare via the
    // per-element list-eq helper (a string was already handled above by name).
    if (isListType(ft)) {
      return m.call(listEqFn(arrayElementType(ft)!), [a(), b()], binaryen.i32);
    }
    if (ft.type === "Object" && ft.name === undefined) {
      return m.call(objectEqFn(ft), [a(), b()], binaryen.i32);
    }
    return m.i32.eq(a(), b()); // i32 / boolean
  };

  // Per-element-type list equality: `__list_eq_<n>__(a, b)` returns 1 iff the two
  // lists have equal `len` and equal elements over `[0, len)` of `backing` (each
  // compared via `valueEq`, so lists of strings/structs/lists recurse). The list
  // analogue of `__string_eq__` (i32 char codes) on the struct rep.
  const listEqFns = new Map<number, string>();
  const listEqFn = (element: VLType): string => {
    const lt = listType(softenImplicitType(element));
    const existing = listEqFns.get(lt.heapType);
    if (existing) return existing;
    const name = `__list_eq_${listEqFns.size}__`;
    listEqFns.set(lt.heapType, name); // before body for cycle safety
    const a = () => m.local.get(0, lt.refType);
    const b = () => m.local.get(1, lt.refType);
    const i = () => m.local.get(2, binaryen.i32);
    const len = () => m.local.get(3, binaryen.i32);
    const body = m.block(null, [
      m.if(
        m.i32.ne(listLen(a()), listLen(b())),
        m.return(m.i32.const(0)),
      ),
      m.local.set(3, listLen(a())),
      m.local.set(2, m.i32.const(0)),
      m.block("aeq_brk", [
        m.loop(
          "aeq_loop",
          m.block(null, [
            m.br("aeq_brk", m.i32.ge_s(i(), len())),
            m.if(
              m.i32.eqz(valueEq(
                lt.element,
                () =>
                  arrayReadCast(
                    lt.backing,
                    m.array.get(listBacking(lt, a()), i(), lt.backing.backingWasm, false),
                  ),
                () =>
                  arrayReadCast(
                    lt.backing,
                    m.array.get(listBacking(lt, b()), i(), lt.backing.backingWasm, false),
                  ),
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
      binaryen.createType([lt.refType, lt.refType]),
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

  // Override one narrowed place in the overlay while running `body`, restoring
  // after (the unit the `If` branches and short-circuit `&&`/`||` build on).
  const withNarrowed = <T>(name: string, type: VLType, body: () => T): T => {
    const prev = narrowed[name];
    narrowed[name] = type;
    const r = body();
    if (prev === undefined) delete narrowed[name];
    else narrowed[name] = prev;
    return r;
  };
  // Run `body` with a *list* of narrowings overlaid — a `&&` of guards narrows
  // several places; each reads its current (already-overlaid) type via
  // `codegenType` so successive narrowings compose. A `Never` refinement (a
  // dead branch) is skipped rather than overlaid.
  const withNarrowedList = <T>(ns: Narrowing[], body: () => T): T => {
    const go = (i: number): T => {
      if (i >= ns.length) return body();
      const n = ns[i];
      const cur = codegenType(n.place);
      const next = cur && n.apply(cur);
      if (!next || next.type === "Never") return go(i + 1);
      return withNarrowed(n.name, next, () => go(i + 1));
    };
    return go(0);
  };

  const codegenType = (node: VLProgramNode | VLStatement): VLType => {
    if (node.type === "Name") {
      if (node.name in narrowed) return narrowed[node.name];
      const found = lookupName(node.name);
      if (found) return found.type;
    }
    if (node.type === "PropertyAccess") {
      // A flow-narrowed property path (`if o.v is i32 { … }`) overrides the
      // stored field type within the branch.
      const key = placeKey(node);
      if (key !== null && key in narrowed) return narrowed[key];
      // Shared-field access over a struct union (`(A | B).tag`): the result type
      // is the union of the field's type across members (`sharedUnionField` in
      // typecheck mirrors this). Resolve it here so `objectTypeOf` isn't asked to
      // treat a union as a single struct.
      let ot = softenImplicitType(codegenType(node.object));
      while (ot.type === "Infer") ot = softenImplicitType(ot.subType);
      if (ot.type === "Union" || ot.type === "Nullable") {
        const shared = unionFieldType(ot, node.property);
        if (shared) return shared;
      }
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
    // Literal nodes double as literal *types* — resolve directly (they may be
    // freshly built at codegen, e.g. a synthesized branch value, and so not
    // memoized). `null` has no literal type node.
    if (
      node.type === "IntegerLiteral" || node.type === "RealLiteral" ||
      node.type === "StringLiteral" || node.type === "BooleanLiteral"
    ) return node;
    if (node.type === "NullLiteral") return { type: "Alias", name: "null" };
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

  // Resolve an expression's *list* struct type + (softened) element type, or null
  // if it isn't a list (a raw i32-array `string`, or a non-array). The list sites
  // (ArrayLiteral, IndexAccess, `a[i]=v`, `.length`, ForIn, `==`) call this and
  // fall back to the raw `arrayTypeOf` path only for strings.
  const listTypeOf = (
    node: VLProgramNode | VLStatement,
  ): { lt: ListType; element: VLType } | null => {
    const objType = objectTypeOf(node);
    if (!isListType(objType)) return null;
    const element = arrayElementType(objType);
    if (!element) return null;
    const soft = softenImplicitType(element);
    return { lt: listType(soft), element: soft };
  };

  // Field reads on a list struct (thunks: binaryen wants fresh trees per use).
  const listBacking = (lt: ListType, ref: number): number =>
    m.struct.get(LIST_BACKING, ref, lt.backing.refType, false);
  const listLen = (ref: number): number =>
    m.struct.get(LIST_LEN, ref, binaryen.i32, false);
  const listCap = (ref: number): number =>
    m.struct.get(LIST_CAP, ref, binaryen.i32, false);

  // A stable per-module suffix for a list type's emitted helper names, keyed on
  // the list heap type (the `arrayEqFns`-style cache pattern).
  const listHelperTags = new Map<number, number>();
  const listHelperTag = (lt: ListType): number => {
    let t = listHelperTags.get(lt.heapType);
    if (t === undefined) {
      t = listHelperTags.size;
      listHelperTags.set(lt.heapType, t);
    }
    return t;
  };

  // A bounds-checked element read `l[i]` (trap on OOB — collections-design §VL.6):
  // stash the list ref and index in locals, trap when `(unsigned) i >= len` (which
  // covers `i < 0` too, since `len >= 0`), else `array.get(backing, i)`. The bound
  // is `len`, so the spare-capacity slots `[len, cap)` trap like any other OOB.
  const listGet = (lt: ListType, listExpr: number, indexExpr: number): number => {
    const elemWasm = toWasmType(lt.element);
    const lRef = newLocal(lt.refType);
    const iLocal = newLocal(binaryen.i32);
    const l = () => m.local.get(lRef, lt.refType);
    const i = () => m.local.get(iLocal, binaryen.i32);
    return m.block(null, [
      m.local.set(lRef, listExpr),
      m.local.set(iLocal, indexExpr),
      m.if(m.i32.ge_u(i(), listLen(l())), m.unreachable()),
      arrayReadCast(
        lt.backing,
        m.array.get(listBacking(lt, l()), i(), lt.backing.backingWasm, false),
      ),
    ], elemWasm);
  };

  // Lower a list `map`/`filter` call inline (the closure dispatch needs
  // `indirectCall` + locals, which the per-element helpers in `builtins/lists.ts`
  // don't have access to, so — like list `+` — these build the loop here).
  // Returns the binaryen expr, or null if `node` isn't such a call (fall through
  // to the normal `Call` dispatch). Both allocate a FRESH backing and never touch
  // the receiver (collections-design §VL.4).
  let mapFilterCounter = 0;
  const lowerListMapFilter = (node: VLCallNode): number | null => {
    if (node.callee.type !== "PropertyAccess") return null;
    const prop = node.callee.property;
    if (prop !== "map" && prop !== "filter") return null;
    const recv = node.callee.object;
    const src = listTypeOf(recv);
    if (!src) return null;
    const fn = node.functionType;
    if (!fn) return null;
    // The result element type: for `map` it's the inferred `U` (the callback's
    // return, surfaced as the method's `U[]` return); for `filter` it's `T`.
    const out = listTypeOf(node) ?? src;
    const outLt = out.lt;
    // Unique loop/break labels per lowering (binaryen IR names must be unique).
    const tag = mapFilterCounter++;
    const loopLabel = `__${prop}_loop_${tag}__`;
    const doneLabel = `__${prop}_done_${tag}__`;

    const cb = node.arguments[0].value;
    const srcRef = newLocal(src.lt.refType);
    const cloRef = newLocal(closureStruct().refType);
    const nLocal = newLocal(binaryen.i32);
    const iLocal = newLocal(binaryen.i32);
    const backLocal = newLocal(outLt.backing.refType);
    const s = () => m.local.get(srcRef, src.lt.refType);
    const clo = () => m.local.get(cloRef, closureStruct().refType);
    const n = () => m.local.get(nLocal, binaryen.i32);
    const i = () => m.local.get(iLocal, binaryen.i32);
    const back = () => m.local.get(backLocal, outLt.backing.refType);
    // `src.backing[i]` (the loop element, read raw — `i` is always in `[0, len)`).
    const elemAt = () =>
      arrayReadCast(
        src.lt.backing,
        m.array.get(listBacking(src.lt, s()), i(), src.lt.backing.backingWasm, false),
      );

    if (prop === "map") {
      const outWasm = toWasmType(outLt.element);
      // out[i] = f(src[i]); same length, sized once.
      const body = m.block(null, [
        m.local.set(srcRef, toExpression(recv)),
        m.local.set(cloRef, toExpression(cb)),
        m.local.set(nLocal, listLen(s())),
        m.local.set(
          backLocal,
          m.array.new_default(outLt.backing.heapType, n()),
        ),
        m.local.set(iLocal, m.i32.const(0)),
        m.block(doneLabel, [
          m.loop(
            loopLabel,
            m.block(null, [
              m.br(doneLabel, m.i32.ge_u(i(), n())),
              m.array.set(
                back(),
                i(),
                indirectCall(clo(), [src.element], [elemAt()], outWasm),
              ),
              m.local.set(iLocal, m.i32.add(i(), m.i32.const(1))),
              m.br(loopLabel),
            ]),
          ),
        ]),
        m.struct.new([back(), n(), n()], outLt.heapType),
      ], outLt.refType);
      return body;
    }

    // filter: keep elements where f(src[i]) is true. Size the backing to `n` (the
    // max possible) once, write survivors compactly, and report the survivor
    // count as `len` (cap stays `n`).
    const jLocal = newLocal(binaryen.i32);
    const j = () => m.local.get(jLocal, binaryen.i32);
    const body = m.block(null, [
      m.local.set(srcRef, toExpression(recv)),
      m.local.set(cloRef, toExpression(cb)),
      m.local.set(nLocal, listLen(s())),
      m.local.set(backLocal, m.array.new_default(outLt.backing.heapType, n())),
      m.local.set(iLocal, m.i32.const(0)),
      m.local.set(jLocal, m.i32.const(0)),
      m.block(doneLabel, [
        m.loop(
          loopLabel,
          m.block(null, [
            m.br(doneLabel, m.i32.ge_u(i(), n())),
            m.if(
              indirectCall(clo(), [src.element], [elemAt()], binaryen.i32),
              m.block(null, [
                m.array.set(back(), j(), elemAt()),
                m.local.set(jLocal, m.i32.add(j(), m.i32.const(1))),
              ]),
            ),
            m.local.set(iLocal, m.i32.add(i(), m.i32.const(1))),
            m.br(loopLabel),
          ]),
        ),
      ]),
      m.struct.new([back(), j(), n()], outLt.heapType),
    ], outLt.refType);
    return body;
  };

  // `m.keys()` / `m.values()`: build a fresh `K[]` / `V[]` list of the map's live
  // entries IN INSERTION ORDER (walk `[0, count)` skipping tombstones, append the
  // live keys/values). This is the map iteration surface (`for k in m.keys()`),
  // since the parser's `for…in` only admits i32-keyed arrays/lists. Returns the
  // binaryen expr, or null when `node` isn't such a call.
  let mapKVCounter = 0;
  const lowerMapKeysValues = (node: VLCallNode): number | null => {
    if (node.callee.type !== "PropertyAccess") return null;
    const prop = node.callee.property;
    if (prop !== "keys" && prop !== "values") return null;
    const recv = node.callee.object;
    const src = mapTypeOf(recv);
    if (!src) return null;
    const mt = src.mt;
    // A `Set<T>` stores its elements as the map KEYS (the value slot is the
    // unused membership boolean). A set exposes only `.values(): T[]` — its
    // elements — so a set's `.values()` materializes the KEYS, not the booleans.
    // (Sets never expose `.keys()`.) A map's `.keys()`/`.values()` are unchanged.
    const isSet = isSetTypeCodegen(softenImplicitType(codegenType(recv)));
    const wantKeys = isSet ? true : prop === "keys";
    const element = wantKeys ? mt.key : mt.value;
    const outLt = listType(softenImplicitType(element));
    const srcArrRef = wantKeys ? mt.keys.refType : mt.vals.refType;
    const srcField = wantKeys ? MAP_KEYS : MAP_VALS;
    const srcElemWasm = wantKeys ? mt.keyElemWasm : mt.valElemWasm;
    const srcIsRef = wantKeys ? mt.keyIsRef : mt.valIsRef;

    const id = mapKVCounter++;
    const loopLabel = `mkv_loop${id}`;
    const doneLabel = `mkv_done${id}`;
    const mapLocal = newLocal(mt.refType);
    const entriesLocal = newLocal(srcArrRef);
    const liveLocal = newLocal(mt.flags.refType);
    const backLocal = newLocal(outLt.backing.refType);
    const nLocal = newLocal(binaryen.i32); // size (out length)
    const cntLocal = newLocal(binaryen.i32); // entry count (incl tombstones)
    const iLocal = newLocal(binaryen.i32);
    const jLocal = newLocal(binaryen.i32);
    const map = () => m.local.get(mapLocal, mt.refType);
    const entries = () => m.local.get(entriesLocal, srcArrRef);
    const live = () => m.local.get(liveLocal, mt.flags.refType);
    const back = () => m.local.get(backLocal, outLt.backing.refType);
    const n = () => m.local.get(nLocal, binaryen.i32);
    const cnt = () => m.local.get(cntLocal, binaryen.i32);
    const i = () => m.local.get(iLocal, binaryen.i32);
    const j = () => m.local.get(jLocal, binaryen.i32);
    const stored = () => {
      const read = m.array.get(entries(), i(), srcElemWasm, false);
      return srcIsRef ? m.ref.as_non_null(read) : read;
    };
    return m.block(null, [
      m.local.set(mapLocal, toExpression(recv)),
      m.local.set(entriesLocal, m.struct.get(srcField, map(), srcArrRef, false)),
      m.local.set(
        liveLocal,
        m.struct.get(MAP_LIVE, map(), mt.flags.refType, false),
      ),
      m.local.set(nLocal, m.struct.get(MAP_SIZE, map(), binaryen.i32, false)),
      m.local.set(cntLocal, m.struct.get(MAP_COUNT, map(), binaryen.i32, false)),
      // Allocate the backing. A list backing has a NON-nullable element, so for a
      // reference element `array.new_default` (null init) is invalid; instead fill
      // with a known non-null entry (a stored key/value is never nulled — even a
      // tombstone keeps it — so `entries[0]` is non-null whenever count > 0). An
      // empty map uses a zero-length fixed array. Scalar elements default-init.
      srcIsRef
        ? m.if(
          m.i32.eqz(cnt()),
          m.local.set(
            backLocal,
            m.array.new_fixed(outLt.backing.heapType, []),
          ),
          m.local.set(
            backLocal,
            m.array.new(
              outLt.backing.heapType,
              n(),
              m.ref.as_non_null(
                m.array.get(entries(), m.i32.const(0), srcElemWasm, false),
              ),
            ),
          ),
        )
        : m.local.set(
          backLocal,
          m.array.new_default(outLt.backing.heapType, n()),
        ),
      m.local.set(iLocal, m.i32.const(0)),
      m.local.set(jLocal, m.i32.const(0)),
      m.block(doneLabel, [
        m.loop(
          loopLabel,
          m.block(null, [
            m.br(doneLabel, m.i32.ge_u(i(), cnt())),
            m.if(
              m.i32.ne(
                m.array.get(live(), i(), binaryen.i32, false),
                m.i32.const(0),
              ),
              m.block(null, [
                m.array.set(back(), j(), stored()),
                m.local.set(jLocal, m.i32.add(j(), m.i32.const(1))),
              ]),
            ),
            m.local.set(iLocal, m.i32.add(i(), m.i32.const(1))),
            m.br(loopLabel),
          ]),
        ),
      ]),
      m.struct.new([back(), n(), n()], outLt.heapType),
    ], outLt.refType);
  };

  // A placeholder value of a captured variable's wasm type, used during the
  // capture-collection pass (whose body is discarded once captures are known).
  const zeroOf = (type: VLType): number => {
    const t = softenImplicitType(type);
    // A captured list is a null of its (nullable) list-struct ref type.
    if (isListType(t)) {
      return m.ref.null(
        binaryen.getTypeFromHeapType(
          listType(softenImplicitType(arrayElementType(t)!)).heapType,
          true,
        ),
      );
    }
    const wt = toWasmType(type);
    if (wt === binaryen.i64) return m.i64.const(BigInt(0));
    if (wt === binaryen.f32) return m.f32.const(0);
    if (wt === binaryen.f64) return m.f64.const(0);
    if (wt === binaryen.i32) return m.i32.const(0);
    // Any remaining reference type (a structural object/struct, a string or
    // other named array, a map, a function/closure) zero-inits as a `ref.null`
    // of its *nullable* heap type — both for the discarded capture-collection
    // pass and as the placeholder a ref-typed module global is created with
    // (the start function then `global.set`s the real value). `refHeapType`
    // resolves the heap type; anything it can't is genuinely unsupported.
    try {
      return m.ref.null(
        binaryen.getTypeFromHeapType(refHeapType(t), true),
      );
    } catch {
      throw new Error("Cannot capture this value type yet");
    }
  };

  const getResolvedFunctionName = (name: string) => {
    let i = functionScopes.length - 1;
    while (i >= 0) {
      if (Object.hasOwn(functionScopes[i], name)) {
        return functionScopes[i][name];
      }
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
    const instanceName = count === 0
      ? resolvedName
      : `${resolvedName}$${count}`;
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
      // SOUNDNESS (function-local narrowing): the `narrowed` overlay is keyed by
      // bare NAME, so it must not leak across a function boundary. A function body
      // is instantiated LAZILY at its first call site (`getOrInstantiate`), which
      // can fire from *inside* a narrowed branch of another function — e.g. a
      // mutually-recursive visitor `checkExpr`/`checkStmt`, where each narrows its
      // own `n` and calls the other. Without this reset the callee's body would be
      // compiled while the caller's `narrowed["n"]` (a DIFFERENT, same-named
      // local, narrowed to a DIFFERENT variant) is still in scope, so the callee's
      // `n` would lower against the wrong variant — a `ref.cast`/`struct.get` to
      // the wrong struct ("Object has no field …"). Snapshot, clear, and restore
      // around the body so each function starts from a clean overlay; captures and
      // module globals don't use this overlay, so clearing it is safe.
      const savedNarrowed = { ...narrowed };
      for (const k in narrowed) delete narrowed[k];
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
      for (const k in narrowed) delete narrowed[k];
      Object.assign(narrowed, savedNarrowed);
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
    return existing === -1 ? functionTable.push(instanceName) - 1 : existing;
  };

  // `base` object shape with each field overridden by `desired`'s field type
  // when that is a union or nullable — those carry the boxed / niche
  // representation that `base` (an object literal's or argument's narrower
  // inferred shape) lacks. Other fields keep `base`'s own concrete/inferred
  // type. Used to reconcile a value with the union fields of its target shape,
  // so the struct it builds matches the binding/parameter it flows into.
  const mergeDesiredUnionFields = (
    base: VLObjectType,
    desired: VLObjectType,
  ): VLObjectType => {
    const desiredProp = (name: string) =>
      desired.properties.find((p) =>
        p.name.type === "StringLiteral" && p.name.value === name
      );
    return {
      type: "Object",
      name: base.name,
      properties: base.properties.map((p) => {
        const name = p.name.type === "StringLiteral" ? p.name.value : undefined;
        const dp = name !== undefined ? desiredProp(name) : undefined;
        if (!dp) return p;
        const ds = softenImplicitType(dp.type);
        // A union/nullable field needs its boxed/niche type from the target.
        if (ds.type === "Union" || ds.type === "Nullable") {
          return { ...p, type: dp.type };
        }
        // A *list* field (`{ nodes: T[] }`) takes the target's element type:
        // an empty `[]` literal infers an empty-union element (`{[i32]: ⊥}`),
        // which can't pin its backing's slot type — and softening that degenerate
        // union crashes. A non-empty literal infers a narrower/looser element than
        // the field's declared `T[]` (e.g. `[1]` → `i32[]` vs a field `i64[]`), so
        // the field's own list type must win for the struct slot to match the
        // declared `(ref List_T)`. The literal value then coerces to it via the
        // `withDesiredType(f.type, …)` at the object-literal operand site.
        if (isListType(ds)) {
          return { ...p, type: dp.type };
        }
        // Recurse into a nested object field so a deeper union (`{a:{b:T|U}}`)
        // is reconciled too — overriding only union/nullable leaves, so generic
        // inference holes in the target are left untouched. Unwrap the base field
        // *shallowly* (Infer only — NOT a deep `softenImplicitType`, which would
        // descend into a nested degenerate empty-`[]` field and crash on its empty
        // union); the recursion re-softens each property on the desired side as it
        // goes, applying the list/union overrides above per field.
        let bs = p.type;
        while (bs.type === "Infer") bs = bs.subType;
        if (ds.type === "Object" && bs.type === "Object") {
          return { ...p, type: mergeDesiredUnionFields(bs, ds) };
        }
        return p;
      }),
    };
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
    // Bind arguments to parameters by name (then positionally), matching the
    // checker, so the structural-object shape below reads from the argument that
    // actually fills each slot — not the one at the same source position.
    const orderedArgs = node.functionType
      ? orderArgumentsByParameters(node.functionType.paramaters, node.arguments)
      : node.arguments;
    const paramTypes = node.functionType
      ? node.functionType.paramaters.map((p, i) => {
        let pt = softenImplicitType(p.paramaterType);
        while (pt.type === "Infer") pt = softenImplicitType(pt.subType);
        if (pt.type === "Object" && pt.name === undefined && orderedArgs[i]) {
          const argShape = softenImplicitType(vlType(orderedArgs[i]!.value));
          // Take the argument's own shape (WasmGC structs aren't width-subtypes),
          // but keep the declared union/nullable fields — the argument is coerced
          // to them at the call boundary, so the instance must compile against
          // them too (else `o.v`'s narrowing and the passed struct disagree).
          return argShape.type === "Object"
            ? mergeDesiredUnionFields(argShape, pt)
            : argShape;
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
    const idx = m.struct.get(
      0,
      m.local.get(cloLocal, clo),
      binaryen.i32,
      false,
    );
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
      const isTail = i === tail;
      // A statement in non-tail position is evaluated for effect: its value is
      // discarded, so it carries no desired type (so its own inferred type
      // drives lowering, never a spurious numeric default) and any value left on
      // the stack must be `drop`-ed. The tail keeps the ambient desired type — it
      // supplies the block's value when one is wanted; in a void context
      // (`__program__`, a void block) the ambient is undefined, so it too is an
      // unconsumed statement and its value is dropped.
      const v = stmt.type === "FunctionDeclaration"
        ? handleFunctionDecl(stmt)
        : isTail
        ? toExpression(stmt)
        : withDesiredType(undefined, () => toExpression(stmt));
      if (typeof v === "number") {
        // Drop a value left on the stack by an expression used purely as a
        // statement (e.g. `arr.pop()` returning `T | null`, or any non-`void`
        // call for its effect): a non-final block element that returns a value is
        // invalid wasm. Skip the tail when a value is wanted (a desired type is
        // set); skip results already `none`/`unreachable` (void calls, an
        // already-dropped call, a diverging statement).
        const wt = binaryen.getExpressionType(v);
        const wants = isTail && hasDesiredType();
        out.push(
          !wants && wt !== binaryen.none && wt !== binaryen.unreachable
            ? m.drop(v)
            : v,
        );
      }
      // Post-guard narrowing (A5): after a divergent guard (`if x == null
      // { return }`, or `|| `-chained), narrow each guarded place for the rest of
      // this block. Names resolve via `lookupName`; paths read the narrowed type.
      for (const n of postGuardNarrowings(stmt)) {
        const cur = n.place.type === "Name"
          ? lookupName(n.name)?.type
          : codegenType(n.place);
        if (!cur) continue;
        const next = n.apply(cur);
        if (next.type === "Never") continue;
        if (!(n.name in saved)) saved[n.name] = narrowed[n.name];
        narrowed[n.name] = next;
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
        // A top-level binding referenced from inside a function becomes a wasm
        // global (shared, mutable), not a `__program__` local — so functions
        // read/write it through `global.get`/`global.set` on the one shared
        // cell. Scalars ride in their value type; reference types (strings,
        // structs, lists, maps, closures) ride in the *nullable* ref form and
        // are read back with `ref.as_non_null` (see `globalCellType` /
        // `globalRead`), so reassigning a ref binding inside one function is
        // visible to another. Register the globals up front so functions
        // compiled while lowering the body resolve these names to the global.
        const topLevel = Object.entries(node.scope)
          .filter(([k, v]) => !ignoredKeys.has(k) && v.type !== "Function");
        // Globalize only the top-level bindings actually referenced from inside a
        // function body. A binding used only at module scope can stay a
        // `__program__` local — keeping codegen unchanged for the common case and
        // sidestepping name clashes (e.g. a top-level `for i`/`let i` reusing a
        // name that is never touched by a function). Names read or assigned
        // inside any function are collected by walking the function bodies.
        const usedInFunctions = collectFunctionBodyNames(node.statements);
        for (const [k, v] of topLevel) {
          if (usedInFunctions.has(k) && (isScalarWasm(v) || isGlobalizableRef(v))) {
            moduleGlobals.set(k, v);
            ensureGlobal(k, v);
          }
        }
        const modifiedScope = Object.fromEntries(
          topLevel
            .filter(([k]) => !moduleGlobals.has(k))
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
        // `x !is T` (A4) is the boolean negation of `x is T`; compute `is`, then
        // `eqz` the result.
        const negate = (e: number) => node.negated ? m.i32.eqz(e) : e;
        // A boxed value union discriminates on its tag: `x is T` compares the
        // tag field to T's tag (`null` included).
        let t = softenImplicitType(codegenType(node.value));
        while (t.type === "Infer") t = softenImplicitType(t.subType);
        const info = unionInfo(t);
        if (info) {
          const tag = checksNull
            ? info.nullTag
            : variantTag(info, node.checkType);
          return negate(m.i32.eq(
            m.struct.get(0, toExpression(node.value), binaryen.i32, false),
            m.i32.const(tag),
          ));
        }
        // A niche / reference nullable: `x is null` → null test; `x is T` (T the
        // non-null variant) → its negation.
        if (t.type === "Nullable") {
          const isNull = nullnessTest(node.value);
          return negate(checksNull ? isNull : m.i32.eqz(isNull));
        }
        // A monomorphic concrete type (e.g. an un-annotated param specialized to
        // `i32` per call): `x is T` is statically decidable — a value of type `t`
        // is a `T` iff `t` is (a variant/subtype of) `T` and not a *distinct*
        // scalar (`i32` is not `f64`). `x is null` on a non-nullable is false.
        // Evaluate the operand for side effects, then yield the constant.
        const matches = !checksNull && !distinctScalars(t, node.checkType) &&
          validateType(node.checkType, t);
        return m.block(
          null,
          [
            m.drop(toExpression(node.value)),
            m.i32.const((matches !== !!node.negated) ? 1 : 0),
          ],
          binaryen.i32,
        );
      }
      case "StringLiteral": {
        // A string literal is a WasmGC i32-array of its code points.
        const at = arrayType(i32Type);
        const chars = [...node.value].map((c) =>
          m.i32.const(c.codePointAt(0)!)
        );
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
        // `toString(x)` is a compiler builtin (H2): render a number/boolean as a
        // VL string (WasmGC i32-array of char codes). We branch on the argument's
        // emitted wasm type — a boolean (an i32 whose VL type is `boolean`) uses
        // the literal "true"/"false" helper; any other i32 uses the signed itoa
        // helper. f64/i64 stringification is a deliberate follow-up.
        if (node.function === "toString") {
          const arg = node.arguments[0].value;
          let t = softenImplicitType(codegenType(arg));
          while (t.type === "Infer") t = softenImplicitType(t.subType);
          const name = t.type === "Object" || t.type === "Alias"
            ? t.name
            : undefined;
          const value = withDesiredType(t, () => toExpression(arg));
          const wt = binaryen.getExpressionType(value);
          if (wt === binaryen.i32) {
            const at = arrayType(i32Type);
            return m.call(
              name === "boolean" ? boolToStringFn() : i32ToStringFn(),
              [value],
              at.refType,
            );
          }
          throw new Error(
            `toString: unsupported argument type "${name ?? t.type}" ` +
              "(only i32 and boolean are supported so far)",
          );
        }
        // `fromCodePoint(code)` is a compiler builtin (H2): construct a single-
        // character VL string from an i32 Unicode code point. A VL string is a
        // WasmGC i32-array of code points, so this is a length-1 array holding it.
        if (node.function === "fromCodePoint") {
          const arg = node.arguments[0].value;
          const code = withDesiredType(
            { type: "Alias", name: "i32" },
            () => toExpression(arg),
          );
          const at = arrayType(i32Type);
          return m.array.new_fixed(at.heapType, [code]);
        }
        // `Map()` / `Set()` builtin constructors (B6a): allocate an empty hash
        // collection. The concrete map type is the call's resolved return type
        // (pinned from the binding annotation), or — when the call is itself the
        // RHS being coerced — the desired type.
        if (node.function === "Map" || node.function === "Set") {
          let rt = node.functionType?.return;
          if (rt) {
            let s = softenImplicitType(rt);
            while (s.type === "Infer") s = softenImplicitType(s.subType);
            rt = s;
          }
          if (!rt || !isMapType(rt)) {
            const dt = desiredType ? softenImplicitType(desiredType) : undefined;
            if (dt && isMapType(dt)) rt = dt;
          }
          if (!rt || !isMapType(rt)) {
            throw new Error(
              `${node.function}() needs a map type annotation ` +
                "(e.g. `let m: {[string]: i32} = Map()`)",
            );
          }
          const kv = mapKeyValueType(rt)!;
          const mt = mapType(
            softenImplicitType(kv.key),
            softenImplicitType(kv.value),
          );
          return m.call(mapNewFn(mapBuiltinCtx, mt), [], mt.refType);
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

        // Bind arguments to parameters by NAME (then positionally), matching how
        // the type checker (`ensureParameters`) resolves them — otherwise an
        // out-of-order named call like `f(b: 1, a: 2)` would be emitted in source
        // order and mis-map onto the wasm function's positional parameters. An
        // injected `self`/operator receiver is an unnamed positional arg, so it
        // naturally falls into slot 0 here.
        const ordered = orderArgumentsByParameters(
          functionType.paramaters,
          node.arguments,
        );
        const operands = functionType.paramaters.map((p, i) =>
          withDesiredType(
            p.paramaterType,
            () => toExpression(ordered[i]!.value),
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
        // Intrinsic string methods (`s.slice`/`s.indexOf`/`s.includes`/
        // `s.charCodeAt`) lower directly to their wasm helpers; see
        // `compiler/builtins/strings.ts`. Returns null for any other call so we
        // fall through to the normal closure dispatch below.
        const stringMethod = lowerStringMethodCall(stringBuiltinCtx, node);
        if (stringMethod !== null) return stringMethod;
        // Higher-order list producers (`l.map(f)`/`l.filter(f)`) build a fresh
        // list via an inline loop that calls the closure indirectly.
        const mapFilter = lowerListMapFilter(node);
        if (mapFilter !== null) return mapFilter;
        // `m.keys()` / `m.values()` materialize an insertion-ordered `K[]`/`V[]`
        // list (the iteration surface). Built inline because they allocate a list
        // (listType/newLocal aren't in the maps builtin context).
        const mapKV = lowerMapKeysValues(node);
        if (mapKV !== null) return mapKV;
        // Intrinsic list methods (`l.get`/`l.push`/`l.pop`/`l.clear`) lower to
        // their per-element wasm helpers; see `compiler/builtins/lists.ts`.
        const listMethod = lowerListMethodCall(listBuiltinCtx, node);
        if (listMethod !== null) return listMethod;
        // Intrinsic map/set methods (`.get`/`.has`/`.set`/`.add`/`.delete`) lower
        // to their per-(key,value) wasm helpers; see `compiler/builtins/maps.ts`.
        const mapMethod = lowerMapMethodCall(mapBuiltinCtx, node);
        if (mapMethod !== null) return mapMethod;
        // Calling an arbitrary expression value, e.g. `o.f(args)`. The callee
        // evaluates to a closure struct; dispatch through it.
        const functionType = node.functionType;
        if (!functionType) {
          throw new Error("Expected functionType to be set on a Call");
        }
        // Bind by name (then positionally), as the type checker does, so an
        // out-of-order named call maps onto the right parameter slots.
        const ordered = orderArgumentsByParameters(
          functionType.paramaters,
          node.arguments,
        );
        const operands = functionType.paramaters.map((p, i) =>
          withDesiredType(
            p.paramaterType,
            () => toExpression(ordered[i]!.value),
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
        // A `Map()` / `Set()` with no annotation to pin its type leaves an
        // unresolved constructor hole (B6a). The type checker reports this when
        // the declaration is in a block it type-infers; at module top level
        // (which isn't body-inferred) it reaches here — surface the same clear
        // message rather than the opaque "Unhandled Unknown type" from
        // `toWasmType`.
        if (
          node.variableType.type === "Infer" &&
          node.variableType.mapCtor &&
          node.variableType.subType.type === "Unknown"
        ) {
          throw new Error(
            `${node.variableType.mapCtor}() needs a map type annotation ` +
              "(e.g. `let m: {[string]: i32} = Map()`)",
          );
        }
        // A top-level declaration of a module global: initialize the shared wasm
        // global with `global.set` (the global itself was created, zero-init, in
        // the Program case). `functionBoundaries.length === 1` means we're at
        // module scope; inside a function a same-named `let` is a genuine local
        // that shadows the global, so it falls through to the local path.
        if (functionBoundaries.length === 1 && moduleGlobals.has(node.name)) {
          ensureGlobal(node.name, node.variableType);
          if (node.value) {
            return m.global.set(
              node.name,
              withDesiredType(node.variableType, () => toExpression(node.value!)),
            );
          }
          return m.nop();
        }
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
        // A module global reads through the shared wasm cell (`global.get`),
        // whether referenced at module scope or from inside a function — so a
        // function always sees the current value, not a stale captured copy.
        if (isModuleGlobal(node.name)) {
          return globalRead(node.name, moduleGlobals.get(node.name)!);
        }
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
          if (
            member && variantTag(info, nt) !== info.nullTag && !unionInfo(nt)
          ) {
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
        // A union- or nullable-typed field needs its declared (boxed / niche)
        // representation, but the literal only knows the *value's* narrower type
        // (`{ v: 5 }` infers `v: i32`, not the binding's `v: string | i32`). So
        // where the desired object shape types a field as a union/nullable,
        // override the field's type with it — both to build a matching struct and
        // to coerce the value. Other fields (incl. generic holes) keep the
        // literal's own concrete inferred type.
        let shape = objectTypeOf(node);
        let dt = desiredType ? softenImplicitType(desiredType) : undefined;
        while (dt && dt.type === "Infer") dt = softenImplicitType(dt.subType);
        // Unwrap a niche nullable (`{…} | null`): the object literal still builds
        // the *pointee* object, whose union-typed fields need their boxed
        // representation — otherwise `{ y: 5 }` for a `{ y: string | i32 } | null`
        // param builds `{ y: i32 }` and mismatches the niche struct.
        while (dt && dt.type === "Nullable") {
          dt = softenImplicitType(dt.subType);
        }
        if (dt && dt.type === "Object" && dt.name === undefined) {
          shape = mergeDesiredUnionFields(shape, dt);
        }
        const struct = objectStruct(shape);
        // Fields are emitted in the struct's (sorted) order, each from its
        // matching literal property and coerced to the field's declared type.
        const operands = struct.fields.map((f) => {
          const prop = node.properties.find((p) =>
            (p.name.type === "Name" && p.name.name === f.name) ||
            (p.name.type === "StringLiteral" && p.name.value === f.name)
          );
          if (!prop) {
            throw new Error(`Object literal missing field "${f.name}"`);
          }
          return withDesiredType(f.type, () => toExpression(prop.value));
        });
        return m.struct.new(operands, struct.heapType);
      }
      case "ArrayLiteral": {
        // A `[...]` literal is always a list (anonymous `[i32]:T`): build the
        // backing via `array.new_fixed`, then wrap it `{ backing, len=N, cap=N }`.
        // An empty `[]` has no value to pin its element from (its element type is
        // an empty union), so take the element from the desired type instead
        // (`let xs: i32[] = []`, a list-typed argument, etc.).
        //
        // SOUNDNESS (union elements): a `[{x:1}]` literal infers its element from
        // the VALUES (`{x:i32}`, a bare variant), but a desired `(A|B)[]` element
        // is the BOXED union (`{tag,value}`). The backing array — and each
        // element's `desiredType`-driven boxing — must use the boxed union element,
        // not the narrower inferred variant; otherwise the slot stores an unboxed
        // variant while a later `arr[i]` read (and any `is`-narrowing of it)
        // expects the box, producing a wasm `struct.get`/`ref.cast` type mismatch
        // ("Object has no field …"). So prefer the desired element when it is a
        // union/nullable that boxes (`unionInfo` non-null). For non-boxing desired
        // elements the value-inferred element stays authoritative (it already
        // matches and may be more concrete).
        let info = node.values.length === 0 ? null : listTypeOf(node);
        if (desiredType) {
          let dt = softenImplicitType(desiredType);
          while (dt.type === "Nullable") dt = softenImplicitType(dt.subType);
          const dtElem = arrayElementType(dt);
          if (dtElem) {
            const soft = softenImplicitType(dtElem);
            // Empty literal: nothing to infer from, take the desired element.
            // Non-empty: only override when the desired element is a boxed
            // union/nullable (so variant values get boxed into its rep).
            if (!info || unionInfo(soft)) {
              info = { lt: listType(soft), element: soft };
            }
          }
        }
        if (!info) info = listTypeOf(node);
        if (!info) throw new Error("Array literal did not resolve to a list");
        const values = node.values.map((v) =>
          withDesiredType(info!.element, () => toExpression(v))
        );
        const backing = m.array.new_fixed(info.lt.backing.heapType, values);
        const n = m.i32.const(values.length);
        return m.struct.new([backing, n, m.i32.const(values.length)], info.lt.heapType);
      }
      case "IndexAccess": {
        // A map `m[k]` is a hash lookup yielding `V | null` (normal absence —
        // the deliberate exception to sequence indexing). Lowered to the `.get`
        // helper.
        const map = mapTypeOf(node.array);
        if (map) {
          return m.call(
            mapGetFn(mapBuiltinCtx, map.mt),
            [
              toExpression(node.array),
              withDesiredType(map.key, () => toExpression(node.index)),
            ],
            toWasmType({ type: "Nullable", subType: map.value }),
          );
        }
        // A list `l[i]` is a bounds-checked (trap-on-OOB) read off `backing`; a
        // raw i32-array (string) keeps the native `array.get` (it traps natively).
        const list = listTypeOf(node.array);
        if (list) {
          return listGet(
            list.lt,
            toExpression(node.array),
            withDesiredType(i32Type, () => toExpression(node.index)),
          );
        }
        const info = arrayTypeOf(node.array);
        if (!info) throw new Error("Index access on a non-array");
        return arrayReadCast(
          info.at,
          m.array.get(
            toExpression(node.array),
            withDesiredType(i32Type, () => toExpression(node.index)),
            info.at.backingWasm,
            false,
          ),
        );
      }
      case "PropertyAccess": {
        // Shared-field access over a struct union (`(A | B).tag`): the field is
        // present on every member but the object's static type is a union, not a
        // single struct. Recover each member's payload (by tag) and read the
        // field at THAT member's own index — members may store a shared field at
        // different indices, so we dispatch on the tag rather than assume a common
        // layout. Sound because the type-checker already proved every member
        // carries the field (see `sharedUnionField` in typecheck.ts).
        {
          const shared = sharedUnionFieldRead(node);
          if (shared !== null) return shared;
        }
        const objType = objectTypeOf(node.object);
        // List size members are intrinsic struct reads: `.length` → `len`,
        // `.capacity` → `cap` (both O(1)). A raw i32-array (string) keeps
        // `.length` → `array.len`.
        if (isListType(objType)) {
          const ref = toExpression(node.object);
          if (node.property === "length") {
            return m.struct.get(LIST_LEN, ref, binaryen.i32, false);
          }
          if (node.property === "capacity") {
            return m.struct.get(LIST_CAP, ref, binaryen.i32, false);
          }
          throw new Error(`List has no member "${node.property}"`);
        }
        // Map/Set size member: `.length` → `struct.get $size` (O(1) live count).
        // Unified on `.length` across List/Map/Set (C2.3); both maps and sets use
        // the same hash-map struct, so both read the stored live-entry/membership
        // count from `MAP_SIZE`.
        if (isMapTypeCodegen(objType)) {
          if (node.property === "length") {
            return m.struct.get(
              MAP_SIZE,
              toExpression(node.object),
              binaryen.i32,
              false,
            );
          }
          throw new Error(`Map has no member "${node.property}"`);
        }
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
        const read = m.struct.get(
          field.index,
          toExpression(node.object),
          toWasmType(field.type),
          false,
        );
        // A flow-narrowed union field (`if o.v is i32 { o.v }`) is read as the
        // narrowed variant — pull the payload out of the field's `{ tag, value }`
        // struct and recover it, mirroring the narrowed-Name case.
        const key = placeKey(node);
        const info = key !== null && key in narrowed
          ? unionInfo(field.type)
          : null;
        if (info) {
          const nt = narrowed[key!];
          const member = findVariant(info, nt);
          if (
            member && variantTag(info, nt) !== info.nullTag && !unionInfo(nt)
          ) {
            const payload = m.struct.get(1, read, info.payloadWasm, false);
            return unboxPayload(info, member, payload);
          }
        }
        return read;
      }
      case "OptionalAccess": {
        // `x?.y` ≡ eval `x` once into a temp; `null` if it's null, else `x.y`.
        // The temp is bound in scope and (in the non-null arm) narrowed to the
        // non-null object, so the member read + boxing reuse the normal paths.
        let objType = softenImplicitType(codegenType(node.object));
        while (objType.type === "Infer") {
          objType = softenImplicitType(objType.subType);
        }
        const objWasm = toWasmType(objType);
        const index = _locals.push(objWasm) - 1 + (_locals.params ?? 0);
        const tmpName = `$opt${index}`;
        currentScope[tmpName] = [objType, index];
        const tmpRef: VLExpression = { type: "Name", name: tmpName };
        let R = softenImplicitType(codegenType(node));
        while (R.type === "Infer") R = softenImplicitType(R.subType);
        const setTmp = m.local.set(index, toExpression(node.object));
        const nullArm = withDesiredType(
          R,
          () => toExpression({ type: "NullLiteral" }),
        );
        const memberArm = withDesiredType(
          R,
          () =>
            withNarrowed(
              tmpName,
              nonNullable(objType),
              () =>
                toExpression({
                  type: "PropertyAccess",
                  object: tmpRef,
                  property: node.property,
                }),
            ),
        );
        return m.block(
          null,
          [setTmp, m.if(nullnessTest(tmpRef), nullArm, memberArm)],
          binaryen.auto,
        );
      }
      case "NullCoalesce": {
        // `x ?? y` ≡ eval `x` once into a temp; `x` (narrowed non-null) if it's
        // non-null, else `y`. Both arms coerced to the result union.
        let leftType = softenImplicitType(codegenType(node.left));
        while (leftType.type === "Infer") {
          leftType = softenImplicitType(leftType.subType);
        }
        const leftWasm = toWasmType(leftType);
        const index = _locals.push(leftWasm) - 1 + (_locals.params ?? 0);
        const tmpName = `$coal${index}`;
        currentScope[tmpName] = [leftType, index];
        const tmpRef: VLExpression = { type: "Name", name: tmpName };
        let R = softenImplicitType(codegenType(node));
        while (R.type === "Infer") R = softenImplicitType(R.subType);
        const setTmp = m.local.set(index, toExpression(node.left));
        const leftArm = withDesiredType(
          R,
          () =>
            withNarrowed(
              tmpName,
              nonNullable(leftType),
              () => toExpression(tmpRef),
            ),
        );
        const rightArm = withDesiredType(R, () => toExpression(node.right));
        return m.block(
          null,
          [setTmp, m.if(nullnessTest(tmpRef), rightArm, leftArm)],
          binaryen.auto,
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
        const delta = op === "++" ? 1 : -1;
        // `++`/`--` on a module global mutates the shared wasm cell. binaryen has
        // no `global.tee`, so in value position read it back explicitly.
        if (isModuleGlobal(node.operand.name)) {
          const name = node.operand.name;
          const next = m.i32.add(m.global.get(name, binaryen.i32), m.i32.const(delta));
          if (!hasDesiredType()) return m.global.set(name, next);
          const set = m.global.set(name, next);
          const read = m.global.get(name, binaryen.i32);
          return node.prefix
            ? m.block(null, [set, read], binaryen.i32)
            : m.block(null, [set, m.i32.sub(read, m.i32.const(delta))], binaryen.i32);
        }
        const [, idx] = getScopeEntry(node.operand.name);
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
            // `m[k] = v` on a map: hash insert/overwrite via the `.set` helper.
            const map = mapTypeOf(access.array);
            if (map) {
              // Statement position: just set (no read-back).
              if (!desiredType) {
                return m.call(
                  mapSetFn(mapBuiltinCtx, map.mt),
                  [
                    toExpression(access.array),
                    withDesiredType(map.key, () => toExpression(access.index)),
                    withDesiredType(map.value, () => toExpression(node.right)),
                  ],
                  binaryen.none,
                );
              }
              // Value position: the assignment expression evaluates to the set
              // value. Mirror the list path — hoist the receiver and key into
              // locals so each subexpression (and any side effect) is evaluated
              // ONCE, then set and read back. The result type is `V | null` (the
              // map's read shape); the just-set key is always present, so the
              // read-back is the live value.
              const mapRef = newLocal(map.mt.refType);
              const keyWasm = toWasmType(map.key);
              const keyLocal = newLocal(keyWasm);
              const mRef = () => m.local.get(mapRef, map.mt.refType);
              const kRef = () => m.local.get(keyLocal, keyWasm);
              const retWasm = toWasmType({
                type: "Nullable",
                subType: map.value,
              });
              return m.block(null, [
                m.local.set(mapRef, toExpression(access.array)),
                m.local.set(
                  keyLocal,
                  withDesiredType(map.key, () => toExpression(access.index)),
                ),
                m.call(
                  mapSetFn(mapBuiltinCtx, map.mt),
                  [
                    mRef(),
                    kRef(),
                    withDesiredType(map.value, () => toExpression(node.right)),
                  ],
                  binaryen.none,
                ),
                m.call(
                  mapGetFn(mapBuiltinCtx, map.mt),
                  [mRef(), kRef()],
                  retWasm,
                ),
              ], retWasm);
            }
            const list = listTypeOf(access.array);
            if (list) {
              // `l[i] = v` on a list: bounds-check `i` against `len` (trap on OOB
              // — the spare `[len, cap)` slots are not addressable), then
              // `array.set(backing, i, v)`. In value position read back the slot.
              const wasmType = toWasmType(list.element);
              const lRef = newLocal(list.lt.refType);
              const iLocal = newLocal(binaryen.i32);
              const l = () => m.local.get(lRef, list.lt.refType);
              const i = () => m.local.get(iLocal, binaryen.i32);
              const value = withDesiredType(
                list.element,
                () => toExpression(node.right),
              );
              const body = [
                m.local.set(lRef, toExpression(access.array)),
                m.local.set(
                  iLocal,
                  withDesiredType(i32Type, () => toExpression(access.index)),
                ),
                m.if(m.i32.ge_u(i(), listLen(l())), m.unreachable()),
                m.array.set(listBacking(list.lt, l()), i(), value),
              ];
              return desiredType
                ? m.block(null, [
                  ...body,
                  arrayReadCast(
                    list.lt.backing,
                    m.array.get(
                      listBacking(list.lt, l()),
                      i(),
                      list.lt.backing.backingWasm,
                      false,
                    ),
                  ),
                ], wasmType)
                : m.block(null, body, binaryen.none);
            }
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
                arrayReadCast(
                  info.at,
                  m.array.get(
                    toExpression(access.array),
                    withDesiredType(i32Type, () => toExpression(access.index)),
                    info.at.backingWasm,
                    false,
                  ),
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
          // A module global is written through the shared wasm cell — this is the
          // write-through path: a function reassigning it mutates the one global,
          // visible to the caller and to every other function.
          if (isModuleGlobal(node.left.name)) {
            const type = moduleGlobals.get(node.left.name)!;
            const set = m.global.set(
              node.left.name,
              withDesiredType(type, () => toExpression(node.right)),
            );
            // In value position read the cell back (`global.set` yields nothing).
            // A ref global reads through `globalRead`'s `ref.as_non_null`, so the
            // expression's type stays the non-null value type, not the cell's
            // nullable ref.
            return desiredType
              ? m.block(
                null,
                [set, globalRead(node.left.name, type)],
                toWasmType(type),
              )
              : set;
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
        // Short-circuit logical operators: `a && b` ≡ `if a then b else 0`,
        // `a || b` ≡ `if a then 1 else b`. The right operand is compiled with the
        // left's narrowing applied (so `o != null && o.y` resolves `o.y`) — the
        // then-narrowings for `&&`, the else-narrowings for `||`.
        if (op === "&&" || op === "||") {
          const boolType: VLType = { type: "Alias", name: "boolean" };
          const left = withDesiredType(boolType, () => toExpression(node.left));
          const ns = op === "&&"
            ? thenNarrowings(node.left)
            : elseNarrowings(node.left);
          const right = withNarrowedList(
            ns,
            () => withDesiredType(boolType, () => toExpression(node.right)),
          );
          return op === "&&"
            ? m.if(left, right, m.i32.const(0))
            : m.if(left, m.i32.const(1), right);
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
              // Structural `==`/`!=`, and list `==`/`!=`/`+` (concat), have no
              // operator method — the right operand is just the same list/object
              // type.
              : (op === "==" || op === "!=" || (op === "+" && isListType(leftType)))
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
        // List `==`/`!=`: length + element compare via a per-element-type helper
        // (recurses through `valueEq`). `isListType` excludes `string` (handled
        // below by name). Must precede the structural-struct branch, which would
        // otherwise treat the list struct as a plain data struct.
        if (isListType(leftType) && (op === "==" || op === "!=")) {
          const element = arrayElementType(leftType)!;
          const eq = m.call(
            listEqFn(element),
            [toExpression(node.left), toExpression(node.right)],
            binaryen.i32,
          );
          return op === "==" ? eq : m.i32.eqz(eq);
        }
        // List concat `a + b` → a *new* `T[]` (collections-design §VL.4): size
        // one backing exactly `lenA + lenB`, then two bulk `array.copy`s (a at
        // offset 0, b at offset lenA) — no incremental-growth churn — and wrap it
        // `{ backing, len = cap = lenA + lenB }`. Must precede the string branch.
        if (isListType(leftType) && op === "+") {
          const lt = listType(softenImplicitType(arrayElementType(leftType)!));
          const aLocal = newLocal(lt.refType);
          const bLocal = newLocal(lt.refType);
          const outLocal = newLocal(lt.backing.refType);
          const nLocal = newLocal(binaryen.i32);
          const a = () => m.local.get(aLocal, lt.refType);
          const b = () => m.local.get(bLocal, lt.refType);
          const out = () => m.local.get(outLocal, lt.backing.refType);
          const n = () => m.local.get(nLocal, binaryen.i32);
          return m.block(null, [
            m.local.set(aLocal, toExpression(node.left)),
            m.local.set(bLocal, toExpression(node.right)),
            m.local.set(nLocal, m.i32.add(listLen(a()), listLen(b()))),
            m.local.set(outLocal, m.array.new_default(lt.backing.heapType, n())),
            m.array.copy(
              out(),
              m.i32.const(0),
              listBacking(lt, a()),
              m.i32.const(0),
              listLen(a()),
            ),
            m.array.copy(
              out(),
              listLen(a()),
              listBacking(lt, b()),
              m.i32.const(0),
              listLen(b()),
            ),
            m.struct.new([out(), n(), n()], lt.heapType),
          ], lt.refType);
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
            if (t !== binaryen.none && t !== binaryen.unreachable) {
              blockType = t;
            }
          }
        }
        return m.block(null, stmts, blockType);
      }
      case "If": {
        const cond = node.conditionals[0].condition;
        // Flow narrowing (A5): the then-branch sees the condition's
        // then-narrowings (a `&&` narrows several places at once), the else side
        // its else-narrowings. Uses the function-level `withNarrowedList`.
        const thenStmt = () => toExpression(node.conditionals[0].statement);
        const thenBranch = () =>
          withNarrowedList(thenNarrowings(cond), thenStmt);
        // The else side (a further `else if` chain, or the `else`). Its own
        // recursion re-applies the next condition's else-narrowing on top of this
        // one (the `narrowed` overlay persists), so an else-if chain composes —
        // `if x is A {} else if x is B {} else { /* x: U − A − B */ }`.
        const elseStmt = (): number | undefined => {
          if (node.conditionals.length > 1) {
            return toExpression({
              ...node,
              conditionals: node.conditionals.slice(1),
            });
          }
          if (node.else) return toExpression(node.else);
          // No `else`. If the `if`'s value is wanted as a *non-nullable* type,
          // the type checker proved the conditions exhaustive (an else-less `if`
          // with a reachable fall-through would type as nullable) — so the
          // fall-through is unreachable; emit `unreachable`, not a `none` branch.
          if (hasDesiredType()) {
            let dt = softenImplicitType(desiredType!);
            while (dt.type === "Infer") dt = softenImplicitType(dt.subType);
            const nullable = dt.type === "Nullable" ||
              (dt.type === "Alias" && dt.name === "null");
            if (!nullable) return m.unreachable();
          }
          return undefined;
        };
        const elseBranch = (): number | undefined =>
          withNarrowedList(elseNarrowings(cond), elseStmt);
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
          // Synthesized loop-counter binding (no source); reprint metadata is
          // irrelevant here, so it carries no explicit annotation.
          annotated: false,
        });
        const [, varIndex] = getScopeEntry(node.variable);
        const i = () => m.local.get(varIndex, binaryen.i32);
        const to = () => m.local.get(toLocal, binaryen.i32);
        const step = () => m.local.get(stepLocal, binaryen.i32);
        const loop = m.block(brk, [
          declare,
          m.local.set(
            toLocal,
            withDesiredType(i32Type, () => toExpression(node.to)),
          ),
          m.local.set(
            stepLocal,
            withDesiredType(i32Type, () => toExpression(stepExpr)),
          ),
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

        // (Map iteration is via `m.keys()` / `m.values()` — which return ordered
        // `K[]`/`V[]` lists — because the parser's `for…in` only admits i32-keyed
        // arrays/lists. Insertion order is materialized in those helpers below.)

        // A list iterates `[0, len)` over its `backing` (load `backing` once,
        // hoisted before the loop); a raw i32-array (string) over `array.len`.
        const list = listTypeOf(node.iterable);
        if (list) {
          const elemWasm = toWasmType(list.element);
          const listLocal = newLocal(list.lt.refType);
          const backLocal = newLocal(list.lt.backing.refType);
          const lenLocal = newLocal(binaryen.i32);
          const iLocal = newLocal(binaryen.i32);
          const varLocal = newLocal(elemWasm);
          currentScope[node.variable] = [list.element, varLocal];
          const lref = () => m.local.get(listLocal, list.lt.refType);
          const back = () => m.local.get(backLocal, list.lt.backing.refType);
          const i = () => m.local.get(iLocal, binaryen.i32);
          const loop = m.block(brk, [
            m.local.set(listLocal, toExpression(node.iterable)),
            m.local.set(lenLocal, listLen(lref())),
            m.local.set(backLocal, listBacking(list.lt, lref())),
            m.local.set(iLocal, m.i32.const(0)),
            m.loop(
              loopLabel,
              m.block(null, [
                m.br(brk, m.i32.ge_s(i(), m.local.get(lenLocal, binaryen.i32))),
                m.local.set(
                  varLocal,
                  arrayReadCast(
                    list.lt.backing,
                    m.array.get(back(), i(), list.lt.backing.backingWasm, false),
                  ),
                ),
                m.block(cont, [toExpression(node.statement)]),
                m.local.set(iLocal, m.i32.add(i(), m.i32.const(1))),
                m.br(loopLabel),
              ]),
            ),
          ]);
          loopLabels.pop();
          return loop;
        }

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
              m.local.set(
                varLocal,
                arrayReadCast(
                  info.at,
                  m.array.get(arr(), i(), info.at.backingWasm, false),
                ),
              ),
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
          `Unhandled AST -> WASM "${
            (node as { type: string }).type
          }" expression`,
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
    // A list (`T[] | null`, and the `.get`/`pop` nullable payload) is the list
    // struct heap type; a named array (string) stays the raw array heap type.
    if (isListType(t)) {
      return listType(softenImplicitType(arrayElementType(t)!)).heapType;
    }
    if (isMapType(t)) {
      const kv = mapKeyValueType(t)!;
      return mapType(kv.key, kv.value).heapType;
    }
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
    // A list (`T[]`, anonymous `[i32]:T`) is the `{backing,len,cap}` struct rep.
    // THE central switch: this flips the wasm type of every `T[]` value. A named
    // `[i32]:T` object (`string`) stays a raw WasmGC array below.
    if (isListType(t)) {
      return listType(softenImplicitType(arrayElementType(t)!)).refType;
    }
    // A map (`{[K]:V}` non-i32 key) is the hash struct rep.
    if (isMapType(t)) {
      const kv = mapKeyValueType(t)!;
      return mapType(kv.key, kv.value).refType;
    }
    if (t.type === "Object") {
      // An `i32`-index-sig object is a WasmGC array — this covers `string` (an
      // i32-array of char codes). A *structural* object (no builtin `name`)
      // without an index sig is a WasmGC struct.
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
  // still matches the `i32` member; a reference member by its STRUCTURAL shape
  // signature so distinct shapes get distinct tags. Used both to order variants
  // canonically and to map a checked/assigned type back to its tag.
  //
  // SOUNDNESS: a struct member keys on `structSig` (field names + recursive
  // shape), NOT on `toWasmType`. WasmGC erases field names — `{tag,x}` and
  // `{tag,y}` both lower to `(struct i32 i32)` and binaryen interns them to ONE
  // heap type — so a wasm-type key would give two distinct struct variants the
  // SAME tag, making `v is A` return true for a `B` value (a wrong `is` answer).
  // Keying on the field-name-aware `structSig` keeps them apart, so the tag a
  // value is boxed with at a flow boundary matches the tag `is A` tests.
  // Discrimination is therefore by STRUCTURAL shape: two `type` aliases with the
  // *same* field shape are the same variant (under structural typing a `B` value
  // genuinely IS an `A`), and a union of same-shape members needs an explicit
  // discriminant field to tell its variants apart.
  const variantKey = (type: VLType): string => {
    let t = softenImplicitType(type);
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "Alias" && t.name === "null") return "null";
    const vn = valueTypeName(t);
    if (vn !== null) return `v:${repWasm(vn)}:${vn === "boolean" ? "b" : "n"}`;
    // A bare numeric literal carries no scalar `name`, but its rep is fixed.
    if (t.type === "IntegerLiteral") return `v:${binaryen.i32}:n`;
    if (t.type === "RealLiteral") return `v:${binaryen.f64}:n`;
    // A struct keys on its field-name-aware shape (see SOUNDNESS note); other
    // reference types (string, list, map, closure) have no field-name shape, so
    // `structSig` falls back to their interned wasm ref type — which IS a sound
    // discriminant for them (distinct wasm reps ⇒ distinct keys).
    return `r:${structSig(t)}`;
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
  const valueBoxStructs = new Map<
    number,
    { heapType: number; refType: number }
  >();
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
    // `T | null` for a single *reference* T → a niche nullable ref (`ref null $t`)
    // rather than a box; `toWasmType`'s Nullable branch handles it. (A scalar `T`
    // like `i32 | null` has no spare null, so it still boxes.)
    if (
      nonNull.length === 1 && hasNull && valueTypeName(nonNull[0]) === null
    ) return null;
    const variants = nonNull.sort((a, b) => {
      const ka = variantKey(a);
      const kb = variantKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const nullTag = hasNull ? tagOf("null") : -1;
    // "value" kind when every member is a scalar of one shared rep; else "boxed".
    const names = variants.map(valueTypeName);
    const reps = names.map((n, i) =>
      n !== null ? repWasm(n) : toWasmType(variants[i])
    );
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
    return m.struct.get(
      0,
      m.ref.cast(payload, box.refType),
      repWasm(vn),
      false,
    );
  };
  // The type of a field shared by every member of a struct union/nullable, or
  // null if some member lacks it (or isn't a struct) — the codegen-side mirror of
  // typecheck's `sharedUnionField`, used to type a `(A | B).tag` access.
  const unionFieldType = (
    union: VLType,
    property: string,
  ): VLType | null => {
    const members = union.type === "Union"
      ? union.subTypes
      : union.type === "Nullable"
      ? [union.subType]
      : [union];
    const fieldTypes: VLType[] = [];
    for (const member of members) {
      let m2 = softenImplicitType(member);
      while (m2.type === "Infer") m2 = softenImplicitType(m2.subType);
      if (m2.type !== "Object") return null;
      const field = m2.properties.find((p) =>
        p.name.type === "StringLiteral" && p.name.value === property
      );
      if (!field) return null;
      fieldTypes.push(field.type);
    }
    if (fieldTypes.length === 0) return null;
    // Dedupe structurally-equal field types (the common case — every member's
    // shared field has the SAME type, e.g. `tag: i32`) so we return that single
    // type rather than a `T | T` union; otherwise a real `Union` of the variants.
    const unique: VLType[] = [];
    for (const ft of fieldTypes) {
      if (!unique.some((u) => structSig(u) === structSig(ft))) unique.push(ft);
    }
    return unique.length === 1
      ? unique[0]
      : { type: "Union", subTypes: unique };
  };
  // Read a field shared by every member of a struct union directly off the
  // union value, without narrowing — `(A | B).tag`. Returns null when `node`
  // isn't such an access (a non-union object, or a field not on every member),
  // leaving the normal single-struct path to handle it.
  //
  // SOUNDNESS: every union member is a distinct struct that may store the shared
  // field at a DIFFERENT index (`{a, z}` vs `{z}`), so we dispatch on the box's
  // tag, recover that member's payload (`ref.cast` to its struct via
  // `unboxPayload`), and read the field at that member's own index. The branches
  // are exhaustive over the union's variants — the type-checker proved the field
  // is present on all of them — so the final fall-through is unreachable.
  const sharedUnionFieldRead = (
    node: { object: VLExpression; property: string },
  ): number | null => {
    let objType = softenImplicitType(codegenType(node.object));
    while (objType.type === "Infer") objType = softenImplicitType(objType.subType);
    const info = unionInfo(objType);
    if (!info) return null;
    // Only all-struct members carry named fields; bail if any member is a scalar
    // or other reference (a string/list has no user field), or lacks the field.
    type Hit = { tag: number; member: VLObjectType; index: number; wasm: number };
    const hits: Hit[] = [];
    for (const member of info.variants) {
      let m2 = softenImplicitType(member);
      while (m2.type === "Infer") m2 = softenImplicitType(m2.subType);
      if (!isStructObject(m2)) return null;
      const struct = objectStruct(m2);
      const field = struct.fields.find((f) => f.name === node.property);
      if (!field) return null;
      hits.push({
        tag: variantTag(info, member),
        member: m2,
        index: field.index,
        wasm: toWasmType(field.type),
      });
    }
    if (hits.length === 0) return null;
    // SOUNDNESS: every member must store the shared field with the SAME wasm rep,
    // or a single `struct.get` rep would misread one variant (an i32 read off a
    // ref field). If reps differ, bail — the access then requires an `is`/`==`
    // narrowing (the type-checker's `sharedUnionField` mirrors this).
    const fieldWasm = hits[0].wasm;
    if (hits.some((h) => h.wasm !== fieldWasm)) return null;
    // Evaluate the union value once into a local: we read its tag, then its
    // payload, in the dispatch chain below.
    const unionWasm = info.refType;
    const idx = _locals.push(unionWasm) - 1 + (_locals.params ?? 0);
    const tagOfBox = m.struct.get(
      0,
      m.local.get(idx, unionWasm),
      binaryen.i32,
      false,
    );
    const payloadOf = () =>
      m.struct.get(1, m.local.get(idx, unionWasm), info.payloadWasm, false);
    // Fold the members into a tag-dispatched read. The LAST member is the
    // unconditional fall-through (the chain is exhaustive — the type-checker
    // proved every variant carries the field), so it needs no tag guard; every
    // earlier member is selected by a `tag ==` test.
    const readMember = (h: Hit): number =>
      m.struct.get(
        h.index,
        m.ref.cast(payloadOf(), objectStruct(h.member).refType),
        h.wasm,
        false,
      );
    let chain: number = readMember(hits[hits.length - 1]);
    for (let i = hits.length - 2; i >= 0; i--) {
      chain = m.if(
        m.i32.eq(tagOfBox, m.i32.const(hits[i].tag)),
        readMember(hits[i]),
        chain,
      );
    }
    return m.block(
      null,
      [m.local.set(idx, toExpression(node.object)), chain],
      binaryen.auto,
    );
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
  // Box a raw `value` of VL type `fromType` into the union/nullable `toType`'s
  // representation, or pass it through when no boxing is needed (a niche nullable,
  // a value already the box, or an already-union source). The typed core shared
  // by the `coerceUnion` node hook and the `?.`/`??` lowering.
  const coerceToUnion = (
    value: number,
    fromType: VLType,
    toType: VLType,
  ): number => {
    const info = unionInfo(toType);
    if (!info) return value;
    const wt = binaryen.getExpressionType(value);
    if (
      wt === binaryen.unreachable || wt === binaryen.none || wt === info.refType
    ) return value;
    let nt = softenImplicitType(fromType);
    while (nt.type === "Infer") nt = softenImplicitType(nt.subType);
    if (nt.type === "Union" || nt.type === "Nullable") return value;
    const tag = variantTag(info, nt);
    if (tag < 0) return value;
    // Box against the union's own member type, not the source expression's (a
    // literal `5` has type `IntegerLiteral`, which `boxPayload` can't classify).
    return boxUnion(info, tag, findVariant(info, nt) ?? null, value);
  };
  // Build a `null` value in the representation of nullable `nullableType`
  // (`T | null`): a boxed-union null tag, or a `ref.null` for a niche nullable
  // reference (so `T[].get`/`pop` can yield absence in the union return rep).
  const nullableNull = (nullableType: VLType): number => {
    const info = unionInfo(nullableType);
    if (info) return boxUnion(info, info.nullTag, null, null);
    // A sentinel-encoded scalar nullable (`boolean | null`) is an i32 whose
    // `null` is the out-of-range sentinel — not a ref. Mirror the NullLiteral
    // lowering before falling through to the niche-`ref.null` path.
    const sentinel = nullSentinel(nonNullable(nullableType));
    if (sentinel !== null) return m.i32.const(sentinel);
    // `ref.null` takes a nullable ref *type* (not a bare heap type).
    return m.ref.null(
      binaryen.getTypeFromHeapType(refHeapType(nonNullable(nullableType)), true),
    );
  };
  // Build a *present* value of nullable `nullableType` from a non-null `value`
  // of element type `element`: box it into the union (scalar element), or pass
  // the reference through (niche nullable ref).
  const nullableSome = (
    nullableType: VLType,
    element: VLType,
    value: number,
  ): number => coerceToUnion(value, element, nullableType);

  const coerceUnion = (
    value: number,
    node: VLProgramNode | VLStatement,
  ): number => {
    if (!hasDesiredType() || node.type === "NullLiteral") return value;
    const info = unionInfo(desiredType!);
    if (!info) return value;
    // Skip before resolving the node's type — `codegenType` is only valid
    // (memoized) on expressions, but statements (`return …`, whose value is
    // `unreachable`) and already-boxed values reach here too and need no boxing.
    const wt = binaryen.getExpressionType(value);
    if (
      wt === binaryen.unreachable || wt === binaryen.none || wt === info.refType
    ) return value;
    return coerceToUnion(value, codegenType(node), desiredType!);
  };
  // Lower an expression, then box it into the desired union if one is wanted.
  const toExpression = (node: VLProgramNode | VLStatement): number =>
    coerceUnion(toExpressionRaw(node), node);

  // Context handed to the extracted string-method codegen (compiler/builtins).
  const stringBuiltinCtx: StringBuiltinContext = {
    m,
    binaryen,
    i32Type,
    arrayType,
    helpers: _helpers,
    codegenType,
    withDesiredType,
    toExpression,
  };

  // Context handed to the extracted map-method codegen (compiler/builtins).
  const mapBuiltinCtx: MapBuiltinContext = {
    m,
    binaryen,
    mapTypeOf,
    toWasmType,
    helpers: _helpers,
    toExpression,
    withDesiredType,
    nullableNull,
    nullableSome,
    stringEqFn,
    tagOf: mapHelperTag,
  };

  // Context handed to the extracted list-method codegen (compiler/builtins).
  const listBuiltinCtx: ListBuiltinContext = {
    m,
    binaryen,
    i32Type,
    listTypeOf,
    toWasmType,
    helpers: _helpers,
    toExpression,
    withDesiredType,
    listBacking,
    arrayReadCast,
    listLen,
    listCap,
    nullableNull,
    nullableSome,
    tagOf: listHelperTag,
  };

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

  // Read through a typed `globalThis` (not the bare `Deno` global) so the core
  // stays runtime-agnostic *and* type-checks under both the Deno and Node libs —
  // it's bundled into the Node-based LSP server, where `Deno` is undefined.
  const deno = (globalThis as {
    Deno?: { env: { get(key: string): string | undefined } };
  }).Deno;
  const debug = deno?.env.get("VL_DEBUG");
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
