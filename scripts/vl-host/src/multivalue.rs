//! The `-O`/`-O3` multi-value step (lane MV, D3625; the owner's ruling (B) on small record
//! results): a call whose small record result is only read field by field calls a twin of its
//! producer that returns the fields as wasm multi-value results, so no `struct.new` is made.
//!
//! The step is a module-to-module rewrite run before the escape step. Its unit is the CALL
//! SITE, which is what the escape step's inlining cannot express (`--no-inline` is per callee,
//! and its escape test is per wasm type: D3262, D3263).
//!
//! **What qualifies.** A record is a struct type of 1 to `MV_RECORD_MAX_FIELDS` fields, each
//! an `i32`, `i64`, `f32` or `f64`, that no `struct.set` (or atomic write) anywhere in the
//! module can reach. A value of such a type cannot change after it is made, so reading its
//! fields early reads what a later `struct.get` would. When every struct type sits in one rec
//! group (VL's emitter puts them there), two type indices are never one wasm type, so a write
//! reaches the type it names and that type's subtyping component (a subtype's value stands
//! where its supertype is expected): sunpa's `V3` is a declared subtype of a `{ x, y }` record
//! and stays a record while neither is written (D3630). Otherwise a write reaches every type of
//! its shape, and a type in any subtyping relation is refused. `$VL_MV_EXPLAIN=1` prints why
//! each record type and producer was taken or refused.
//! A producer is a function whose one result is a non-null reference to a record. A record
//! value is used *field-only* when it reaches nothing but `struct.get`s, a field-only local,
//! a field-only parameter of another call, or (inside a result twin) the twin's own exit. A
//! local is field-only, and held as one wasm local per field, when every value it is set to
//! is a producer's result, a `struct.new` or another field-only local, and every read of it
//! is a field use. Identity (`ref.eq`), a cast, a store, a capture and an ordinary argument
//! all keep the struct: they are none of these uses.
//!
//! **The twins.** A twin of `f` is keyed by `(f, S, r)`: `S` the record parameters it takes
//! as fields (a parameter qualifies when `f` uses it field-only), `r` whether it returns its
//! record as fields. A call site picks the twin its own arguments and use allow, so the same
//! producer allocates where its result escapes and not where it is read. A returned
//! `struct.new` is deleted (its fields are already on the stack in order); a returned value of
//! any other origin is read field by field at the return. Twins are made on demand by a
//! worklist, chains included (`qmul(qnorm(a), b)` passes `qnorm`'s fields straight on).
//!
//! **What is left alone.** A function with a `br_if`/`br_table`/`br_on_*`/`try` that can leave
//! it with its result, or a `return_call_ref`/`return_call_indirect`, gets no result twin, and
//! nor does one that tail-calls such a function. A local whose type is nullable is scalarized
//! only when its first use is a set in the function's own frame. Any module this cannot parse
//! or validate, or whose twins would add more than the growth bound, is left untouched.

use std::collections::{HashMap, HashSet, VecDeque};
use wasmparser::{
    AbstractHeapType, CompositeInnerType, FuncValidatorAllocations, HeapType, Operator, Parser,
    Payload, StorageType, TypeRef, UnpackedIndex, ValType, ValidPayload, Validator, WasmFeatures,
};

/// The most fields a record returned as multi-value may have: the size the escape step's
/// `ESCAPE_RECORD_MAX_FIELDS` already gives ruling (B). A vector (3), a quaternion (4) and
/// plumb's five-field `Quat` fit; a 4x4 matrix (16) does not. Past the return registers (two
/// integer and two float values on x86-64) each field is a store and a load through a return
/// area, which still costs well under the allocation it replaces: measured at 5, 6 and 8 `f64`
/// fields the twin is 2.2-3.1x faster on V8 and 3-6x on wasmtime (DECISIONS.md, D3625). Past
/// eight the copy at every call grows with the record and inlining is the better route.
pub const MV_RECORD_MAX_FIELDS: usize = 8;

/// At most this many twins, and at most `MV_GROWTH_FLOOR` plus half the code section in their
/// bodies; a module past either gets no step at all.
const MV_MAX_TWINS: usize = 4096;
const MV_GROWTH_FLOOR: usize = 64 << 10;

const NONE: u32 = u32::MAX;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub(crate) enum Num {
    I32,
    I64,
    F32,
    F64,
}

impl Num {
    pub(crate) fn val(self) -> ValType {
        match self {
            Num::I32 => ValType::I32,
            Num::I64 => ValType::I64,
            Num::F32 => ValType::F32,
            Num::F64 => ValType::F64,
        }
    }
    pub(crate) fn of(v: ValType) -> Option<Num> {
        match v {
            ValType::I32 => Some(Num::I32),
            ValType::I64 => Some(Num::I64),
            ValType::F32 => Some(Num::F32),
            ValType::F64 => Some(Num::F64),
            _ => None,
        }
    }
}

/// A record's fields (type, mutability) and finality. Two record types the module treats as
/// one wasm type have one shape, so where indices may alias, a write is charged to every type
/// of its shape: judging by shape can only refuse a record, never admit one a write can reach.
type Shape = (Vec<(Num, bool)>, bool);

/// What the op after a recorded one is, for the adjacency tests.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Next {
    Other,
    StructGet(u32, u32),
    LocalSet(u32),
    Exit,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Call(u32),
    ReturnCall(u32),
    StructNew(u32),
    LocalGet(u32),
    LocalSet(u32),
    LocalTee(u32),
    /// `return`, the body's final `end`, or a `br` to the function's own frame: an op that
    /// hands the top of the stack back as the function's result.
    Exit,
}

/// One recorded op of a body: its ordinal among the body's ops and what the analysis needs.
#[derive(Clone, Debug)]
struct Ins {
    k: u32,
    kind: Kind,
    reach: bool,
    /// Control depth before the op: 1 is the function's own frame.
    depth: u32,
    next: Next,
    /// The ordinal of the op that pushed the value this op consumes from the top, for a
    /// `local.set`/`local.tee` and an exit; `NONE` when unknown or from another frame.
    top: u32,
    /// For a call: the producers of its arguments, as a range into `Body::args`.
    args: (u32, u32),
}

struct Body {
    /// The body's bytes in the module: locals header and operators.
    range: (usize, usize),
    ops_start: usize,
    locals: Vec<(u32, ValType)>,
    ins: Vec<Ins>,
    args: Vec<u32>,
    /// Some branch other than a plain `br` can leave the function with its result, or a
    /// `return_call_ref`/`return_call_indirect` does: no result twin.
    exits_otherwise: bool,
}

impl Body {
    fn at(&self, k: u32) -> Option<&Ins> {
        self.ins
            .binary_search_by_key(&k, |i| i.k)
            .ok()
            .map(|i| &self.ins[i])
    }
    fn args_of(&self, i: &Ins) -> &[u32] {
        &self.args[i.args.0 as usize..i.args.1 as usize]
    }
}

struct Module<'a> {
    bytes: &'a [u8],
    n_imports: u32,
    /// Per function (imports first): its type index.
    func_type: Vec<u32>,
    /// Per type index: `Some((params, results))` for a function type.
    func_sig: Vec<Option<(Vec<ValType>, Vec<ValType>)>>,
    /// Per type index: its shape when it is a record the step may take apart.
    record: Vec<Option<Shape>>,
    /// Per type index: its shape when it has a record's fields, before any refusal.
    shape_all: Vec<Option<Shape>>,
    /// Every struct type sits in one rec group, so two type indices are never one wasm type
    /// and a write is charged by index rather than by shape.
    by_index: bool,
    /// Per type index: the root of its subtyping component (itself when it has none).
    comp: Vec<u32>,
    /// Per written struct type: the first function that writes it.
    writer: HashMap<u32, u32>,
    bodies: Vec<Body>,
    names: bool,
}

impl Module<'_> {
    fn sig(&self, f: u32) -> &(Vec<ValType>, Vec<ValType>) {
        self.func_sig[self.func_type[f as usize] as usize]
            .as_ref()
            .expect("a function's type is a function type")
    }
    fn body(&self, f: u32) -> &Body {
        &self.bodies[(f - self.n_imports) as usize]
    }
    /// The record a reference type names, as its type index and shape.
    fn record_of(&self, v: ValType) -> Option<(u32, &Shape)> {
        let ValType::Ref(r) = v else { return None };
        let HeapType::Concrete(UnpackedIndex::Module(t)) = r.heap_type() else {
            return None;
        };
        self.record.get(t as usize)?.as_ref().map(|s| (t, s))
    }
    fn shape_of_type(&self, t: u32) -> Option<&Shape> {
        self.record.get(t as usize)?.as_ref()
    }
    /// The type of local `i` of defined function `f`.
    fn local_type(&self, f: u32, i: u32) -> Option<ValType> {
        let params = &self.sig(f).0;
        if (i as usize) < params.len() {
            return Some(params[i as usize]);
        }
        let mut at = params.len() as u32;
        for &(n, t) in &self.body(f).locals {
            if i < at + n {
                return Some(t);
            }
            at += n;
        }
        None
    }
}

pub(crate) fn concrete_index(h: HeapType) -> Option<u32> {
    match h {
        HeapType::Concrete(UnpackedIndex::Module(i))
        | HeapType::Exact(UnpackedIndex::Module(i)) => Some(i),
        _ => None,
    }
}

/// Parse and validate `bytes`, recording what the step reads. `None` when the module does not
/// parse or validate, or holds no record a producer returns or a parameter takes.
fn scan(bytes: &[u8]) -> Option<Module<'_>> {
    let mut m = Module {
        bytes,
        n_imports: 0,
        func_type: Vec::new(),
        func_sig: Vec::new(),
        record: Vec::new(),
        shape_all: Vec::new(),
        by_index: false,
        comp: Vec::new(),
        writer: HashMap::new(),
        bodies: Vec::new(),
        names: false,
    };
    let mut supers: Vec<(u32, u32)> = Vec::new();
    // The rec groups that hold a struct type.
    let mut struct_groups: HashSet<usize> = HashSet::new();
    let mut n_groups = 0usize;
    let mut tainted: HashSet<u32> = HashSet::new();
    // First, the types and signatures alone, so a module with nothing to do costs no validation.
    for payload in Parser::new(0).parse_all(bytes) {
        match payload.ok()? {
            Payload::TypeSection(r) => {
                for group in r {
                    let group = group.ok()?;
                    let g = n_groups;
                    n_groups += 1;
                    for sub in group.into_types() {
                        let ix = m.record.len() as u32;
                        if let Some(sup) = sub.supertype_idx.and_then(|p| p.as_module_index()) {
                            supers.push((ix, sup));
                        }
                        let ct = &sub.composite_type;
                        if matches!(ct.inner, CompositeInnerType::Struct(_)) {
                            struct_groups.insert(g);
                        }
                        let mut rec = None;
                        let mut sig = None;
                        match &ct.inner {
                            CompositeInnerType::Struct(st)
                                if !ct.shared
                                    && ct.descriptor_idx.is_none()
                                    && ct.describes_idx.is_none() =>
                            {
                                let fields: Option<Vec<(Num, bool)>> = st
                                    .fields
                                    .iter()
                                    .map(|f| match f.element_type {
                                        StorageType::Val(v) => Num::of(v).map(|n| (n, f.mutable)),
                                        _ => None,
                                    })
                                    .collect();
                                rec = fields
                                    .filter(|fs| !fs.is_empty() && fs.len() <= MV_RECORD_MAX_FIELDS)
                                    .map(|fs| (fs, sub.is_final));
                            }
                            CompositeInnerType::Func(ft) => {
                                sig = Some((ft.params().to_vec(), ft.results().to_vec()));
                            }
                            _ => {}
                        }
                        m.record.push(rec);
                        m.func_sig.push(sig);
                    }
                }
            }
            Payload::ImportSection(r) => {
                for imp in r.into_imports() {
                    if let TypeRef::Func(t) | TypeRef::FuncExact(t) = imp.ok()?.ty {
                        m.func_type.push(t);
                        m.n_imports += 1;
                    }
                }
            }
            Payload::FunctionSection(r) => {
                for t in r {
                    m.func_type.push(t.ok()?);
                }
            }
            Payload::CustomSection(c) if c.name() == "name" => m.names = true,
            _ => {}
        }
    }
    // A subtype's value can stand where its supertype is expected, so a write to any type of
    // a subtyping component reaches values of every other.
    m.comp = (0..m.record.len() as u32).collect();
    fn root(c: &mut [u32], mut t: u32) -> u32 {
        while c[t as usize] != t {
            c[t as usize] = c[c[t as usize] as usize];
            t = c[t as usize];
        }
        t
    }
    for &(a, b) in &supers {
        if (a as usize) < m.comp.len() && (b as usize) < m.comp.len() {
            let (ra, rb) = (root(&mut m.comp, a), root(&mut m.comp, b));
            m.comp[ra.max(rb) as usize] = ra.min(rb);
        }
    }
    for t in 0..m.comp.len() as u32 {
        let r = root(&mut m.comp, t);
        m.comp[t as usize] = r;
    }
    m.shape_all = m.record.clone();
    // In one rec group, distinct indices are distinct wasm types: a record is judged by its
    // own index and its subtyping component. Otherwise two indices may be one type, so a
    // record is judged by its shape, and a subtyped one is refused outright.
    m.by_index = struct_groups.len() <= 1;
    if !m.by_index {
        for &(a, b) in &supers {
            for t in [a, b] {
                if let Some(slot) = m.record.get_mut(t as usize) {
                    *slot = None;
                }
            }
        }
    }
    let any_candidate = (m.n_imports as usize..m.func_type.len()).any(|f| {
        let Some((ps, rs)) = m
            .func_sig
            .get(m.func_type[f] as usize)
            .and_then(|s| s.as_ref())
        else {
            return false;
        };
        rs.iter()
            .chain(ps.iter())
            .any(|&v| m.record_of(v).is_some())
    });
    if !any_candidate {
        return None;
    }
    // Then every body, under the validator, which answers the operand stack's height.
    let mut validator = Validator::new_with_features(WasmFeatures::all());
    let mut allocs = FuncValidatorAllocations::default();
    let mut fi = m.n_imports;
    for payload in Parser::new(0).parse_all(bytes) {
        let payload = payload.ok()?;
        let valid = validator.payload(&payload).ok()?;
        let ValidPayload::Func(to_validate, body) = valid else {
            continue;
        };
        let mut fv = to_validate.into_validator(std::mem::take(&mut allocs));
        let mut locals = Vec::new();
        let mut lr = body.get_locals_reader().ok()?;
        for _ in 0..lr.get_count() {
            let off = lr.original_position();
            let (n, t) = lr.read().ok()?;
            fv.define_locals(off, n, t).ok()?;
            locals.push((n, t));
        }
        let mut b = Body {
            range: (body.range().start, body.range().end),
            ops_start: lr.original_position(),
            locals,
            ins: Vec::new(),
            args: Vec::new(),
            exits_otherwise: false,
        };
        let f = fi;
        fi += 1;
        let n_params = m.sig(f).0.len() as u32;
        // Whether local `i` holds a record reference (only those ops are recorded).
        let mut local_rec: Vec<bool> = m
            .sig(f)
            .0
            .iter()
            .map(|&v| m.record_of(v).is_some())
            .collect();
        for &(n, t) in &b.locals {
            let r = m.record_of(t).is_some();
            local_rec.extend(std::iter::repeat_n(r, n as usize));
        }
        let _ = n_params;
        // The op that pushed each operand-stack position.
        let mut owner: Vec<u32> = Vec::new();
        // Per open frame: the ordinal its current segment's ops start at.
        let mut seg: Vec<u32> = vec![0];
        let mut ops = body.get_operators_reader().ok()?;
        let mut k: u32 = 0;
        let mut last_recorded: Option<usize> = None;
        while !ops.eof() {
            let (op, off) = ops.read_with_offset().ok()?;
            let hb = fv.operand_stack_height() as usize;
            let depth = fv.control_stack_height();
            let frame = fv.get_control_frame(0)?;
            let reach = !frame.unreachable;
            let base = frame.height;
            let seg_lo = *seg.last()?;
            let fn_frame = depth.checked_sub(1)?;
            // The producer of stack position `p` as this op sees it.
            let producer = |p: usize| -> u32 {
                if !reach || p < base {
                    return NONE;
                }
                match owner.get(p) {
                    Some(&q) if q != NONE && q >= seg_lo => q,
                    _ => NONE,
                }
            };
            // The kind of this op as the previous recorded op's `next`.
            let as_next = match &op {
                Operator::StructGet {
                    struct_type_index,
                    field_index,
                } => Next::StructGet(*struct_type_index, *field_index),
                Operator::LocalSet { local_index } => Next::LocalSet(*local_index),
                Operator::Return => Next::Exit,
                Operator::End if depth == 1 => Next::Exit,
                Operator::Br { relative_depth } if *relative_depth == fn_frame => Next::Exit,
                _ => Next::Other,
            };
            if let Some(li) = last_recorded.take() {
                if b.ins[li].k + 1 == k {
                    b.ins[li].next = as_next;
                }
            }
            let mut record = |kind: Kind, top: u32, args: &[u32]| {
                let a0 = b.args.len() as u32;
                b.args.extend_from_slice(args);
                b.ins.push(Ins {
                    k,
                    kind,
                    reach,
                    depth,
                    next: Next::Other,
                    top,
                    args: (a0, b.args.len() as u32),
                });
                b.ins.len() - 1
            };
            let mut results_pushed: usize = 0;
            match &op {
                Operator::Call { function_index } | Operator::ReturnCall { function_index } => {
                    let callee = *function_index;
                    let (ps, rs) = m.sig(callee).clone();
                    results_pushed = rs.len();
                    if callee >= m.n_imports && (callee as usize) < m.func_type.len() {
                        let pn = ps.len();
                        let args: Vec<u32> = (0..pn)
                            .map(|j| {
                                if hb >= pn {
                                    producer(hb - pn + j)
                                } else {
                                    NONE
                                }
                            })
                            .collect();
                        let kind = if matches!(op, Operator::Call { .. }) {
                            Kind::Call(callee)
                        } else {
                            Kind::ReturnCall(callee)
                        };
                        last_recorded = Some(record(kind, NONE, &args));
                    } else if matches!(op, Operator::ReturnCall { .. }) {
                        // An import has no twin to tail-call.
                        b.exits_otherwise = true;
                    }
                }
                Operator::CallRef { type_index } | Operator::CallIndirect { type_index, .. } => {
                    results_pushed = m
                        .func_sig
                        .get(*type_index as usize)
                        .and_then(|s| s.as_ref())
                        .map_or(0, |s| s.1.len());
                }
                Operator::ReturnCallRef { .. } | Operator::ReturnCallIndirect { .. } => {
                    b.exits_otherwise = true;
                }
                Operator::StructNew { struct_type_index } => {
                    if m.shape_of_type(*struct_type_index).is_some() {
                        last_recorded =
                            Some(record(Kind::StructNew(*struct_type_index), NONE, &[]));
                    }
                }
                Operator::StructSet {
                    struct_type_index, ..
                }
                | Operator::StructAtomicSet {
                    struct_type_index, ..
                }
                | Operator::StructAtomicRmwAdd {
                    struct_type_index, ..
                }
                | Operator::StructAtomicRmwSub {
                    struct_type_index, ..
                }
                | Operator::StructAtomicRmwAnd {
                    struct_type_index, ..
                }
                | Operator::StructAtomicRmwOr {
                    struct_type_index, ..
                }
                | Operator::StructAtomicRmwXor {
                    struct_type_index, ..
                }
                | Operator::StructAtomicRmwXchg {
                    struct_type_index, ..
                }
                | Operator::StructAtomicRmwCmpxchg {
                    struct_type_index, ..
                } => {
                    tainted.insert(*struct_type_index);
                    m.writer.entry(*struct_type_index).or_insert(f);
                }
                Operator::LocalGet { local_index } => {
                    if local_rec.get(*local_index as usize) == Some(&true) {
                        last_recorded = Some(record(Kind::LocalGet(*local_index), NONE, &[]));
                    }
                }
                Operator::LocalSet { local_index } | Operator::LocalTee { local_index } => {
                    if local_rec.get(*local_index as usize) == Some(&true) {
                        let top = if hb >= 1 { producer(hb - 1) } else { NONE };
                        let kind = if matches!(op, Operator::LocalSet { .. }) {
                            Kind::LocalSet(*local_index)
                        } else {
                            Kind::LocalTee(*local_index)
                        };
                        last_recorded = Some(record(kind, top, &[]));
                    }
                }
                Operator::Return => {
                    let top = if hb >= 1 { producer(hb - 1) } else { NONE };
                    record(Kind::Exit, top, &[]);
                }
                Operator::End if depth == 1 => {
                    let top = if hb >= 1 { producer(hb - 1) } else { NONE };
                    record(Kind::Exit, top, &[]);
                }
                Operator::Br { relative_depth } if *relative_depth == fn_frame => {
                    let top = if hb >= 1 { producer(hb - 1) } else { NONE };
                    record(Kind::Exit, top, &[]);
                }
                Operator::BrIf { relative_depth }
                | Operator::BrOnNull { relative_depth }
                | Operator::BrOnNonNull { relative_depth }
                | Operator::BrOnCast { relative_depth, .. }
                | Operator::BrOnCastFail { relative_depth, .. } => {
                    if *relative_depth >= fn_frame {
                        b.exits_otherwise = true;
                    }
                }
                Operator::BrTable { targets } => {
                    for t in targets
                        .targets()
                        .chain(std::iter::once(Ok(targets.default())))
                    {
                        if t.ok()? >= fn_frame {
                            b.exits_otherwise = true;
                        }
                    }
                }
                Operator::Try { .. }
                | Operator::TryTable { .. }
                | Operator::Delegate { .. }
                | Operator::Catch { .. }
                | Operator::CatchAll => {
                    b.exits_otherwise = true;
                }
                _ => {}
            }
            // The op's own arity says which positions it writes: its results, the top
            // `pushes` of the stack after it. Without one, every position from one below the
            // lower of the two heights, which can only lose an attribution, never invent one.
            let arity = op.operator_arity(&fv);
            fv.op(off, &op).ok()?;
            let ha = fv.operand_stack_height() as usize;
            let mut lo = match arity {
                Some((_, pushes)) => ha.saturating_sub(pushes as usize),
                None => hb.min(ha).saturating_sub(1).min(base),
            };
            lo = lo.min(ha.saturating_sub(results_pushed));
            if fv.control_stack_height() > depth {
                lo = lo.min(fv.get_control_frame(0)?.height);
            }
            owner.resize(ha.max(owner.len()), NONE);
            for p in lo..ha {
                owner[p] = k;
            }
            owner.truncate(ha);
            match op {
                Operator::Block { .. }
                | Operator::Loop { .. }
                | Operator::If { .. }
                | Operator::Try { .. }
                | Operator::TryTable { .. } => seg.push(k + 1),
                Operator::Else | Operator::Catch { .. } | Operator::CatchAll => {
                    *seg.last_mut()? = k + 1;
                }
                Operator::End | Operator::Delegate { .. } => {
                    seg.pop();
                }
                _ => {}
            }
            k += 1;
        }
        allocs = fv.into_allocations();
        m.bodies.push(b);
    }
    if m.bodies.len() + m.n_imports as usize != m.func_type.len() {
        return None;
    }
    // A write is charged to every record of its subtyping component, or, judging by shape, to
    // every record of its shape (read before any refusal, so a refused type's write counts).
    if m.by_index {
        let written: HashSet<u32> = tainted
            .iter()
            .filter_map(|&t| m.comp.get(t as usize).copied())
            .collect();
        for (t, slot) in m.record.iter_mut().enumerate() {
            if written.contains(&m.comp[t]) {
                *slot = None;
            }
        }
    } else {
        let written: HashSet<Shape> = tainted
            .iter()
            .filter_map(|&t| m.shape_all.get(t as usize).cloned().flatten())
            .collect();
        for slot in &mut m.record {
            if slot.as_ref().is_some_and(|s| written.contains(s)) {
                *slot = None;
            }
        }
    }
    Some(m)
}

/// A twin's key: the function, the parameters it takes as fields (a bit per parameter
/// index, at most 64), and whether it returns its record as fields.
type Twin = (u32, u64, bool);

struct Analysis {
    /// The functions whose record result a twin may return as fields.
    producer: HashSet<u32>,
    /// `(f, a)`: parameter `a` of `f` is used field-only.
    fo_param: HashSet<(u32, u32)>,
    /// The same in a twin that returns its record as fields, where handing the parameter
    /// back as the result is a field use too (`unit(a, fallback)` returning `fallback`).
    fo_param_r: HashSet<(u32, u32)>,
    /// Per defined function: the non-parameter locals it holds field by field.
    fo_local: Vec<HashSet<u32>>,
}

/// Whether a value of record type `a` may be taken apart where record type `b` is named: the
/// same type, or, judging by shape, the same shape.
fn same_shape(m: &Module, a: u32, b: u32) -> bool {
    match (m.shape_of_type(a), m.shape_of_type(b)) {
        (Some(x), Some(y)) => {
            if m.by_index {
                a == b
            } else {
                x == y
            }
        }
        _ => false,
    }
}

/// The record type a parameter or a function's single result names.
fn param_record(m: &Module, f: u32, j: u32) -> Option<u32> {
    m.record_of(*m.sig(f).0.get(j as usize)?).map(|(t, _)| t)
}

/// Whether `f` and `g` return the same record type, so `g`'s result fields are `f`'s.
fn same_record_result(m: &Module, f: u32, g: u32) -> bool {
    match (result_record(m, f), result_record(m, g)) {
        (Some(a), Some(b)) => same_shape(m, a, b),
        _ => false,
    }
}

fn result_record(m: &Module, f: u32) -> Option<u32> {
    let rs = &m.sig(f).1;
    if rs.len() != 1 {
        return None;
    }
    let ValType::Ref(r) = rs[0] else { return None };
    if r.is_nullable() {
        return None;
    }
    m.record_of(rs[0]).map(|(t, _)| t)
}

/// For each op ordinal that produces some call's argument: `(call ordinal, argument index)`.
fn arg_consumers(b: &Body) -> HashMap<u32, (u32, u32)> {
    let mut out = HashMap::new();
    for i in &b.ins {
        if matches!(i.kind, Kind::Call(_) | Kind::ReturnCall(_)) && i.reach {
            for (j, &q) in b.args_of(i).iter().enumerate() {
                if q != NONE {
                    out.insert(q, (i.k, j as u32));
                }
            }
        }
    }
    out
}

fn callee_of(i: &Ins) -> Option<u32> {
    match i.kind {
        Kind::Call(g) | Kind::ReturnCall(g) => Some(g),
        _ => None,
    }
}

fn analyse(m: &Module) -> Analysis {
    let defined = || m.n_imports..m.n_imports + m.bodies.len() as u32;
    let consumers: Vec<HashMap<u32, (u32, u32)>> = m.bodies.iter().map(arg_consumers).collect();
    // Producers: a greatest fixpoint, since a tail call hands the result straight on. A tail
    // call to a producer of another record type (a subtype's, under width subtyping: D3630)
    // hands back that type's fields, which are not the caller's, so it keeps the caller out.
    let mut producer: HashSet<u32> = defined()
        .filter(|&f| result_record(m, f).is_some() && !m.body(f).exits_otherwise)
        .collect();
    loop {
        let drop: Vec<u32> = producer
            .iter()
            .copied()
            .filter(|&f| {
                m.body(f).ins.iter().any(|i| match i.kind {
                    Kind::ReturnCall(g) => !producer.contains(&g) || !same_record_result(m, f, g),
                    _ => false,
                })
            })
            .collect();
        if drop.is_empty() {
            break;
        }
        for f in drop {
            producer.remove(&f);
        }
    }
    // Whether a get at ordinal `k` of body `f`, of a record of type `t`, is a field use under
    // the current field-only parameters.
    let field_use = |f: u32, i: &Ins, t: u32, fo: &HashSet<(u32, u32)>| -> bool {
        if !i.reach {
            return false;
        }
        if let Next::StructGet(st, _) = i.next {
            return same_shape(m, st, t);
        }
        let ix = (f - m.n_imports) as usize;
        match consumers[ix].get(&i.k) {
            Some(&(ck, j)) => {
                let c = m.body(f).at(ck).expect("a consumer is recorded");
                let h = callee_of(c).expect("a consumer is a call");
                fo.contains(&(h, j)) && param_record(m, h, j).is_some_and(|pt| same_shape(m, pt, t))
            }
            None => false,
        }
    };
    // Field-only parameters: a greatest fixpoint over the whole call graph.
    let mut fo: HashSet<(u32, u32)> = HashSet::new();
    for f in defined() {
        for j in 0..m.sig(f).0.len().min(64) as u32 {
            if param_record(m, f, j).is_some() {
                fo.insert((f, j));
            }
        }
    }
    loop {
        let drop: Vec<(u32, u32)> = fo
            .iter()
            .copied()
            .filter(|&(f, a)| {
                let t = param_record(m, f, a).expect("a candidate names a record");
                m.body(f).ins.iter().any(|i| match i.kind {
                    Kind::LocalSet(l) | Kind::LocalTee(l) => l == a,
                    Kind::LocalGet(l) => l == a && !field_use(f, i, t, &fo),
                    _ => false,
                })
            })
            .collect();
        if drop.is_empty() {
            break;
        }
        for d in drop {
            fo.remove(&d);
        }
    }
    // Field-only locals, per body.
    let mut fo_local = Vec::with_capacity(m.bodies.len());
    for f in defined() {
        let b = m.body(f);
        let n_params = m.sig(f).0.len() as u32;
        let mut cands: HashMap<u32, (u32, bool)> = HashMap::new();
        for i in &b.ins {
            if let Kind::LocalGet(l) | Kind::LocalSet(l) | Kind::LocalTee(l) = i.kind {
                if l >= n_params && !cands.contains_key(&l) {
                    if let Some(ValType::Ref(r)) = m.local_type(f, l) {
                        if let Some(t) = r.heap_type().into_concrete_index() {
                            if m.shape_of_type(t).is_some() {
                                cands.insert(l, (t, r.is_nullable()));
                            }
                        }
                    }
                }
            }
        }
        // A greatest fixpoint, since a copy `const q = p` keeps both only while both qualify.
        let mut live: HashSet<u32> = cands.keys().copied().collect();
        let same_local = |l: u32, t: u32, live: &HashSet<u32>| {
            live.contains(&l) && cands.get(&l).is_some_and(|&(lt, _)| same_shape(m, lt, t))
        };
        loop {
            let mut first_seen: HashSet<u32> = HashSet::new();
            let mut bad: HashSet<u32> = HashSet::new();
            for i in &b.ins {
                let (l, ok) = match i.kind {
                    Kind::LocalTee(l) => (l, false),
                    Kind::LocalGet(l) => match cands.get(&l) {
                        Some(&(t, nullable)) => {
                            let copied = matches!(i.next, Next::LocalSet(q)
                                if q != l && i.reach && same_local(q, t, &live));
                            (
                                l,
                                (field_use(f, i, t, &fo) || copied)
                                    && (!nullable || first_seen.contains(&l)),
                            )
                        }
                        None => continue,
                    },
                    Kind::LocalSet(l) => match cands.get(&l) {
                        Some(&(t, nullable)) => {
                            let src = (i.reach && i.top != NONE && i.top + 1 == i.k)
                                .then(|| b.at(i.top))
                                .flatten();
                            let ok = match src.map(|s| s.kind) {
                                Some(Kind::Call(g)) => {
                                    producer.contains(&g)
                                        && result_record(m, g)
                                            .is_some_and(|rt| same_shape(m, rt, t))
                                }
                                Some(Kind::StructNew(st)) => same_shape(m, st, t),
                                Some(Kind::LocalGet(p)) => p != l && same_local(p, t, &live),
                                _ => !i.reach,
                            };
                            let first_ok =
                                !nullable || first_seen.contains(&l) || (i.depth == 1 && i.reach);
                            (l, ok && first_ok)
                        }
                        None => continue,
                    },
                    _ => continue,
                };
                first_seen.insert(l);
                if !ok {
                    bad.insert(l);
                }
            }
            let before = live.len();
            live.retain(|l| !bad.contains(l));
            if live.len() == before {
                break;
            }
        }
        fo_local.push(live);
    }
    // The result-twin set: the field-only parameters, and those whose every other use is
    // the exit, as long as the function can be a result twin at all.
    let mut fo_r: HashSet<(u32, u32)> = fo.clone();
    for f in defined().filter(|f| producer.contains(f)) {
        let Some(rt) = result_record(m, f) else {
            continue;
        };
        for j in 0..m.sig(f).0.len().min(64) as u32 {
            if fo.contains(&(f, j)) || !param_record(m, f, j).is_some_and(|t| same_shape(m, t, rt))
            {
                continue;
            }
            let t = param_record(m, f, j).expect("checked above");
            let ok = m.body(f).ins.iter().all(|i| match i.kind {
                Kind::LocalSet(l) | Kind::LocalTee(l) => l != j,
                Kind::LocalGet(l) if l == j => {
                    field_use(f, i, t, &fo) || (i.reach && i.next == Next::Exit)
                }
                _ => true,
            });
            if ok {
                fo_r.insert((f, j));
            }
        }
    }
    Analysis {
        producer,
        fo_param: fo,
        fo_param_r: fo_r,
        fo_local,
    }
}

trait IntoConcrete {
    fn into_concrete_index(self) -> Option<u32>;
}

impl IntoConcrete for HeapType {
    fn into_concrete_index(self) -> Option<u32> {
        concrete_index(self)
    }
}

/// What a context's rewrite does at each op ordinal it changes.
#[derive(Clone, Debug)]
enum Act {
    /// Re-encode a call or tail call to this function index.
    Call(u32, bool),
    Delete,
    /// The field gets of a scalarized local: `Some(i)` the one field the next `struct.get`
    /// reads (that `struct.get` is deleted), `None` all of them.
    GetFields(u32, Option<u32>),
    /// A scalarized local's set, from a twin's results or a deleted `struct.new`.
    SetFields(u32),
    /// A `struct.get` of field `i` from the `n` fields a twin call left.
    PickField(u32),
    /// Read every field of the returned record before the exit.
    ExtractExit,
}

struct Plan {
    acts: HashMap<u32, Act>,
}

/// One context's decisions: its plan and the twins it calls.
///
/// Calls are decided last to first, because a call's own use (the op after it, or a later
/// call it is an argument of) is decided before it: whether a call returns fields fixes
/// which of its parameters it may pass as fields.
fn plan_context(
    m: &Module,
    a: &Analysis,
    ctx: Twin,
    twin_index: &mut dyn FnMut(Twin) -> u32,
) -> Plan {
    let (f, s_mask, r) = ctx;
    let b = m.body(f);
    let ix = (f - m.n_imports) as usize;
    let n_params = m.sig(f).0.len() as u32;
    let scalar_local = |l: u32| -> bool {
        if l < n_params {
            l < 64 && s_mask & (1u64 << l) != 0
        } else {
            a.fo_local[ix].contains(&l)
        }
    };
    let local_record = |l: u32| -> Option<u32> {
        match m.local_type(f, l)? {
            ValType::Ref(rf) => concrete_index(rf.heap_type()),
            _ => None,
        }
    };
    let mut acts: HashMap<u32, Act> = HashMap::new();
    // Ordinals of producer calls whose result must come back as fields.
    let mut r_calls: HashSet<u32> = HashSet::new();
    // Scalarized locals' own gets and sets, and the `struct.new` a set takes.
    for i in &b.ins {
        match i.kind {
            Kind::LocalGet(l) if scalar_local(l) && i.reach => {
                if let Next::StructGet(_, field) = i.next {
                    acts.insert(i.k, Act::GetFields(l, Some(field)));
                    acts.insert(i.k + 1, Act::Delete);
                } else if r && i.next == Next::Exit {
                    acts.insert(i.k, Act::GetFields(l, None));
                } else if matches!(i.next, Next::LocalSet(q) if q >= n_params && scalar_local(q)) {
                    acts.insert(i.k, Act::GetFields(l, None));
                }
                // Otherwise it is a field argument, planned with its call below.
            }
            Kind::LocalSet(l) if l >= n_params && scalar_local(l) && i.reach => {
                acts.insert(i.k, Act::SetFields(l));
                if let Some(src) = b.at(i.top) {
                    if let Kind::StructNew(_) = src.kind {
                        acts.insert(src.k, Act::Delete);
                    }
                }
            }
            _ => {}
        }
    }
    // The exits of a result twin: a `struct.new` handed back is deleted, a producer call
    // returns fields, a field parameter is pushed field by field; anything else is read.
    if r {
        for i in &b.ins {
            if i.kind != Kind::Exit {
                continue;
            }
            let src = (i.reach && i.top != NONE).then(|| b.at(i.top)).flatten();
            match src.map(|s| s.kind) {
                Some(Kind::Call(h))
                    if a.producer.contains(&h)
                        && i.top + 1 == i.k
                        && same_record_result(m, f, h) =>
                {
                    r_calls.insert(i.top);
                }
                Some(Kind::StructNew(st))
                    if result_record(m, f).is_some_and(|rt| same_shape(m, st, rt)) =>
                {
                    acts.insert(i.top, Act::Delete);
                }
                Some(Kind::LocalGet(l)) if scalar_local(l) && i.top + 1 == i.k => {}
                _ => {
                    acts.insert(i.k, Act::ExtractExit);
                }
            }
        }
    }
    for i in b.ins.iter().rev() {
        let Some(h) = callee_of(i) else { continue };
        if !i.reach {
            continue;
        }
        let tail = matches!(i.kind, Kind::ReturnCall(_));
        // This call's own use.
        let mut rr = if tail { r } else { r_calls.contains(&i.k) };
        if !tail && !rr && a.producer.contains(&h) {
            let rt = result_record(m, h).expect("a producer returns a record");
            match i.next {
                Next::StructGet(st, field) if same_shape(m, st, rt) => {
                    rr = true;
                    acts.insert(i.k + 1, Act::PickField(field));
                }
                Next::LocalSet(l) if l >= n_params && scalar_local(l) => rr = true,
                _ => {}
            }
        }
        let fo = if rr { &a.fo_param_r } else { &a.fo_param };
        // Which arguments it passes as fields.
        let mut s = 0u64;
        for (j, &q) in b.args_of(i).iter().enumerate() {
            let j = j as u32;
            if q == NONE || j >= 64 || !fo.contains(&(h, j)) {
                continue;
            }
            let pt = param_record(m, h, j).expect("a field-only parameter names a record");
            let Some(src) = b.at(q) else { continue };
            let ok = match src.kind {
                Kind::Call(g) => {
                    a.producer.contains(&g)
                        && result_record(m, g).is_some_and(|rt| same_shape(m, rt, pt))
                }
                Kind::StructNew(st) => same_shape(m, st, pt),
                Kind::LocalGet(l) => {
                    scalar_local(l) && local_record(l).is_some_and(|lt| same_shape(m, lt, pt))
                }
                _ => false,
            };
            if !ok {
                continue;
            }
            s |= 1u64 << j;
            match src.kind {
                Kind::Call(_) => {
                    r_calls.insert(q);
                }
                Kind::StructNew(_) => {
                    acts.insert(q, Act::Delete);
                }
                Kind::LocalGet(l) => {
                    acts.insert(q, Act::GetFields(l, None));
                }
                _ => {}
            }
        }
        if s == 0 && !rr {
            continue;
        }
        let to = twin_index((h, s, rr));
        acts.insert(i.k, Act::Call(to, tail));
    }
    Plan { acts }
}

pub(crate) fn put_uleb(out: &mut Vec<u8>, mut v: u64) {
    loop {
        let byte = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

pub(crate) fn put_sleb(out: &mut Vec<u8>, mut v: i64) {
    loop {
        let byte = (v & 0x7f) as u8;
        v >>= 7;
        let done = (v == 0 && byte & 0x40 == 0) || (v == -1 && byte & 0x40 != 0);
        out.push(if done { byte } else { byte | 0x80 });
        if done {
            return;
        }
    }
}

pub(crate) fn put_val(out: &mut Vec<u8>, v: ValType) -> Option<()> {
    match v {
        ValType::I32 => out.push(0x7f),
        ValType::I64 => out.push(0x7e),
        ValType::F32 => out.push(0x7d),
        ValType::F64 => out.push(0x7c),
        ValType::V128 => out.push(0x7b),
        ValType::Ref(r) => {
            out.push(if r.is_nullable() { 0x63 } else { 0x64 });
            match r.heap_type() {
                HeapType::Concrete(UnpackedIndex::Module(i)) => put_sleb(out, i as i64),
                HeapType::Abstract { shared: false, ty } => out.push(match ty {
                    AbstractHeapType::Func => 0x70,
                    AbstractHeapType::Extern => 0x6f,
                    AbstractHeapType::Any => 0x6e,
                    AbstractHeapType::None => 0x71,
                    AbstractHeapType::NoExtern => 0x72,
                    AbstractHeapType::NoFunc => 0x73,
                    AbstractHeapType::Eq => 0x6d,
                    AbstractHeapType::Struct => 0x6b,
                    AbstractHeapType::Array => 0x6a,
                    AbstractHeapType::I31 => 0x6c,
                    AbstractHeapType::Exn => 0x69,
                    AbstractHeapType::NoExn => 0x74,
                    _ => return None,
                }),
                _ => return None,
            }
        }
    }
    Some(())
}

fn fields_of(m: &Module, t: u32) -> Vec<Num> {
    m.shape_of_type(t)
        .map_or_else(Vec::new, |s| s.0.iter().map(|&(n, _)| n).collect())
}

/// A twin's signature.
fn twin_sig(m: &Module, (f, s, r): Twin) -> (Vec<ValType>, Vec<ValType>) {
    let (ps, rs) = m.sig(f);
    let mut params = Vec::new();
    for (j, &p) in ps.iter().enumerate() {
        if j < 64 && s & (1u64 << j) != 0 {
            let t = param_record(m, f, j as u32).expect("a twin's field parameter is a record");
            params.extend(fields_of(m, t).into_iter().map(Num::val));
        } else {
            params.push(p);
        }
    }
    let results = if r {
        fields_of(
            m,
            result_record(m, f).expect("a result twin's function is a producer"),
        )
        .into_iter()
        .map(Num::val)
        .collect()
    } else {
        rs.clone()
    };
    (params, results)
}

/// The body of `ctx` rewritten by `plan`, with each op's old module offset beside its new
/// offset in the body, or `None` when an op will not decode or encode.
fn emit_body(
    m: &Module,
    a: &Analysis,
    ctx: Twin,
    plan: &Plan,
) -> Option<(Vec<u8>, Vec<(u32, u32)>)> {
    let (f, s, r) = ctx;
    let b = m.body(f);
    let ix = (f - m.n_imports) as usize;
    let ps = &m.sig(f).0;
    let n_params = ps.len() as u32;
    // Old local index to new: a field parameter widens to its fields.
    let mut param_new: Vec<u32> = Vec::with_capacity(ps.len());
    let mut at = 0u32;
    for j in 0..n_params {
        param_new.push(at);
        at += if j < 64 && s & (1u64 << j) != 0 {
            fields_of(m, param_record(m, f, j)?).len() as u32
        } else {
            1
        };
    }
    let shift = at - n_params;
    let n_declared: u32 = b.locals.iter().map(|&(n, _)| n).sum();
    let mut next_local = at + n_declared;
    let mut extra: Vec<ValType> = Vec::new();
    let mut new_local = |t: ValType, extra: &mut Vec<ValType>| {
        extra.push(t);
        next_local += 1;
        next_local - 1
    };
    // Field slots of each scalarized local.
    let mut slots: HashMap<u32, (u32, Vec<Num>)> = HashMap::new();
    for j in 0..n_params {
        if j < 64 && s & (1u64 << j) != 0 {
            slots.insert(
                j,
                (param_new[j as usize], fields_of(m, param_record(m, f, j)?)),
            );
        }
    }
    let mut fo_locals: Vec<u32> = a.fo_local[ix].iter().copied().collect();
    fo_locals.sort_unstable();
    for l in fo_locals {
        let Some(ValType::Ref(rf)) = m.local_type(f, l) else {
            return None;
        };
        let fs = fields_of(m, concrete_index(rf.heap_type())?);
        let mut base = None;
        for &n in &fs {
            let x = new_local(n.val(), &mut extra);
            base.get_or_insert(x);
        }
        slots.insert(l, (base?, fs));
    }
    let remap = |l: u32| -> u32 {
        if l < n_params {
            param_new[l as usize]
        } else {
            l + shift
        }
    };
    let mut scratch_num: HashMap<Num, u32> = HashMap::new();
    let mut scratch_ref: Option<u32> = None;
    let result_t = if r { result_record(m, f) } else { None };
    let mut code: Vec<u8> = Vec::with_capacity(b.range.1 - b.ops_start + 16);
    let bytes = m.bytes;
    let mut ops = wasmparser::OperatorsReader::new(wasmparser::BinaryReader::new(
        &bytes[b.ops_start..b.range.1],
        b.ops_start,
    ));
    let mut k: u32 = 0;
    let mut moved: Vec<(u32, u32)> = Vec::new();
    // The callee's field count for a pick after a twin call.
    let mut last_call_fields: usize = 0;
    while !ops.eof() {
        let (op, off) = ops.read_with_offset().ok()?;
        let end = if ops.eof() {
            b.range.1
        } else {
            ops.original_position()
        };
        let raw = &bytes[off..end];
        moved.push((off as u32, code.len() as u32));
        match plan.acts.get(&k) {
            Some(Act::Delete) => {}
            Some(Act::Call(to, tail)) => {
                code.push(if *tail { 0x12 } else { 0x10 });
                put_uleb(&mut code, *to as u64);
                if let Operator::Call { function_index } = op {
                    last_call_fields =
                        result_record(m, function_index).map_or(0, |t| fields_of(m, t).len());
                }
            }
            Some(Act::GetFields(l, which)) => {
                let (base, fs) = slots.get(l)?;
                match which {
                    Some(i) => {
                        code.push(0x20);
                        put_uleb(&mut code, (*base + *i) as u64);
                    }
                    None => {
                        for i in 0..fs.len() as u32 {
                            code.push(0x20);
                            put_uleb(&mut code, (*base + i) as u64);
                        }
                    }
                }
            }
            Some(Act::SetFields(l)) => {
                let (base, fs) = slots.get(l)?;
                for i in (0..fs.len() as u32).rev() {
                    code.push(0x21);
                    put_uleb(&mut code, (*base + i) as u64);
                }
            }
            Some(Act::PickField(i)) => {
                let n = last_call_fields as u32;
                let i = *i;
                if n == 0 || i >= n {
                    return None;
                }
                for _ in i + 1..n {
                    code.push(0x1a);
                }
                if i > 0 {
                    let Operator::StructGet {
                        struct_type_index, ..
                    } = op
                    else {
                        return None;
                    };
                    let fs = fields_of(m, struct_type_index);
                    let fnum = *fs.get(i as usize)?;
                    let sl = match scratch_num.get(&fnum) {
                        Some(&x) => x,
                        None => {
                            let x = new_local(fnum.val(), &mut extra);
                            scratch_num.insert(fnum, x);
                            x
                        }
                    };
                    code.push(0x21);
                    put_uleb(&mut code, sl as u64);
                    for _ in 0..i {
                        code.push(0x1a);
                    }
                    code.push(0x20);
                    put_uleb(&mut code, sl as u64);
                }
            }
            Some(Act::ExtractExit) => {
                let t = result_t?;
                let sl = match scratch_ref {
                    Some(x) => x,
                    None => {
                        let x = new_local(
                            ValType::Ref(wasmparser::RefType::new(
                                true,
                                HeapType::Concrete(UnpackedIndex::Module(t)),
                            )?),
                            &mut extra,
                        );
                        scratch_ref = Some(x);
                        x
                    }
                };
                code.push(0x21);
                put_uleb(&mut code, sl as u64);
                for i in 0..fields_of(m, t).len() as u32 {
                    code.push(0x20);
                    put_uleb(&mut code, sl as u64);
                    code.extend_from_slice(&[0xfb, 0x02]);
                    put_uleb(&mut code, t as u64);
                    put_uleb(&mut code, i as u64);
                }
                code.extend_from_slice(raw);
            }
            None => match op {
                Operator::LocalGet { local_index } if shift > 0 => {
                    code.push(0x20);
                    put_uleb(&mut code, remap(local_index) as u64);
                }
                Operator::LocalSet { local_index } if shift > 0 => {
                    code.push(0x21);
                    put_uleb(&mut code, remap(local_index) as u64);
                }
                Operator::LocalTee { local_index } if shift > 0 => {
                    code.push(0x22);
                    put_uleb(&mut code, remap(local_index) as u64);
                }
                _ => code.extend_from_slice(raw),
            },
        }
        k += 1;
    }
    // A plan's local ops on unscalarized locals in a widened twin were re-encoded above; the
    // planned ones name new slots directly. The header: the old entries, then the new locals.
    let mut lr = wasmparser::BinaryReader::new(&bytes[b.range.0..b.ops_start], b.range.0);
    let n_entries = lr.read_var_u32().ok()?;
    let entries_start = lr.original_position();
    let mut out: Vec<u8> = Vec::with_capacity(code.len() + 32);
    let mut groups: Vec<(u32, ValType)> = Vec::new();
    for t in extra {
        match groups.last_mut() {
            Some((n, gt)) if *gt == t => *n += 1,
            _ => groups.push((1, t)),
        }
    }
    put_uleb(&mut out, (n_entries as usize + groups.len()) as u64);
    out.extend_from_slice(&bytes[entries_start..b.ops_start]);
    for (n, t) in groups {
        put_uleb(&mut out, n as u64);
        put_val(&mut out, t)?;
    }
    let header = out.len() as u32;
    out.extend_from_slice(&code);
    for pair in &mut moved {
        pair.1 += header;
    }
    Some((out, moved))
}

/// One body of the step's output and where its ops came from: the input body `from..to`
/// (a twin's is its function's), and per op `(old offset, new offset)` in the two modules,
/// ascending in both.
pub struct BodyMove {
    pub from: u32,
    pub to: u32,
    pub pairs: Vec<(u32, u32)>,
}

impl BodyMove {
    /// An input offset inside `from..=to` as this body's output offset: the op it falls in
    /// moved as a whole.
    pub fn place(&self, off: u32) -> u32 {
        let i = self.pairs.partition_point(|&(old, _)| old <= off).max(1);
        let (old, new) = self.pairs[i - 1];
        new + off.saturating_sub(old)
    }
}

/// What this step takes apart in a module, for the inline-record step's cost rule: the
/// `(function, parameter)` pairs it takes as fields, so a re-boxed argument there is deleted,
/// and each producer with the record type of its result.
#[derive(Default)]
pub(crate) struct FieldFacts {
    pub(crate) fo_param: HashSet<(u32, u32)>,
    pub(crate) producer: HashMap<u32, u32>,
}

pub(crate) fn field_facts(bytes: &[u8]) -> FieldFacts {
    scan(bytes).map_or_else(FieldFacts::default, |m| {
        let a = analyse(&m);
        FieldFacts {
            producer: a
                .producer
                .iter()
                .filter_map(|&f| result_record(&m, f).map(|t| (f, t)))
                .collect(),
            fo_param: a.fo_param,
        }
    })
}

/// The step: `Some((rewritten module, where each output body came from))`, or `None` when it
/// changes nothing.
pub fn multivalue_step(bytes: &[u8]) -> Option<(Vec<u8>, Vec<BodyMove>)> {
    let explaining = std::env::var_os("VL_MV_EXPLAIN").is_some_and(|v| !v.is_empty() && v != "0");
    step(bytes, explaining).map(|(out, moved, _)| (out, moved))
}

/// What the step would hold field by field in `bytes`, were it run on it: per defined function
/// the locals it scalarizes, and the `(function, parameter)` pairs a call passes as fields.
/// `None` when the step would leave the module untouched, so it scalarizes nothing.
pub(crate) fn scalarized(bytes: &[u8]) -> Option<(Vec<HashSet<u32>>, HashSet<(u32, u32)>)> {
    step(bytes, false).map(|(_, _, a)| (a.fo_local, a.fo_param_r))
}

fn step(bytes: &[u8], explaining: bool) -> Option<(Vec<u8>, Vec<BodyMove>, Analysis)> {
    let Some(m) = scan(bytes) else {
        if explaining {
            eprintln!(
                "mv-explain: step skipped: the module does not validate, or no function takes \
                 or returns a record (a struct of 1 to {MV_RECORD_MAX_FIELDS} numeric fields \
                 that nothing writes)"
            );
        }
        return None;
    };
    let a = analyse(&m);
    if a.producer.is_empty() && a.fo_param.is_empty() {
        if explaining {
            explain(&m, &a, &[], &[]);
        }
        return None;
    }
    let n_funcs = m.func_type.len() as u32;
    let mut twins: Vec<Twin> = Vec::new();
    let mut twin_at: HashMap<Twin, u32> = HashMap::new();
    let mut work: VecDeque<Twin> = VecDeque::new();
    let mut plans: Vec<Plan> = Vec::with_capacity(m.bodies.len());
    let mut too_many = false;
    {
        let mut index = |t: Twin| -> u32 {
            if let Some(&i) = twin_at.get(&t) {
                return i;
            }
            let i = n_funcs + twins.len() as u32;
            twins.push(t);
            twin_at.insert(t, i);
            work.push_back(t);
            i
        };
        for f in m.n_imports..n_funcs {
            plans.push(plan_context(&m, &a, (f, 0, false), &mut index));
        }
    }
    if explaining {
        explain(&m, &a, &plans, &twins);
    }
    let mut twin_plans: Vec<Plan> = Vec::new();
    while let Some(t) = work.pop_front() {
        if twins.len() > MV_MAX_TWINS {
            too_many = true;
            break;
        }
        let mut index = |t: Twin| -> u32 {
            if let Some(&i) = twin_at.get(&t) {
                return i;
            }
            let i = n_funcs + twins.len() as u32;
            twins.push(t);
            twin_at.insert(t, i);
            work.push_back(t);
            i
        };
        twin_plans.push(plan_context(&m, &a, t, &mut index));
    }
    if too_many || twins.is_empty() {
        if explaining && too_many {
            eprintln!("mv-explain: step abandoned: more than {MV_MAX_TWINS} twins");
        }
        return None;
    }
    // The bodies: every original one (rewritten where its plan says), then each twin's.
    // Each original body also keeps its op offsets, old beside new-within-the-body.
    let mut bodies: Vec<std::borrow::Cow<[u8]>> = Vec::with_capacity(m.bodies.len() + twins.len());
    let mut body_moves: Vec<Vec<(u32, u32)>> = Vec::with_capacity(m.bodies.len());
    let mut code_size = 0usize;
    for (i, plan) in plans.iter().enumerate() {
        let f = m.n_imports + i as u32;
        let b = &m.bodies[i];
        code_size += b.range.1 - b.range.0;
        if plan.acts.is_empty() {
            bodies.push(std::borrow::Cow::Borrowed(&bytes[b.range.0..b.range.1]));
            body_moves.push(vec![(b.range.0 as u32, 0)]);
        } else {
            let (body, moves) = emit_body(&m, &a, (f, 0, false), plan)?;
            bodies.push(std::borrow::Cow::Owned(body));
            body_moves.push(
                std::iter::once((b.range.0 as u32, 0))
                    .chain(moves)
                    .collect(),
            );
        }
    }
    let mut growth = 0usize;
    for (t, plan) in twins.iter().zip(&twin_plans) {
        let (body, moves) = emit_body(&m, &a, *t, plan)?;
        growth += body.len();
        bodies.push(std::borrow::Cow::Owned(body));
        let b = m.body(t.0);
        body_moves.push(
            std::iter::once((b.range.0 as u32, 0))
                .chain(moves)
                .collect(),
        );
    }
    // The input body each output body came from.
    let sources: Vec<(u32, u32)> = (0..m.bodies.len())
        .map(|i| m.n_imports + i as u32)
        .chain(twins.iter().map(|t| t.0))
        .map(|f| {
            let r = m.body(f).range;
            (r.0 as u32, r.1 as u32)
        })
        .collect();
    if growth > MV_GROWTH_FLOOR + code_size / 2 {
        if explaining {
            eprintln!(
                "mv-explain: step abandoned: the twins add {growth} bytes, past the bound of \
                 {MV_GROWTH_FLOOR} plus half the {code_size}-byte code section"
            );
        }
        return None;
    }
    // New function types, one per distinct twin signature.
    let n_types = m.func_sig.len() as u32;
    let mut sig_at: HashMap<(Vec<ValType>, Vec<ValType>), u32> = HashMap::new();
    let mut new_types: Vec<u8> = Vec::new();
    let mut twin_types: Vec<u32> = Vec::with_capacity(twins.len());
    for &t in &twins {
        let sig = twin_sig(&m, t);
        let next = n_types + sig_at.len() as u32;
        let ti = *sig_at.entry(sig.clone()).or_insert_with(|| next);
        if ti == next {
            new_types.push(0x60);
            put_uleb(&mut new_types, sig.0.len() as u64);
            for &v in &sig.0 {
                put_val(&mut new_types, v)?;
            }
            put_uleb(&mut new_types, sig.1.len() as u64);
            for &v in &sig.1 {
                put_val(&mut new_types, v)?;
            }
        }
        twin_types.push(ti);
    }
    // Reassemble: the type, function and code sections grow; every other section is copied.
    let mut out = bytes[..8].to_vec();
    let mut moved: Vec<BodyMove> = Vec::new();
    let mut p = 8usize;
    let mut saw = (false, false, false);
    while p < bytes.len() {
        let id = bytes[p];
        let mut q = p + 1;
        let len = super::leb_u32(bytes, &mut q)? as usize;
        let body = bytes.get(q..q.checked_add(len)?)?;
        let section_end = q + len;
        let mut payload: Option<Vec<u8>> = None;
        match id {
            1 => {
                let mut r = 0usize;
                let n = super::leb_u32(body, &mut r)?;
                let mut s = Vec::with_capacity(body.len() + new_types.len() + 4);
                put_uleb(&mut s, (n + sig_at.len() as u32) as u64);
                s.extend_from_slice(&body[r..]);
                s.extend_from_slice(&new_types);
                payload = Some(s);
                saw.0 = true;
            }
            3 => {
                let mut r = 0usize;
                let n = super::leb_u32(body, &mut r)?;
                let mut s = Vec::with_capacity(body.len() + twins.len() * 2 + 4);
                put_uleb(&mut s, (n + twins.len() as u32) as u64);
                s.extend_from_slice(&body[r..]);
                for &ti in &twin_types {
                    put_uleb(&mut s, ti as u64);
                }
                payload = Some(s);
                saw.1 = true;
            }
            10 => {
                let mut s = Vec::with_capacity(body.len() + growth + 16);
                put_uleb(&mut s, bodies.len() as u64);
                let mut starts = Vec::with_capacity(bodies.len());
                for b in &bodies {
                    put_uleb(&mut s, b.len() as u64);
                    starts.push(s.len());
                    s.extend_from_slice(b);
                }
                // The payload lands after the section's id and size.
                let mut head = vec![id];
                put_uleb(&mut head, s.len() as u64);
                let base = (out.len() + head.len()) as u32;
                for ((moves, &at), &(from, to)) in body_moves.iter().zip(&starts).zip(&sources) {
                    let at = base + at as u32;
                    let pairs = moves.iter().map(|&(old, new)| (old, at + new)).collect();
                    moved.push(BodyMove { from, to, pairs });
                }
                payload = Some(s);
                saw.2 = true;
            }
            _ => {}
        }
        match payload {
            Some(s) => {
                out.push(id);
                put_uleb(&mut out, s.len() as u64);
                out.extend_from_slice(&s);
            }
            None => out.extend_from_slice(&bytes[p..section_end]),
        }
        p = section_end;
    }
    if saw != (true, true, true) {
        return None;
    }
    if m.names {
        let originals: Vec<u32> = twins.iter().map(|t| t.0).collect();
        let total = n_funcs + twins.len() as u32;
        // A twin is named after its function, so a trap in it reads as that function.
        let names = function_names(&out);
        out = super::rename_functions(&out, total, |f, cur| {
            if f < n_funcs {
                cur.map(str::to_string)
            } else {
                let o = originals[(f - n_funcs) as usize];
                names.get(&o).map(|n| format!("{n}.mv"))
            }
        })?;
    }
    Some((out, moved, a))
}

/// Why struct type `t` is not one the step takes apart, read off the type section; `None` when
/// its fields alone would qualify it.
fn field_refusal(bytes: &[u8], t: u32) -> Option<&'static str> {
    let mut ix = 0u32;
    for payload in Parser::new(0).parse_all(bytes) {
        let Ok(Payload::TypeSection(r)) = payload else {
            continue;
        };
        for group in r.into_iter().flatten() {
            for sub in group.into_types() {
                if ix == t {
                    let ct = &sub.composite_type;
                    let CompositeInnerType::Struct(st) = &ct.inner else {
                        return Some("not a struct");
                    };
                    if ct.shared || ct.descriptor_idx.is_some() || ct.describes_idx.is_some() {
                        return Some("shared, or has a descriptor");
                    }
                    if st.fields.is_empty() {
                        return Some("has no fields");
                    }
                    if st.fields.len() > MV_RECORD_MAX_FIELDS {
                        return Some("has more fields than the step's bound");
                    }
                    let numeric = |f: &wasmparser::FieldType| match f.element_type {
                        StorageType::Val(v) => Num::of(v).is_some(),
                        _ => false,
                    };
                    return (!st.fields.iter().all(numeric))
                        .then_some("has a field that is not i32, i64, f32 or f64");
                }
                ix += 1;
            }
        }
    }
    Some("not a struct")
}

/// `$VL_MV_EXPLAIN=1`: on stderr, per struct type a function takes or returns, whether the step
/// may take it apart and why not; per function returning a record, whether it gets a result
/// twin and why not, and what each of its call sites that keeps the struct does with it.
fn explain(m: &Module, a: &Analysis, plans: &[Plan], twins: &[Twin]) {
    let names = function_names(m.bytes);
    let name = |f: u32| {
        names
            .get(&f)
            .cloned()
            .unwrap_or_else(|| format!("func {f}"))
    };
    let n_funcs = m.func_type.len() as u32;
    let defined = m.n_imports..n_funcs;
    let ref_type = |v: &ValType| match v {
        ValType::Ref(r) => concrete_index(r.heap_type()).map(|t| (t, r.is_nullable())),
        _ => None,
    };
    let mut seen: Vec<u32> = Vec::new();
    for f in defined.clone() {
        let (ps, rs) = m.sig(f);
        for (t, _) in ps.iter().chain(rs.iter()).filter_map(ref_type) {
            if !seen.contains(&t) && m.func_sig.get(t as usize).is_some_and(|s| s.is_none()) {
                seen.push(t);
            }
        }
    }
    seen.sort_unstable();
    eprintln!(
        "mv-explain: writes are charged by {}",
        if m.by_index {
            "type index and subtyping component (every struct type is in one rec group)"
        } else {
            "shape (struct types span several rec groups), and a subtyped record is refused"
        }
    );
    for &t in &seen {
        let fields = m.shape_all.get(t as usize).cloned().flatten();
        let Some((fs, _)) = &fields else {
            if let Some(why) = field_refusal(m.bytes, t).filter(|w| *w != "not a struct") {
                eprintln!("mv-explain: type {t}: refused: {why}");
            }
            continue;
        };
        let spelled: Vec<&str> = fs
            .iter()
            .map(|(n, _)| match n {
                Num::I32 => "i32",
                Num::I64 => "i64",
                Num::F32 => "f32",
                Num::F64 => "f64",
            })
            .collect();
        let producers: Vec<String> = defined
            .clone()
            .filter(|&g| result_record_any(m, g) == Some(t))
            .take(3)
            .map(name)
            .collect();
        let head = format!(
            "mv-explain: type {t} {{{}}} (returned by {})",
            spelled.join(", "),
            if producers.is_empty() {
                "no function".to_string()
            } else {
                producers.join(", ")
            }
        );
        let comp = m.comp.get(t as usize).copied().unwrap_or(t);
        let family: Vec<u32> = (0..m.comp.len() as u32)
            .filter(|&u| u != t && m.comp[u as usize] == comp)
            .collect();
        if m.shape_of_type(t).is_some() {
            eprintln!("{head}: candidate");
        } else if !m.by_index && !family.is_empty() {
            eprintln!("{head}: refused: in a subtyping relation with type(s) {family:?}");
        } else {
            let culprit = if m.by_index {
                std::iter::once(t)
                    .chain(family.iter().copied())
                    .find(|u| m.writer.contains_key(u))
            } else {
                (0..m.shape_all.len() as u32)
                    .find(|&u| m.writer.contains_key(&u) && m.shape_all[u as usize] == fields)
            };
            match culprit {
                Some(u) if u == t => eprintln!(
                    "{head}: refused: its fields are written (struct.set {t} in {})",
                    name(m.writer[&u])
                ),
                Some(u) => eprintln!(
                    "{head}: refused: type {u}, {}, is written (struct.set {u} in {})",
                    if m.by_index {
                        "in its subtyping component"
                    } else {
                        "of the same shape"
                    },
                    name(m.writer[&u])
                ),
                None => eprintln!("{head}: refused"),
            }
        }
    }
    let consumers: Vec<HashMap<u32, (u32, u32)>> = m.bodies.iter().map(arg_consumers).collect();
    for f in defined.clone() {
        let rs = &m.sig(f).1;
        let Some((t, nullable)) = (rs.len() == 1).then(|| ref_type(&rs[0])).flatten() else {
            continue;
        };
        if m.shape_all.get(t as usize).is_none_or(|s| s.is_none()) {
            continue;
        }
        let why = if m.shape_of_type(t).is_none() {
            Some(format!("its record type {t} is refused (above)"))
        } else if nullable {
            Some("its result is nullable (a `T | null` return)".to_string())
        } else if m.body(f).exits_otherwise {
            Some(
                "a br_if, br_table, br_on_*, try, return_call_ref or return_call_indirect can \
                 leave it with its result"
                    .to_string(),
            )
        } else if !a.producer.contains(&f) {
            Some("it tail-calls a function that gets no result twin".to_string())
        } else {
            None
        };
        if let Some(why) = why {
            eprintln!("mv-explain: {} -> type {t}: no result twin: {why}", name(f));
            continue;
        }
        // Its call sites in the original bodies: read as fields, or kept and why.
        let mut served = 0usize;
        let mut kept: Vec<(String, usize, Vec<String>)> = Vec::new();
        for (ix, plan) in plans.iter().enumerate() {
            let g = m.n_imports + ix as u32;
            let b = &m.bodies[ix];
            for i in &b.ins {
                if i.kind != Kind::Call(f) || !i.reach {
                    continue;
                }
                let as_fields = matches!(plan.acts.get(&i.k), Some(Act::Call(to, _))
                    if *to >= n_funcs
                        && twins.get((*to - n_funcs) as usize).is_some_and(|t| t.2));
                if as_fields {
                    served += 1;
                    continue;
                }
                let reason = match (i.next, consumers[ix].get(&i.k)) {
                    (Next::StructGet(st, _), _) => format!("read by a struct.get of type {st}"),
                    (Next::LocalSet(_), _) => {
                        "held in a local that another use keeps as a struct".to_string()
                    }
                    (Next::Exit, _) => {
                        "returned by the caller (read as fields only inside the caller's own \
                         result twin)"
                            .to_string()
                    }
                    (_, Some(&(ck, j))) => {
                        let h = b.at(ck).and_then(callee_of).map_or_else(String::new, name);
                        format!("passed as argument {j} of {h}, which keeps it as a struct")
                    }
                    _ => "stored (field, array, global), cast, compared, or passed to an import"
                        .to_string(),
                };
                let at = match i.next {
                    Next::LocalSet(l) => format!("{} local {l}", name(g)),
                    _ => name(g),
                };
                match kept.iter_mut().find(|k| k.0 == reason) {
                    Some(k) => {
                        k.1 += 1;
                        if k.2.len() < 3 && !k.2.contains(&at) {
                            k.2.push(at);
                        }
                    }
                    None => kept.push((reason, 1, vec![at])),
                }
            }
        }
        let n_kept: usize = kept.iter().map(|k| k.1).sum();
        eprintln!(
            "mv-explain: {} -> type {t}: result twin; {served} call site(s) read it as fields, \
             {n_kept} keep the struct",
            name(f)
        );
        kept.sort_by(|x, y| y.1.cmp(&x.1));
        for (reason, n, at) in kept {
            eprintln!("mv-explain:     {n} {reason} (in {})", at.join(", "));
        }
    }
}

/// The record-shaped type a function's single reference result names, before any refusal.
fn result_record_any(m: &Module, f: u32) -> Option<u32> {
    let [ValType::Ref(r)] = m.sig(f).1.as_slice() else {
        return None;
    };
    let t = concrete_index(r.heap_type())?;
    m.shape_all.get(t as usize)?.as_ref().map(|_| t)
}

/// Each function's name in the module's `name` section.
pub(crate) fn function_names(bytes: &[u8]) -> HashMap<u32, String> {
    let mut out = HashMap::new();
    for payload in Parser::new(0).parse_all(bytes) {
        let Ok(Payload::CustomSection(c)) = payload else {
            continue;
        };
        if let wasmparser::KnownCustom::Name(r) = c.as_known() {
            for sub in r {
                if let Ok(wasmparser::Name::Function(map)) = sub {
                    for n in map.into_iter().flatten() {
                        out.insert(n.index, n.name.to_string());
                    }
                }
            }
        }
    }
    out
}
