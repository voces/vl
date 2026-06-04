import Binaryen from "binaryen";
import {
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
  // Each resolved function name is emitted at most once (no real polymorphism
  // yet — monomorphization keys on the resolved name).
  const instantiated = new Set<string>();
  // The wasm result type of each emitted function, keyed by resolved name. For
  // functions with an inferred (unresolved) return type, this is read back from
  // the compiled body rather than the declaration.
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

  // Resolve an expression's structural object type (soften + unwrap an Infer).
  const objectTypeOf = (node: VLProgramNode | VLStatement): VLObjectType => {
    let t = softenImplicitType(vlType(node as Parameters<typeof vlType>[0]));
    if (t.type === "Infer") t = t.subType;
    if (t.type !== "Object") {
      throw new Error(`Expected an object type, got "${t.type}"`);
    }
    return t;
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
  const instantiate = (resolvedName: string, paramTypes: VLType[]) => {
    if (instantiated.has(resolvedName)) return;
    instantiated.add(resolvedName);

    const { declaration } = functions[resolvedName];
    const oldReturnType = returnType;
    returnType = declaration.returnType;

    // Compile the body once with the given environment. With `collector` set
    // (no env yet), captured reads record themselves and emit a placeholder;
    // with `env` set, captured reads become `struct.get` on the env parameter.
    // An env occupies local 0, shifting the declared parameters up by one.
    const compileBody = (
      env: (EnvShape & { paramIndex: number }) | null,
      collector: Map<string, VLType> | null,
    ) => {
      const offset = env ? 1 : 0;
      const locals: number[] & { params?: number } = [];
      locals.params = declaration.parameters.length + offset;
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
          ): [string, ScopeEntry] => [p.name, [paramTypes[i], i + offset]]),
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

    let env: EnvShape | null = null;
    if (collector.size) {
      const fields = [...collector.keys()];
      env = buildEnvStruct(fields, fields.map((f) => collector.get(f)!));
      closures[resolvedName] = env;
      // Pass 2: recompile with the env parameter; captured reads -> struct.get.
      ({ body, locals } = compileBody({ ...env, paramIndex: 0 }, null));
    }

    const params = binaryen.createType(
      (env ? [env.refType] : []).concat(paramTypes.map(toWasmType)),
    );
    // An inferred return type (`Unknown`/`Infer`) has no wasm mapping; read the
    // actual result type back off the compiled body instead.
    let resultType: number;
    try {
      resultType = toWasmType(declaration.returnType);
    } catch {
      resultType = binaryen.getExpressionType(body);
    }
    instanceResult[resolvedName] = resultType;
    m.addFunction(resolvedName, params, resultType, locals, body);
    returnType = oldReturnType;
  };

  // Reserve a table slot for a function used as a value, returning its index.
  const tableIndexOf = (resolvedName: string) => {
    const { declaration } = functions[resolvedName];
    instantiate(
      resolvedName,
      declaration.parameters.map((p) => p.paramaterType),
    );
    if (closures[resolvedName]) {
      // The table holds a bare funcref with no environment, so a closure used as
      // a value would be called without its captures. Escaping closures need a
      // fat pointer (funcref + env); not yet implemented (ROADMAP B4).
      throw new Error(
        `Escaping closures are not yet implemented: "${resolvedName}" ` +
          `captures variables and cannot be used as a value.`,
      );
    }
    const existing = functionTable.indexOf(resolvedName);
    return existing === -1
      ? functionTable.push(resolvedName) - 1
      : existing;
  };

  const getDirectFunction = (name: string, node: VLFunctionCallNode) => {
    // Don't need to instantiate built-ins
    if (ignoredKeys.has(name)) return name;

    const resolvedName = getResolvedFunctionName(name);
    // Compile the callee against the concrete argument types at this call site.
    instantiate(
      resolvedName,
      node.arguments.map((a) => softenImplicitType(vlType(a.value))),
    );
    return resolvedName;
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

    // Indirect: `node.function` is a local holding an i32 table index. Return
    // that index expression as the `call_indirect` target.
    return m.local.get(index, binaryen.i32);
  };

  let _locals: number[] & { params?: number };
  const withLocals = <T>(newLocals: number[], fn: () => T) => {
    const oldLocals = _locals;
    _locals = newLocals;
    const ret = fn();
    _locals = oldLocals;
    return ret;
  };

  const handleFunctionDecl = (node: VLFunctionDeclarationNode) => {
    if (!node.name) throw new Error("Anonymous functions not yet handled");
    let name = node.name;
    let i = 1;
    while (name in functions) name = `${node.name}_${i++}`;
    functionScopes[functionScopes.length - 1][node.name] = name;
    functions[name] = { declaration: node };
    // A declaration emits no wasm at its site and needs no local; it is
    // instantiated lazily on first use (direct call or value reference). The
    // scope entry's index is unused for declared functions (-1).
    currentScope[node.name] = [vlType(node), -1];
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
        // A closure call allocates the environment from the captured variables'
        // current values (read here in the caller's scope) and threads it as the
        // hidden leading argument.
        if (typeof func === "string" && closures[func]) {
          const env = closures[func];
          operands.unshift(
            m.struct.new(
              env.fields.map((f, i) =>
                withDesiredType(
                  env.types[i],
                  () => toExpression({ type: "Name", name: f }),
                )
              ),
              env.heapType,
            ),
          );
        }
        // Direct calls to functions with an inferred return type read their
        // result type from the emitted instance; otherwise map the declared type.
        const returnType = typeof func === "string" && func in instanceResult
          ? instanceResult[func]
          : toWasmType(functionType.return);

        const call = typeof func === "string"
          ? m.call(func, operands, returnType)
          : m.call_indirect(
            "table",
            func,
            operands,
            binaryen.createType(
              functionType.paramaters.map((p) => toWasmType(p.paramaterType)),
            ),
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
      case "Name": {
        const found = lookupName(node.name);
        if (found?.capture) {
          // A closed-over variable: read from the environment (or, during the
          // capture-collection pass, record it and emit a typed placeholder).
          if (currentEnv) {
            return m.struct.get(
              currentEnv.fields.indexOf(node.name),
              m.local.get(currentEnv.paramIndex, currentEnv.refType),
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
          // A function used as a value. If it names a declared function, its
          // value is its table index; otherwise it's a function-valued local
          // (e.g. a parameter) already holding an i32 table index.
          let resolved: string | null = null;
          try {
            resolved = getResolvedFunctionName(node.name);
          } catch {
            resolved = null;
          }
          return resolved
            ? m.i32.const(tableIndexOf(resolved))
            : m.local.get(entry[1], binaryen.i32);
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
      case "PropertyAccess": {
        const struct = objectStruct(objectTypeOf(node.object));
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
      case "BinaryOperation": {
        const op = node.operator;
        // Assignment is handled before the operator-method machinery below: the
        // LHS (a Name or `obj.field`) is not a value to evaluate, and an object
        // type carries no `=` method to look up.
        if (op === "=") {
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
        const leftType = vlType(node.left);
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
        throw new Error(
          `Have only handled i32 with ${op}, got ${leftType.type}${
            leftType.type === "Object"
              ? leftType.name ? ` (${leftType.name})` : ""
              : ""
          }`,
        );
      }
      case "Block":
        return m.block(
          null,
          withScope({}, () => lowerStatements(node.statements)),
          desiredType ? toWasmType(desiredType) : undefined,
        );
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
        //   i = from                         ; declared once, before the loop
        //   (loop $loop
        //     (br_if $brk (i > to))           ; inclusive: exit once past `to`
        //     (block $cont body)              ; continue → falls through to step
        //     i = i + step
        //     (br $loop)))
        const cont = node.label ?? `loop${loopIndex++}`;
        const loopLabel = `${cont}__loop`;
        const brk = `${cont}__brk`;
        loopLabels.push(cont);
        const variableType = softenImplicitType(vlType(node.from));
        const varRef = setNodeType(
          { type: "Name", name: node.variable },
          variableType,
        );
        const step: VLStatement = node.step ??
          { type: "IntegerLiteral", value: 1, text: "1" };
        const loop = m.block(brk, [
          toExpression({
            type: "VariableDeclaration",
            name: node.variable,
            variableType,
            value: node.from,
            mutable: true,
          }),
          m.loop(
            loopLabel,
            m.block(null, [
              m.br(
                brk,
                toExpression({
                  type: "BinaryOperation",
                  left: varRef,
                  operator: ">",
                  right: node.to,
                }),
              ),
              m.block(cont, [toExpression(node.statement)]),
              toExpression({
                type: "BinaryOperation",
                left: varRef,
                operator: "=",
                right: {
                  type: "BinaryOperation",
                  left: varRef,
                  operator: "+",
                  right: step,
                },
              }),
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
    const t = softenImplicitType(node);
    // A structural object (no builtin `name` like i32/f64) is a WasmGC struct.
    if (t.type === "Object" && t.name === undefined) return objectStruct(t).refType;
    return toWasmTypeOf(binaryen, node);
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

