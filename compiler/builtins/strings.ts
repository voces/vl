// First module in a planned `compiler/builtins/` set; the broader built-ins
// extraction out of toWasm.ts is a tracked follow-up. For now this holds only
// the intrinsic string-method codegen (`slice`/`indexOf`/`includes`/
// `charCodeAt`). Pure: no top-level side effects, no runtime globals.
import { softenImplicitType, VLCallNode, VLExpression, VLType } from "../toAST.ts";

/** A WasmGC array type, as interned by toWasm's `arrayType`. */
type ArrayType = { heapType: number; refType: number; element: VLType };

/**
 * Everything the string-method codegen needs from the enclosing `toWasm`
 * closure, passed explicitly rather than reached for as module globals.
 */
export type StringBuiltinContext = {
  /** The binaryen module under construction. */
  // deno-lint-ignore no-explicit-any
  m: any;
  /**
   * The resolved binaryen namespace (for `.i32`, `.createType`, etc.). Resolved
   * inside `toWasm` because the bundled build patches binaryen to be async.
   */
  // deno-lint-ignore no-explicit-any
  binaryen: any;
  /** Reusable i32 desired-type, e.g. for array indices. */
  i32Type: VLType;
  /** Intern a WasmGC array type by element type (strings are i32-arrays). */
  arrayType: (element: VLType) => ArrayType;
  /** Shared set of lazily-emitted helper function names (added once each). */
  helpers: Set<string>;
  /** Resolve the VL type of an expression node. */
  codegenType: (node: VLExpression) => VLType;
  /** Run `fn` with `type` as the desired type (controls arg coercion). */
  withDesiredType: <T>(type: VLType | undefined, fn: () => T) => T;
  /** Lower an expression node to a binaryen expression ref. */
  toExpression: (node: VLExpression) => number;
};

// `__string_slice__(str, start, end)`: a fresh i32-array holding the half-open
// range `[start, end)` of `str`. JS `String.prototype.slice` semantics: a
// negative index counts from the end (`len + i`), then both bounds clamp to
// `[0, len]`; if `start >= end` the result is empty. Locals: 3 = len,
// 4 = clamped start, 5 = clamped end, 6 = out length, 7 = out array.
const stringSliceFn = (ctx: StringBuiltinContext): string => {
  const { m, binaryen, i32Type, arrayType, helpers } = ctx;
  const name = "__string_slice__";
  if (!helpers.has(name)) {
    helpers.add(name);
    const at = arrayType(i32Type);
    const str = () => m.local.get(0, at.refType);
    const start = () => m.local.get(1, binaryen.i32);
    const end = () => m.local.get(2, binaryen.i32);
    const len = () => m.local.get(3, binaryen.i32);
    const s = () => m.local.get(4, binaryen.i32);
    const e = () => m.local.get(5, binaryen.i32);
    const n = () => m.local.get(6, binaryen.i32);
    const out = () => m.local.get(7, at.refType);
    // clamp(idx) → negative counts from end, then bound to [0, len]. `idx` is a
    // thunk: each binaryen sub-expression must be a fresh node (no shared refs).
    const clamp = (idx: () => number) =>
      m.select(
        m.i32.lt_s(idx(), m.i32.const(0)),
        // negative: max(len + idx, 0)
        m.select(
          m.i32.lt_s(m.i32.add(len(), idx()), m.i32.const(0)),
          m.i32.const(0),
          m.i32.add(len(), idx()),
          binaryen.i32,
        ),
        // non-negative: min(idx, len)
        m.select(
          m.i32.gt_s(idx(), len()),
          len(),
          idx(),
          binaryen.i32,
        ),
        binaryen.i32,
      );
    const body = m.block(null, [
      m.local.set(3, m.array.len(str())),
      m.local.set(4, clamp(start)),
      m.local.set(5, clamp(end)),
      // out length = max(end - start, 0)
      m.local.set(
        6,
        m.select(
          m.i32.gt_s(e(), s()),
          m.i32.sub(e(), s()),
          m.i32.const(0),
          binaryen.i32,
        ),
      ),
      m.local.set(7, m.array.new(at.heapType, n(), m.i32.const(0))),
      m.array.copy(out(), m.i32.const(0), str(), s(), n()),
      out(),
    ], at.refType);
    m.addFunction(
      name,
      binaryen.createType([at.refType, binaryen.i32, binaryen.i32]),
      at.refType,
      [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32, at.refType],
      body,
    );
  }
  return name;
};

// `__string_index_of__(str, sub)`: the first index at which `sub` occurs in
// `str`, or -1. An empty `sub` returns 0 (JS convention). A naive O(n*m) scan
// over char codes — strings here are small. Locals: 2 = sLen, 3 = subLen,
// 4 = i (outer), 5 = j (inner), 6 = last start index (sLen - subLen).
const stringIndexOfFn = (ctx: StringBuiltinContext): string => {
  const { m, binaryen, i32Type, arrayType, helpers } = ctx;
  const name = "__string_index_of__";
  if (!helpers.has(name)) {
    helpers.add(name);
    const at = arrayType(i32Type);
    const str = () => m.local.get(0, at.refType);
    const sub = () => m.local.get(1, at.refType);
    const sLen = () => m.local.get(2, binaryen.i32);
    const subLen = () => m.local.get(3, binaryen.i32);
    const i = () => m.local.get(4, binaryen.i32);
    const j = () => m.local.get(5, binaryen.i32);
    const last = () => m.local.get(6, binaryen.i32);
    const body = m.block(null, [
      m.local.set(2, m.array.len(str())),
      m.local.set(3, m.array.len(sub())),
      m.local.set(6, m.i32.sub(sLen(), subLen())),
      m.local.set(4, m.i32.const(0)),
      m.block("io_brk", [
        m.loop(
          "io_loop",
          m.block(null, [
            // Past the last possible start (i > sLen - subLen): no match.
            m.br("io_brk", m.i32.gt_s(i(), last())),
            m.local.set(5, m.i32.const(0)),
            m.block("match_brk", [
              m.loop(
                "match_loop",
                m.block(null, [
                  // Inner scan complete → full match at i.
                  m.if(
                    m.i32.ge_s(j(), subLen()),
                    m.return(i()),
                  ),
                  m.br(
                    "match_brk",
                    m.i32.ne(
                      m.array.get(str(), m.i32.add(i(), j()), binaryen.i32, false),
                      m.array.get(sub(), j(), binaryen.i32, false),
                    ),
                  ),
                  m.local.set(5, m.i32.add(j(), m.i32.const(1))),
                  m.br("match_loop"),
                ]),
              ),
            ]),
            m.local.set(4, m.i32.add(i(), m.i32.const(1))),
            m.br("io_loop"),
          ]),
        ),
      ]),
      m.i32.const(-1),
    ], binaryen.i32);
    m.addFunction(
      name,
      binaryen.createType([at.refType, at.refType]),
      binaryen.i32,
      [binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32, binaryen.i32],
      body,
    );
  }
  return name;
};

/**
 * Lower an intrinsic string method call (`s.slice`/`s.indexOf`/`s.includes`/
 * `s.charCodeAt`): the receiver is a real `string` object but its method
 * properties have no closure to dispatch through — lower them directly to their
 * wasm helper (or an inline `array.get`). The receiver and args are plain
 * i32-arrays / i32s.
 *
 * Returns the binaryen expression ref, or `null` when `node` is not such a call
 * (so the caller falls through to its normal `Call` dispatch).
 */
export const lowerStringMethodCall = (
  ctx: StringBuiltinContext,
  node: VLCallNode,
): number | null => {
  const { m, binaryen, i32Type, arrayType, codegenType, withDesiredType, toExpression } = ctx;
  if (node.callee.type !== "PropertyAccess") return null;
  const recv = node.callee.object;
  let rt = softenImplicitType(codegenType(recv));
  while (rt.type === "Infer") rt = softenImplicitType(rt.subType);
  if (rt.type !== "Object" || rt.name !== "string") return null;
  const at = arrayType(i32Type);
  const prop = node.callee.property;
  const argExpr = (k: number) =>
    withDesiredType(
      k === 0 && (prop === "indexOf" || prop === "includes") ? rt : i32Type,
      () => toExpression(node.arguments[k].value),
    );
  if (prop === "slice") {
    return m.call(
      stringSliceFn(ctx),
      [toExpression(recv), argExpr(0), argExpr(1)],
      at.refType,
    );
  }
  if (prop === "indexOf") {
    return m.call(
      stringIndexOfFn(ctx),
      [toExpression(recv), argExpr(0)],
      binaryen.i32,
    );
  }
  if (prop === "includes") {
    // `includes` ≡ `indexOf(sub) != -1`.
    return m.i32.ne(
      m.call(
        stringIndexOfFn(ctx),
        [toExpression(recv), argExpr(0)],
        binaryen.i32,
      ),
      m.i32.const(-1),
    );
  }
  if (prop === "charCodeAt") {
    // `array.get` — bounds are the caller's responsibility, matching `s[i]` (no
    // JS NaN result; an out-of-range index traps).
    return m.array.get(
      toExpression(recv),
      argExpr(0),
      binaryen.i32,
      false,
    );
  }
  return null;
};
