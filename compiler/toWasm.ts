import Binaryen from "binaryen";
import {
  arrayElementType,
  setNodeType,
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

  const loopLabels: string[] = [];

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

  // The VL type of an expression *in the current instance's scope*. A generic
  // function is monomorphized per call, so a parameter's concrete shape lives in
  // the codegen scope, not the AST-inferred (declaration-time) type: resolve a
  // Name from scope and a PropertyAccess through its object's shape, falling back
  // to the AST type for literals/calls. (Name reads already use scope elsewhere;
  // this keeps object-shape resolution consistent with them.)
  const codegenType = (node: VLProgramNode | VLStatement): VLType => {
    if (node.type === "Name") {
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
      resultType = binaryen.getExpressionType(body);
    }
    instanceResult[instanceName] = resultType;
    m.addFunction(instanceName, params, resultType, locals, body);
    returnType = oldReturnType;
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
    return statements
      .map((stmt, i) =>
        stmt.type === "FunctionDeclaration"
          ? handleFunctionDecl(stmt)
          : i === tail
          ? toExpression(stmt)
          : withDesiredType(undefined, () => toExpression(stmt))
      )
      .filter((v): v is number => typeof v === "number");
  };

  const toExpression = (node: VLProgramNode | VLStatement): number => {
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
          : "i32";
        if (
          type !== "i32" && type !== "i64" && type !== "f32" && type !== "f64"
        ) throw new Error("Expected numeric type");
        // binaryen >=120: i64.const takes a single bigint (was low/high i32 pair).
        if (type === "i64") return m.i64.const(BigInt(node.text));
        return m[type].const(node.value);
      }
      case "BooleanLiteral":
        return m.i32.const(node.value ? 1 : 0);
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
        // Resolve from the instance scope (not the once-inferred AST type), so a
        // monomorphized generic's operand — e.g. `self.x` where `self` is bound to
        // a concrete shape this instance — is seen as its concrete numeric type.
        const leftType = softenImplicitType(codegenType(node.left));
        let rightType: VLType;
        {
          if (leftType.type !== "Object") rightType = leftType;
          else {
            const opFunc = leftType.properties.find((p) =>
              validateType(p.name, { type: "StringLiteral", value: op })
            )?.type;
            rightType = opFunc?.type === "Function"
              ? opFunc.paramaters[0].paramaterType ?? raise("op missing param")
              : raise("op not function");
          }
        }

        if (
          leftType.type === "Object" &&
          (leftType.name === "i32" || leftType.name === "boolean" ||
            leftType.name === "f64")
        ) {
          if (leftType.type !== "Object") throw new Error("Expected object");
          const name = leftType.name;
          if (name === "i32" || name === "boolean") {
            return m.i32[
              op === "+"
                ? "add"
                : op === "-"
                ? "sub"
                : op === "/"
                ? "div_s"
                : op === ">"
                ? "gt_s"
                : op === "<"
                ? "lt_s"
                : op === "%"
                ? "rem_s"
                : op === "*"
                ? "mul"
                : op === "=="
                ? "eq"
                : op === "!="
                ? "ne"
                : op === ">="
                ? "ge_s"
                : op === "<="
                ? "le_s"
                : op === "&&"
                ? "and"
                : raise(`binop ${op} not handled on i32`)
            ](
              withDesiredType(leftType, () => toExpression(node.left)),
              withDesiredType(rightType, () => toExpression(node.right)),
            );
          }
          if (name === "f64") {
            return m.f64[
              op === "+"
                ? "add"
                : op === "-"
                ? "sub"
                : op === "*"
                ? "mul"
                : op === "=="
                ? "eq"
                : op === "!="
                ? "ne"
                : raise(`binop ${op} not handled on f64`)
            ](
              withDesiredType(leftType, () => toExpression(node.left)),
              withDesiredType(rightType, () => toExpression(node.right)),
            );
          }
          throw new Error(`Didn't handle ${op} on ${name}`);
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
      case "If":
        return m.if(
          withDesiredType(
            { type: "Alias", name: "boolean" },
            () => toExpression(node.conditionals[0].condition),
          ),
          toExpression(node.conditionals[0].statement),
          node.conditionals.length > 1
            ? toExpression({
              ...node,
              conditionals: node.conditionals.slice(1),
            })
            : node.else
            ? toExpression(node.else)
            : undefined,
        );
      case "Return":
        // TODO: need returnType in global scope
        return withDesiredType(
          returnType,
          () => m.return(node.value ? toExpression(node.value) : undefined),
        );
      case "While": {
        // (block $brk (loop $cont (br_if $brk (eqz cond)) body (br $cont)))
        // $cont is the continue target (re-checks the condition each pass).
        const cont = node.label ?? `loop${loopIndex++}`;
        const brk = `${cont}__brk`;
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
        if (!node.label) loopIndex--;
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
        const brk = `${cont}__brk`;
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
        if (!node.label) loopIndex--;
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
        const brk = `${cont}__brk`;
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
        if (!node.label) loopIndex--;
        loopLabels.pop();
        return loop;
      }
      case "Continue":
        return m.br(node.label ?? loopLabels[loopLabels.length - 1]);
      default:
        throw new Error(`Unhandled AST -> WASM "${node.type}" expression`);
    }
  };

  // VLType -> binaryen wasm type, bound to this module's binaryen instance.
  const toWasmType = (node: VLType): number => {
    let t = softenImplicitType(node);
    // Unwrap inference holes resolved during monomorphization (`Infer<i32>` ->
    // i32); softening keeps the wrapper, but codegen wants the concrete type.
    while (t.type === "Infer") t = softenImplicitType(t.subType);
    if (t.type === "Object" && t.name === undefined) {
      // An `i32`-index-sig object is a WasmGC array; any other structural object
      // (no builtin `name`) is a WasmGC struct.
      const element = arrayElementType(t);
      if (element) return arrayType(element).refType;
      return objectStruct(t).refType;
    }
    // A function value is a fat-pointer closure struct.
    if (t.type === "Function") return closureStruct().refType;
    return toWasmTypeOf(binaryen, t);
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

  console.log("result");
  console.log(m.emitText());
  // if (!m.validate()) throw new Error("validation error");
  m.optimize();
  console.log("optimized");
  console.log(m.emitText());
  if (!m.validate()) throw new Error("validation error");
  return m.emitBinary();
};

