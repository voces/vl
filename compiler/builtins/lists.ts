// Compiler-emitted, lazily-instantiated per-element-wasm-type helpers for the
// growable `T[]` list representation (collections-design §VL.1/§VL.4/§VL.6).
// Mirrors `compiler/builtins/strings.ts`: there is no module system yet, so the
// list machinery is emitted by the compiler — one shared helper set per distinct
// wasm element type, added once on first use (the `__string_eq__` pattern) — and
// dispatched by name from `toWasm`. Pure: no top-level side effects, no globals.
//
// The list struct is `{ backing: (ref (array mut T)); len: i32; cap: i32 }`;
// helpers take the list ref first and reach its fields through the struct-field
// accessors / array intrinsics supplied on the context. Growth is 2×, floor 4
// (collections-design §VL.2); `pop`/`get` return `T | null` (normal absence,
// §VL.6) built through the context's nullable encoders.
import { VLCallNode, VLExpression, VLType } from "../toAST.ts";

/** A WasmGC array type, as interned by toWasm's `arrayType`. */
type ArrayType = {
  heapType: number;
  refType: number;
  element: VLType;
  /** The logical element wasm type (what a read yields to the surface). */
  elemWasm: number;
  /** The wasm type of the array's slots — nullable-widened for non-null refs. */
  backingWasm: number;
};
/** The list struct type, as interned by toWasm's `listType`. */
type ListType = {
  heapType: number;
  refType: number;
  element: VLType;
  backing: ArrayType;
};

/**
 * Everything the list-method codegen needs from the enclosing `toWasm` closure,
 * passed explicitly rather than reached for as module globals.
 */
export type ListBuiltinContext = {
  /** The binaryen module under construction. */
  // deno-lint-ignore no-explicit-any
  m: any;
  /** The resolved binaryen namespace (`.i32`, `.createType`, …). */
  // deno-lint-ignore no-explicit-any
  binaryen: any;
  /** Reusable i32 desired-type (for index args). */
  i32Type: VLType;
  /** Resolve a node's list struct type + (softened) element type, or null. */
  listTypeOf: (
    node: VLExpression,
  ) => { lt: ListType; element: VLType } | null;
  /** Lower a node's VL→wasm type (the element wasm type). */
  toWasmType: (type: VLType) => number;
  /** The shared lazily-emitted helper-name set (added once each). */
  helpers: Set<string>;
  /** Lower an expression node to a binaryen expression ref. */
  toExpression: (node: VLExpression) => number;
  /** Run `fn` with `type` as the desired type (controls arg coercion). */
  withDesiredType: <T>(type: VLType | undefined, fn: () => T) => T;
  /** Field read: `struct.get $backing`. */
  listBacking: (lt: ListType, ref: number) => number;
  /** Narrow a backing-slot read back to its logical element type (no-op for
   * defaultable elements; `ref.as_non_null` for nullable-widened ref backings). */
  arrayReadCast: (at: ArrayType, value: number) => number;
  /** Field read: `struct.get $len`. */
  listLen: (ref: number) => number;
  /** Field read: `struct.get $cap`. */
  listCap: (ref: number) => number;
  /** Build a `null` value in the representation of nullable `T | null`. */
  nullableNull: (nullableType: VLType) => number;
  /** Build a present `T | null` value from a non-null element value. */
  nullableSome: (
    nullableType: VLType,
    element: VLType,
    value: number,
  ) => number;
  /** A stable per-module suffix for a list type's helper names. */
  tagOf: (lt: ListType) => number;
};

// Struct field indices (must match toWasm's `listType` field order).
const LIST_BACKING = 0;
const LIST_LEN = 1;
const LIST_CAP = 2;

// `__list_grow_T__(list)`: ensure spare capacity for one more element. If
// `len == cap`, allocate a backing of `cap == 0 ? 4 : cap * 2` (2× growth, floor
// 4 — §VL.2), `array.copy` the live `len` elements in, and swap `backing`/`cap`.
// Locals: 1 = newCap, 2 = newBacking.
const listGrowFn = (ctx: ListBuiltinContext, lt: ListType): string => {
  const { m, binaryen, helpers, listBacking, listLen, listCap } = ctx;
  const name = `__list_grow_${ctx.tagOf(lt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const list = () => m.local.get(0, lt.refType);
  const newCap = () => m.local.get(1, binaryen.i32);
  const newBacking = () => m.local.get(2, lt.backing.refType);
  const body = m.block(null, [
    m.if(
      m.i32.eq(listLen(list()), listCap(list())),
      m.block(null, [
        m.local.set(
          1,
          m.select(
            m.i32.eq(listCap(list()), m.i32.const(0)),
            m.i32.const(4),
            m.i32.mul(listCap(list()), m.i32.const(2)),
            binaryen.i32,
          ),
        ),
        // `array.new_default` zero/null-initializes the spare `[len, newCap)`
        // slots (WasmGC requires every slot well-typed); a list never reads them
        // before writing.
        m.local.set(2, m.array.new_default(lt.backing.heapType, newCap())),
        m.array.copy(
          newBacking(),
          m.i32.const(0),
          listBacking(lt, list()),
          m.i32.const(0),
          listLen(list()),
        ),
        m.struct.set(LIST_BACKING, list(), newBacking()),
        m.struct.set(LIST_CAP, list(), newCap()),
      ]),
    ),
  ], binaryen.none);
  m.addFunction(
    name,
    binaryen.createType([lt.refType]),
    binaryen.none,
    [binaryen.i32, lt.backing.refType],
    body,
  );
  return name;
};

// `__list_push_T__(list, x)`: amortized-O(1) append — grow if full, write `x` at
// `backing[len]`, bump `len`. Returns null (the surface `push(x): null`).
const listPushFn = (ctx: ListBuiltinContext, lt: ListType): string => {
  const { m, binaryen, helpers, listBacking, listLen } = ctx;
  const name = `__list_push_${ctx.tagOf(lt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const elemWasm = ctx.toWasmType(lt.element);
  const list = () => m.local.get(0, lt.refType);
  const x = () => m.local.get(1, elemWasm);
  const grow = listGrowFn(ctx, lt);
  const body = m.block(null, [
    m.call(grow, [list()], binaryen.none),
    m.array.set(listBacking(lt, list()), listLen(list()), x()),
    m.struct.set(LIST_LEN, list(), m.i32.add(listLen(list()), m.i32.const(1))),
  ], binaryen.none);
  m.addFunction(
    name,
    binaryen.createType([lt.refType, elemWasm]),
    binaryen.none,
    [],
    body,
  );
  return name;
};

// `__list_pop_T__(list): T | null` — remove+return the last element, or `null`
// on empty (normal absence, §VL.6). On non-empty: `len--`, read `backing[len]`.
// `cap` is retained (grow-only). The result is the union/nullable encoding.
const listPopFn = (ctx: ListBuiltinContext, lt: ListType): string => {
  const { m, binaryen, helpers, listBacking, listLen, nullableNull, nullableSome, arrayReadCast } = ctx;
  const name = `__list_pop_${ctx.tagOf(lt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const nullableType: VLType = { type: "Nullable", subType: lt.element };
  const retWasm = ctx.toWasmType(nullableType);
  const list = () => m.local.get(0, lt.refType);
  const body = m.if(
    m.i32.eq(listLen(list()), m.i32.const(0)),
    nullableNull(nullableType),
    m.block(null, [
      m.struct.set(LIST_LEN, list(), m.i32.sub(listLen(list()), m.i32.const(1))),
      nullableSome(
        nullableType,
        lt.element,
        arrayReadCast(
          lt.backing,
          m.array.get(listBacking(lt, list()), listLen(list()), lt.backing.backingWasm, false),
        ),
      ),
    ], retWasm),
  );
  m.addFunction(
    name,
    binaryen.createType([lt.refType]),
    retWasm,
    [],
    body,
  );
  return name;
};

// `__list_clear_T__(list)`: reset to empty *retaining capacity* (`len = 0`, no
// reallocation — §VL.4). Returns null (`clear(): null`).
const listClearFn = (ctx: ListBuiltinContext, lt: ListType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__list_clear_${ctx.tagOf(lt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const list = () => m.local.get(0, lt.refType);
  m.addFunction(
    name,
    binaryen.createType([lt.refType]),
    binaryen.none,
    [],
    m.struct.set(LIST_LEN, list(), m.i32.const(0)),
  );
  return name;
};

// `__list_get_T__(list, i): T | null` — the safe, checked accessor (§VL.6): `i`
// in `[0, len)` returns the element (boxed into the nullable rep), else `null`.
// The unsigned compare folds the `i < 0` check in (`len >= 0`).
const listGetFn = (ctx: ListBuiltinContext, lt: ListType): string => {
  const { m, binaryen, helpers, listBacking, listLen, nullableNull, nullableSome, arrayReadCast } = ctx;
  const name = `__list_get_${ctx.tagOf(lt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const nullableType: VLType = { type: "Nullable", subType: lt.element };
  const retWasm = ctx.toWasmType(nullableType);
  const list = () => m.local.get(0, lt.refType);
  const i = () => m.local.get(1, binaryen.i32);
  const body = m.if(
    m.i32.lt_u(i(), listLen(list())),
    nullableSome(
      nullableType,
      lt.element,
      arrayReadCast(
        lt.backing,
        m.array.get(listBacking(lt, list()), i(), lt.backing.backingWasm, false),
      ),
    ),
    nullableNull(nullableType),
    retWasm,
  );
  m.addFunction(
    name,
    binaryen.createType([lt.refType, binaryen.i32]),
    retWasm,
    [],
    body,
  );
  return name;
};

/**
 * Lower an intrinsic list-method call (`l.get`/`l.push`/`l.pop`/`l.clear`): the
 * receiver is a `T[]` whose anonymous structural type carries no closure to
 * dispatch through, so lower each to its per-element wasm helper. Returns the
 * binaryen expression ref, or `null` when `node` is not such a call (so the
 * caller falls through to its normal `Call` dispatch).
 */
export const lowerListMethodCall = (
  ctx: ListBuiltinContext,
  node: VLCallNode,
): number | null => {
  const { m, binaryen, i32Type, listTypeOf, toExpression, withDesiredType } = ctx;
  if (node.callee.type !== "PropertyAccess") return null;
  const recv = node.callee.object;
  const info = listTypeOf(recv);
  if (!info) return null;
  const lt = info.lt;
  const prop = node.callee.property;
  if (prop === "get") {
    return m.call(
      listGetFn(ctx, lt),
      [
        toExpression(recv),
        withDesiredType(i32Type, () => toExpression(node.arguments[0].value)),
      ],
      ctx.toWasmType({ type: "Nullable", subType: lt.element }),
    );
  }
  if (prop === "push") {
    return m.call(
      listPushFn(ctx, lt),
      [
        toExpression(recv),
        withDesiredType(lt.element, () => toExpression(node.arguments[0].value)),
      ],
      binaryen.none,
    );
  }
  if (prop === "pop") {
    return m.call(
      listPopFn(ctx, lt),
      [toExpression(recv)],
      ctx.toWasmType({ type: "Nullable", subType: lt.element }),
    );
  }
  if (prop === "clear") {
    return m.call(listClearFn(ctx, lt), [toExpression(recv)], binaryen.none);
  }
  return null;
};
