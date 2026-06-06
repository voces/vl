// Compiler-emitted, lazily-instantiated per-(key,value)-wasm-type helpers for the
// `Map<K,V>` and `Set<T>` hash collections (collections-design §"Maps are a
// separate hash type"; ROADMAP B6a). Mirrors `compiler/builtins/lists.ts`: there
// is no module system yet, so the machinery is emitted by the compiler — one
// shared helper set per distinct (key,value) wasm type pair, added once on first
// use (the `__string_eq__` / list-helper pattern) — and dispatched by name from
// `toWasm`. Pure: no top-level side effects, no globals.
//
// REPRESENTATION — an ordered (Python-dict-shaped) open-addressing hash map:
//   Map<K,V> ≅ struct {
//     keys:  (ref (array mut K))    ; insertion-ordered entry keys
//     vals:  (ref (array mut V))    ; insertion-ordered entry values
//     live:  (ref (array mut i32))  ; per-entry 1=live, 0=tombstoned (deleted)
//     index: (ref (array mut i32))  ; hash slots -> entry index + 1 (0 = empty)
//     count: i32                    ; entries appended (incl. tombstones)
//     size:  i32                    ; live (non-deleted) entry count
//   }
// Iteration walks `keys`/`vals` over `[0, count)` skipping `live[i] == 0`, so it
// is DETERMINISTIC INSERTION ORDER (multiplayer/replay reproducibility — the hard
// requirement). Lookup hashes the key into `index` (linear probing), resolving to
// an entry slot; a missing key is normal absence -> `V | null` (NOT a trap; the
// deliberate exception to sequence `List[i]`). Deletion tombstones the entry
// (preserving order) and clears its index slot. The index resizes (rehash from
// the live entries) when the load factor crosses 1/2.
//
// KEY TYPES: `i32` and `string` (hash the char codes). A `Set<T>` reuses the map
// helpers with the value array unused (only keys/live/index/size matter).
import { VLCallNode, VLExpression, VLType } from "../toAST.ts";

/** A WasmGC array type, as interned by toWasm's `arrayType`. */
type ArrayType = { heapType: number; refType: number; element: VLType };
/** The map struct type, as interned by toWasm's `mapType`. */
type MapType = {
  heapType: number;
  refType: number;
  key: VLType;
  value: VLType;
  keys: ArrayType;
  vals: ArrayType;
  flags: ArrayType; // i32 array (live + index slots share the element type)
  // The wasm type STORED in a key/val slot — a nullable ref for reference
  // elements (so `array.new_default` null-inits), else the scalar wasm type.
  keyElemWasm: number;
  valElemWasm: number;
  keyIsRef: boolean;
  valIsRef: boolean;
};

/**
 * Everything the map-method codegen needs from the enclosing `toWasm` closure,
 * passed explicitly rather than reached for as module globals.
 */
export type MapBuiltinContext = {
  // deno-lint-ignore no-explicit-any
  m: any;
  // deno-lint-ignore no-explicit-any
  binaryen: any;
  /** Resolve a node's map struct type + key/value types, or null. */
  mapTypeOf: (
    node: VLExpression,
  ) => { mt: MapType; key: VLType; value: VLType } | null;
  /** Lower a node's VL→wasm type. */
  toWasmType: (type: VLType) => number;
  /** The shared lazily-emitted helper-name set (added once each). */
  helpers: Set<string>;
  /** Lower an expression node to a binaryen expression ref. */
  toExpression: (node: VLExpression) => number;
  /** Run `fn` with `type` as the desired type (controls arg coercion). */
  withDesiredType: <T>(type: VLType | undefined, fn: () => T) => T;
  /** Build a `null` value in the representation of nullable `T | null`. */
  nullableNull: (nullableType: VLType) => number;
  /** Build a present `T | null` value from a non-null element value. */
  nullableSome: (
    nullableType: VLType,
    element: VLType,
    value: number,
  ) => number;
  /** The lazily-emitted `__string_eq__` helper name (for string keys). */
  stringEqFn: () => string;
  /** A stable per-module suffix for a map type's helper names. */
  tagOf: (mt: MapType) => number;
};

// Struct field indices (must match toWasm's `mapType` field order).
const MAP_KEYS = 0;
const MAP_VALS = 1;
const MAP_LIVE = 2;
const MAP_INDEX = 3;
const MAP_COUNT = 4;
const MAP_SIZE = 5;

const INITIAL_CAP = 8; // initial entries capacity / index slot count

// Is the map's key a string (ref) rather than an i32?
const stringKey = (mt: MapType): boolean => {
  const k = mt.key;
  return k.type === "Object" && k.name === "string";
};

// `__map_hash_T__(key): i32` — FNV-1a-ish hash. For i32 keys, a multiplicative
// mix; for string keys, fold the char codes. Always returns a non-negative i32
// usable mod the index length.
const mapHashFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_hash_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const keyWasm = ctx.toWasmType(mt.key);
  if (stringKey(mt)) {
    // key is a (ref (array mut i32)) of char codes (string rep).
    const str = () => m.local.get(0, keyWasm);
    const h = () => m.local.get(1, binaryen.i32);
    const i = () => m.local.get(2, binaryen.i32);
    const len = () => m.local.get(3, binaryen.i32);
    const body = m.block(null, [
      m.local.set(1, m.i32.const(2166136261 | 0)),
      m.local.set(3, m.array.len(str())),
      m.local.set(2, m.i32.const(0)),
      m.block("h_brk", [
        m.loop(
          "h_loop",
          m.block(null, [
            m.br("h_brk", m.i32.ge_s(i(), len())),
            m.local.set(
              1,
              m.i32.mul(
                m.i32.xor(h(), m.array.get(str(), i(), binaryen.i32, false)),
                m.i32.const(16777619),
              ),
            ),
            m.local.set(2, m.i32.add(i(), m.i32.const(1))),
            m.br("h_loop"),
          ]),
        ),
      ]),
      // Force non-negative (clear the sign bit).
      m.i32.and(h(), m.i32.const(0x7fffffff)),
    ], binaryen.i32);
    m.addFunction(
      name,
      binaryen.createType([keyWasm]),
      binaryen.i32,
      [binaryen.i32, binaryen.i32, binaryen.i32],
      body,
    );
    return name;
  }
  // i32 key: a multiplicative bit-mix (Knuth), masked non-negative.
  const k = () => m.local.get(0, binaryen.i32);
  const mixed = m.i32.mul(k(), m.i32.const(2654435761 | 0));
  const body = m.i32.and(
    m.i32.xor(mixed, m.i32.shr_u(mixed, m.i32.const(15))),
    m.i32.const(0x7fffffff),
  );
  m.addFunction(name, binaryen.createType([keyWasm]), binaryen.i32, [], body);
  return name;
};

// A stored key/val slot is read as the array's element wasm type (a *nullable*
// ref for reference elements). `ref.as_non_null` recovers a non-null ref for a
// helper (e.g. `__string_eq__`) that wants the non-nullable form; a live slot is
// always non-null.
const nn = (ctx: MapBuiltinContext, isRef: boolean, expr: number): number =>
  isRef ? ctx.m.ref.as_non_null(expr) : expr;

// Key equality (i32 1/0): native `i32.eq` for i32 keys, `__string_eq__` for
// string keys. `a`/`b` are non-null key values.
const keyEq = (ctx: MapBuiltinContext, mt: MapType, a: number, b: number): number => {
  const { m } = ctx;
  if (stringKey(mt)) return m.call(ctx.stringEqFn(), [a, b], ctx.binaryen.i32);
  return m.i32.eq(a, b);
};

// `__map_new_T__(): Map` — allocate an empty map with INITIAL_CAP slots.
const mapNewFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_new_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const body = m.struct.new([
    m.array.new_default(mt.keys.heapType, m.i32.const(INITIAL_CAP)),
    m.array.new_default(mt.vals.heapType, m.i32.const(INITIAL_CAP)),
    m.array.new_default(mt.flags.heapType, m.i32.const(INITIAL_CAP)),
    m.array.new_default(mt.flags.heapType, m.i32.const(INITIAL_CAP * 2)),
    m.i32.const(0),
    m.i32.const(0),
  ], mt.heapType);
  m.addFunction(name, binaryen.createType([]), mt.refType, [], body);
  return name;
};

// Locate the index-slot for `key` via linear probing over `index`. Returns the
// slot offset (always a free or matching slot, since load factor < 1). Helper
// `__map_slot_T__(map, key): i32` returns the probe slot; the caller reads
// `index[slot]` to decide hit/miss.
const mapSlotFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_slot_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const keyWasm = ctx.toWasmType(mt.key);
  const hash = mapHashFn(ctx, mt);
  const map = () => m.local.get(0, mt.refType);
  const key = () => m.local.get(1, keyWasm);
  const idx = () => m.struct.get(MAP_INDEX, map(), mt.flags.refType, false);
  const keysArr = () => m.struct.get(MAP_KEYS, map(), mt.keys.refType, false);
  const live = () => m.struct.get(MAP_LIVE, map(), mt.flags.refType, false);
  const slot = () => m.local.get(2, binaryen.i32);
  const cap = () => m.local.get(3, binaryen.i32);
  const entry = () => m.local.get(4, binaryen.i32);
  const body = m.block(null, [
    m.local.set(3, m.array.len(idx())),
    m.local.set(
      2,
      m.i32.rem_u(m.call(hash, [key()], binaryen.i32), cap()),
    ),
    m.block("s_brk", [
      m.loop(
        "s_loop",
        m.block(null, [
          m.local.set(4, m.array.get(idx(), slot(), binaryen.i32, false)),
          // Empty slot -> miss; return this slot.
          m.br("s_brk", m.i32.eqz(entry())),
          // Matching key on a LIVE entry -> hit; return this slot. A slot whose
          // entry is tombstoned (`live == 0`) is NOT a hit: it acts as a probe
          // marker — we skip past it (keeping the probe chain intact) rather than
          // clear it, so deletes don't break chains between compactions. A
          // re-added key appends a fresh entry/slot further along the chain; the
          // stale dead slot is reclaimed by the next compaction.
          m.br(
            "s_brk",
            m.i32.and(
              keyEq(
                ctx,
                mt,
                nn(
                  ctx,
                  mt.keyIsRef,
                  m.array.get(
                    keysArr(),
                    m.i32.sub(entry(), m.i32.const(1)),
                    mt.keyElemWasm,
                    false,
                  ),
                ),
                key(),
              ),
              m.i32.ne(
                m.array.get(
                  live(),
                  m.i32.sub(entry(), m.i32.const(1)),
                  binaryen.i32,
                  false,
                ),
                m.i32.const(0),
              ),
            ),
          ),
          // Collision (or a tombstoned slot): probe the next slot (wrap).
          m.local.set(2, m.i32.rem_u(m.i32.add(slot(), m.i32.const(1)), cap())),
          m.br("s_loop"),
        ]),
      ),
    ]),
    slot(),
  ], binaryen.i32);
  m.addFunction(
    name,
    binaryen.createType([mt.refType, keyWasm]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32, binaryen.i32],
    body,
  );
  return name;
};

// `__map_rehash_T__(map, targetCap)`: allocate a fresh `index` of `targetCap`
// slots and rebuild it from the LIVE entries (insertion order preserved in
// `keys`/`vals`; only `index` rebuilds). `targetCap` is parameterized so callers
// pick the size: `set`'s load-factor grow passes 2×(current index cap), while
// compaction (delete) passes a live-count-based target so the index SHRINKS
// toward the live entries rather than only ever doubling (the BUG 1 unbounded
// growth on delete). The full rebuild from live entries is what keeps probe
// chains correct after entries are dropped/moved.
const mapRehashFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_rehash_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const hash = mapHashFn(ctx, mt);
  const map = () => m.local.get(0, mt.refType);
  const newCap = () => m.local.get(1, binaryen.i32);
  const newIdx = () => m.local.get(2, mt.flags.refType);
  const i = () => m.local.get(3, binaryen.i32);
  const slot = () => m.local.get(4, binaryen.i32);
  const keysArr = () => m.struct.get(MAP_KEYS, map(), mt.keys.refType, false);
  const live = () => m.struct.get(MAP_LIVE, map(), mt.flags.refType, false);
  const count = () => m.struct.get(MAP_COUNT, map(), binaryen.i32, false);
  const body = m.block(null, [
    m.local.set(2, m.array.new_default(mt.flags.heapType, newCap())),
    m.local.set(3, m.i32.const(0)),
    m.block("rh_brk", [
      m.loop(
        "rh_loop",
        m.block(null, [
          m.br("rh_brk", m.i32.ge_s(i(), count())),
          m.if(
            m.i32.ne(m.array.get(live(), i(), binaryen.i32, false), m.i32.const(0)),
            m.block(null, [
              m.local.set(
                4,
                m.i32.rem_u(
                  m.call(
                    hash,
                    [
                      nn(
                        ctx,
                        mt.keyIsRef,
                        m.array.get(keysArr(), i(), mt.keyElemWasm, false),
                      ),
                    ],
                    binaryen.i32,
                  ),
                  newCap(),
                ),
              ),
              m.block("pr_brk", [
                m.loop(
                  "pr_loop",
                  m.block(null, [
                    m.br(
                      "pr_brk",
                      m.i32.eqz(m.array.get(newIdx(), slot(), binaryen.i32, false)),
                    ),
                    m.local.set(
                      4,
                      m.i32.rem_u(m.i32.add(slot(), m.i32.const(1)), newCap()),
                    ),
                    m.br("pr_loop"),
                  ]),
                ),
              ]),
              m.array.set(newIdx(), slot(), m.i32.add(i(), m.i32.const(1))),
            ]),
          ),
          m.local.set(3, m.i32.add(i(), m.i32.const(1))),
          m.br("rh_loop"),
        ]),
      ),
    ]),
    m.struct.set(MAP_INDEX, map(), newIdx()),
  ], binaryen.none);
  m.addFunction(
    name,
    binaryen.createType([mt.refType, binaryen.i32]),
    binaryen.none,
    [mt.flags.refType, binaryen.i32, binaryen.i32],
    body,
  );
  return name;
};

// `__map_compact_T__(map)`: reclaim tombstones. Rebuild `keys`/`vals`/`live` from
// the LIVE entries only (dropping deleted ones, preserving insertion order), set
// `count = size`, then rebuild the index at a live-count-based capacity. This is
// what keeps delete amortized O(1) and memory bounded (BUG 2): without it,
// `count` and the entry arrays only ever grow. The new index capacity is the
// next power of two ≥ 2×`size`, floored at the initial cap (`INITIAL_CAP*2`), so
// the index tracks the live count and never grows unboundedly on delete.
const mapCompactFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_compact_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const rehash = mapRehashFn(ctx, mt);
  const map = () => m.local.get(0, mt.refType);
  const nk = () => m.local.get(1, mt.keys.refType);
  const nv = () => m.local.get(2, mt.vals.refType);
  const nl = () => m.local.get(3, mt.flags.refType);
  const i = () => m.local.get(4, binaryen.i32);
  const j = () => m.local.get(5, binaryen.i32);
  const cap = () => m.local.get(6, binaryen.i32);
  const keysArr = () => m.struct.get(MAP_KEYS, map(), mt.keys.refType, false);
  const valsArr = () => m.struct.get(MAP_VALS, map(), mt.vals.refType, false);
  const live = () => m.struct.get(MAP_LIVE, map(), mt.flags.refType, false);
  const count = () => m.struct.get(MAP_COUNT, map(), binaryen.i32, false);
  const size = () => m.struct.get(MAP_SIZE, map(), binaryen.i32, false);
  const body = m.block(null, [
    // Fresh entry arrays sized to the OLD entry capacity (keeps spare room so an
    // immediate re-insert doesn't reallocate; `set`'s grow handles further
    // growth). Their length is irrelevant to iteration — `count`/`size` bound it.
    m.local.set(1, m.array.new_default(mt.keys.heapType, m.array.len(keysArr()))),
    m.local.set(2, m.array.new_default(mt.vals.heapType, m.array.len(valsArr()))),
    m.local.set(3, m.array.new_default(mt.flags.heapType, m.array.len(live()))),
    // Copy the live entries down, compacting out the tombstones (order kept).
    m.local.set(4, m.i32.const(0)),
    m.local.set(5, m.i32.const(0)),
    m.block("cp_brk", [
      m.loop(
        "cp_loop",
        m.block(null, [
          m.br("cp_brk", m.i32.ge_s(i(), count())),
          m.if(
            m.i32.ne(
              m.array.get(live(), i(), binaryen.i32, false),
              m.i32.const(0),
            ),
            m.block(null, [
              m.array.set(nk(), j(), m.array.get(keysArr(), i(), mt.keyElemWasm, false)),
              m.array.set(nv(), j(), m.array.get(valsArr(), i(), mt.valElemWasm, false)),
              m.array.set(nl(), j(), m.i32.const(1)),
              m.local.set(5, m.i32.add(j(), m.i32.const(1))),
            ]),
          ),
          m.local.set(4, m.i32.add(i(), m.i32.const(1))),
          m.br("cp_loop"),
        ]),
      ),
    ]),
    m.struct.set(MAP_KEYS, map(), nk()),
    m.struct.set(MAP_VALS, map(), nv()),
    m.struct.set(MAP_LIVE, map(), nl()),
    // No tombstones remain: count == size == j.
    m.struct.set(MAP_COUNT, map(), size()),
    // Target index cap: next pow2 ≥ 2×size, floored at the initial cap.
    m.local.set(6, m.i32.const(INITIAL_CAP * 2)),
    m.block("cap_brk", [
      m.loop(
        "cap_loop",
        m.block(null, [
          m.br(
            "cap_brk",
            m.i32.ge_u(cap(), m.i32.mul(size(), m.i32.const(2))),
          ),
          m.local.set(6, m.i32.mul(cap(), m.i32.const(2))),
          m.br("cap_loop"),
        ]),
      ),
    ]),
    m.call(rehash, [map(), cap()], binaryen.none),
  ], binaryen.none);
  m.addFunction(
    name,
    binaryen.createType([mt.refType]),
    binaryen.none,
    [
      mt.keys.refType,
      mt.vals.refType,
      mt.flags.refType,
      binaryen.i32,
      binaryen.i32,
      binaryen.i32,
    ],
    body,
  );
  return name;
};

// Grow the `keys`/`vals`/`live` entry arrays (2x) when `count == cap`.
const mapGrowEntriesFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_grow_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const map = () => m.local.get(0, mt.refType);
  const newCap = () => m.local.get(1, binaryen.i32);
  const nk = () => m.local.get(2, mt.keys.refType);
  const nv = () => m.local.get(3, mt.vals.refType);
  const nl = () => m.local.get(4, mt.flags.refType);
  const keysArr = () => m.struct.get(MAP_KEYS, map(), mt.keys.refType, false);
  const valsArr = () => m.struct.get(MAP_VALS, map(), mt.vals.refType, false);
  const live = () => m.struct.get(MAP_LIVE, map(), mt.flags.refType, false);
  const count = () => m.struct.get(MAP_COUNT, map(), binaryen.i32, false);
  const body = m.block(null, [
    m.if(
      m.i32.eq(count(), m.array.len(keysArr())),
      m.block(null, [
        m.local.set(1, m.i32.mul(m.array.len(keysArr()), m.i32.const(2))),
        m.local.set(2, m.array.new_default(mt.keys.heapType, newCap())),
        m.local.set(3, m.array.new_default(mt.vals.heapType, newCap())),
        m.local.set(4, m.array.new_default(mt.flags.heapType, newCap())),
        m.array.copy(nk(), m.i32.const(0), keysArr(), m.i32.const(0), count()),
        m.array.copy(nv(), m.i32.const(0), valsArr(), m.i32.const(0), count()),
        m.array.copy(nl(), m.i32.const(0), live(), m.i32.const(0), count()),
        m.struct.set(MAP_KEYS, map(), nk()),
        m.struct.set(MAP_VALS, map(), nv()),
        m.struct.set(MAP_LIVE, map(), nl()),
      ]),
    ),
  ], binaryen.none);
  m.addFunction(
    name,
    binaryen.createType([mt.refType]),
    binaryen.none,
    [binaryen.i32, mt.keys.refType, mt.vals.refType, mt.flags.refType],
    body,
  );
  return name;
};

// `__map_set_T__(map, key, value)`: insert or overwrite. Returns null.
const mapSetFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_set_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const keyWasm = ctx.toWasmType(mt.key);
  const valWasm = ctx.toWasmType(mt.value);
  const slotFn = mapSlotFn(ctx, mt);
  const grow = mapGrowEntriesFn(ctx, mt);
  const rehash = mapRehashFn(ctx, mt);
  const map = () => m.local.get(0, mt.refType);
  const key = () => m.local.get(1, keyWasm);
  const value = () => m.local.get(2, valWasm);
  const slot = () => m.local.get(3, binaryen.i32);
  const entry = () => m.local.get(4, binaryen.i32);
  const idx = () => m.struct.get(MAP_INDEX, map(), mt.flags.refType, false);
  const keysArr = () => m.struct.get(MAP_KEYS, map(), mt.keys.refType, false);
  const valsArr = () => m.struct.get(MAP_VALS, map(), mt.vals.refType, false);
  const live = () => m.struct.get(MAP_LIVE, map(), mt.flags.refType, false);
  const count = () => m.struct.get(MAP_COUNT, map(), binaryen.i32, false);
  const size = () => m.struct.get(MAP_SIZE, map(), binaryen.i32, false);
  const body = m.block(null, [
    m.local.set(3, m.call(slotFn, [map(), key()], binaryen.i32)),
    m.local.set(4, m.array.get(idx(), slot(), binaryen.i32, false)),
    m.if(
      // Existing key: overwrite the value in place (order/position kept).
      m.i32.ne(entry(), m.i32.const(0)),
      m.array.set(valsArr(), m.i32.sub(entry(), m.i32.const(1)), value()),
      // New key: ensure entry capacity, append, link the index slot, bump counts.
      m.block(null, [
        m.call(grow, [map()], binaryen.none),
        m.array.set(keysArr(), count(), key()),
        m.array.set(valsArr(), count(), value()),
        m.array.set(live(), count(), m.i32.const(1)),
        // `grow` may have reallocated entry arrays but never the index; the slot
        // stays valid. Link slot -> (entry index + 1).
        m.array.set(idx(), slot(), m.i32.add(count(), m.i32.const(1))),
        m.struct.set(MAP_COUNT, map(), m.i32.add(count(), m.i32.const(1))),
        m.struct.set(MAP_SIZE, map(), m.i32.add(size(), m.i32.const(1))),
        // Resize the index when load factor (size / cap) crosses 1/2: double it
        // and rebuild from the live entries.
        m.if(
          m.i32.ge_u(
            m.i32.mul(size(), m.i32.const(2)),
            m.array.len(idx()),
          ),
          m.call(
            rehash,
            [map(), m.i32.mul(m.array.len(idx()), m.i32.const(2))],
            binaryen.none,
          ),
        ),
      ]),
    ),
  ], binaryen.none);
  m.addFunction(
    name,
    binaryen.createType([mt.refType, keyWasm, valWasm]),
    binaryen.none,
    [binaryen.i32, binaryen.i32],
    body,
  );
  return name;
};

// `__map_get_T__(map, key): V | null` — lookup; missing key is normal absence.
const mapGetFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers, nullableNull, nullableSome } = ctx;
  const name = `__map_get_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const keyWasm = ctx.toWasmType(mt.key);
  const slotFn = mapSlotFn(ctx, mt);
  const nullableType: VLType = { type: "Nullable", subType: mt.value };
  const retWasm = ctx.toWasmType(nullableType);
  const map = () => m.local.get(0, mt.refType);
  const key = () => m.local.get(1, keyWasm);
  const entry = () => m.local.get(2, binaryen.i32);
  const idx = () => m.struct.get(MAP_INDEX, map(), mt.flags.refType, false);
  const valsArr = () => m.struct.get(MAP_VALS, map(), mt.vals.refType, false);
  const body = m.block(null, [
    m.local.set(
      2,
      m.array.get(
        idx(),
        m.call(slotFn, [map(), key()], binaryen.i32),
        binaryen.i32,
        false,
      ),
    ),
    m.if(
      m.i32.eqz(entry()),
      nullableNull(nullableType),
      nullableSome(
        nullableType,
        mt.value,
        nn(
          ctx,
          mt.valIsRef,
          m.array.get(
            valsArr(),
            m.i32.sub(entry(), m.i32.const(1)),
            mt.valElemWasm,
            false,
          ),
        ),
      ),
      retWasm,
    ),
  ], retWasm);
  m.addFunction(
    name,
    binaryen.createType([mt.refType, keyWasm]),
    retWasm,
    [binaryen.i32],
    body,
  );
  return name;
};

// `__map_has_T__(map, key): i32` (boolean) — 1 if the key is present.
const mapHasFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_has_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const keyWasm = ctx.toWasmType(mt.key);
  const slotFn = mapSlotFn(ctx, mt);
  const map = () => m.local.get(0, mt.refType);
  const key = () => m.local.get(1, keyWasm);
  const idx = () => m.struct.get(MAP_INDEX, map(), mt.flags.refType, false);
  const body = m.i32.ne(
    m.array.get(
      idx(),
      m.call(slotFn, [map(), key()], binaryen.i32),
      binaryen.i32,
      false,
    ),
    m.i32.const(0),
  );
  m.addFunction(
    name,
    binaryen.createType([mt.refType, keyWasm]),
    binaryen.i32,
    [],
    body,
  );
  return name;
};

// `__map_delete_T__(map, key): boolean` — tombstone the entry (order preserved)
// and decrement `size`; the index slot is left in place as a probe marker (see
// `mapSlotFn`) so chains stay intact without a full rehash on every delete (the
// BUG 1 unbounded index growth). Amortized: when dead entries outgrow a
// threshold, compact — reclaiming tombstones and shrinking the index toward the
// live count (BUG 2). Returns 1 if a key was removed, else 0.
const mapDeleteFn = (ctx: MapBuiltinContext, mt: MapType): string => {
  const { m, binaryen, helpers } = ctx;
  const name = `__map_delete_${ctx.tagOf(mt)}__`;
  if (helpers.has(name)) return name;
  helpers.add(name);
  const keyWasm = ctx.toWasmType(mt.key);
  const slotFn = mapSlotFn(ctx, mt);
  const compact = mapCompactFn(ctx, mt);
  const map = () => m.local.get(0, mt.refType);
  const key = () => m.local.get(1, keyWasm);
  const slot = () => m.local.get(2, binaryen.i32);
  const entry = () => m.local.get(3, binaryen.i32);
  const idx = () => m.struct.get(MAP_INDEX, map(), mt.flags.refType, false);
  const live = () => m.struct.get(MAP_LIVE, map(), mt.flags.refType, false);
  const count = () => m.struct.get(MAP_COUNT, map(), binaryen.i32, false);
  const size = () => m.struct.get(MAP_SIZE, map(), binaryen.i32, false);
  const body = m.block(null, [
    m.local.set(2, m.call(slotFn, [map(), key()], binaryen.i32)),
    m.local.set(3, m.array.get(idx(), slot(), binaryen.i32, false)),
    m.if(
      m.i32.eqz(entry()),
      m.i32.const(0),
      m.block(null, [
        // Tombstone the entry (keeps its position for insertion-order iteration).
        m.array.set(live(), m.i32.sub(entry(), m.i32.const(1)), m.i32.const(0)),
        m.struct.set(MAP_SIZE, map(), m.i32.sub(size(), m.i32.const(1))),
        // Amortized compaction: when dead entries (`count - size`) exceed `size`
        // (with a small floor so tiny maps don't churn), rebuild from the live
        // entries — reclaiming tombstones and resizing the index down. This keeps
        // delete ~O(1) amortized while bounding `count`/the entry+index arrays.
        m.if(
          m.i32.gt_u(
            m.i32.sub(count(), size()),
            m.i32.add(size(), m.i32.const(INITIAL_CAP)),
          ),
          m.call(compact, [map()], binaryen.none),
        ),
        m.i32.const(1),
      ], binaryen.i32),
    ),
  ], binaryen.i32);
  m.addFunction(
    name,
    binaryen.createType([mt.refType, keyWasm]),
    binaryen.i32,
    [binaryen.i32, binaryen.i32],
    body,
  );
  return name;
};

/**
 * Lower an intrinsic map/set method call (`.get`/`.has`/`.set`/`.add`/`.delete`).
 * Returns the binaryen expression ref, or `null` when `node` is not such a call.
 */
export const lowerMapMethodCall = (
  ctx: MapBuiltinContext,
  node: VLCallNode,
): number | null => {
  const { m, binaryen, mapTypeOf, toExpression, withDesiredType } = ctx;
  if (node.callee.type !== "PropertyAccess") return null;
  const recv = node.callee.object;
  const info = mapTypeOf(recv);
  if (!info) return null;
  const mt = info.mt;
  const prop = node.callee.property;
  const keyArg = () =>
    withDesiredType(mt.key, () => toExpression(node.arguments[0].value));
  if (prop === "get") {
    return m.call(
      mapGetFn(ctx, mt),
      [toExpression(recv), keyArg()],
      ctx.toWasmType({ type: "Nullable", subType: mt.value }),
    );
  }
  if (prop === "has") {
    return m.call(mapHasFn(ctx, mt), [toExpression(recv), keyArg()], binaryen.i32);
  }
  if (prop === "delete") {
    return m.call(
      mapDeleteFn(ctx, mt),
      [toExpression(recv), keyArg()],
      binaryen.i32,
    );
  }
  if (prop === "set") {
    return m.call(
      mapSetFn(ctx, mt),
      [
        toExpression(recv),
        keyArg(),
        withDesiredType(mt.value, () => toExpression(node.arguments[1].value)),
      ],
      binaryen.none,
    );
  }
  // `Set<T>.add(x)` reuses the map set helper with the key as both key and a
  // unit value (the value array is unused for sets — value type is i32 0).
  if (prop === "add") {
    return m.call(
      mapSetFn(ctx, mt),
      [toExpression(recv), keyArg(), m.i32.const(0)],
      binaryen.none,
    );
  }
  return null;
};

export {
  MAP_COUNT,
  MAP_INDEX,
  MAP_KEYS,
  MAP_LIVE,
  MAP_SIZE,
  MAP_VALS,
  mapGetFn,
  mapNewFn,
  mapSetFn,
  stringKey,
};
export type { ArrayType, MapType };
