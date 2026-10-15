//! The host's half of the `-O`/`-O3` multi-value step (lane MV, D3625). The step itself, a
//! call whose small record result is only read field by field calling a twin that returns
//! the fields as wasm multi-value results, is the compiler's (`optMultivalue` in
//! `compiler/opt_multivalue.vl`, rung R5 of `docs/internals/optimizer-in-vl.md`).
//!
//! What stays here is the step's analysis as the inline-record and list-flattening steps read
//! it: `field_facts` names the parameters a callee uses field by field and the record types
//! no write reaches, so those steps keep a record the multi-value step would take apart.
//! A record is a struct type no `struct.set` (or atomic write) can reach; judged by index
//! when every struct type sits in one rec group, by shape otherwise (D3630, D3765). Beside it
//! are the wasm encoding helpers (`put_uleb`, `put_sleb`, `put_val`), the body-move map
//! (`BodyMove`) and the name-section reader the other steps share.

use crate::urange;
use std::collections::{HashMap, HashSet};
use wasmparser::{
    AbstractHeapType, CompositeInnerType, FuncValidatorAllocations, HeapType, Operator, Parser,
    Payload, StorageType, TypeRef, UnpackedIndex, ValType, ValidPayload, Validator, WasmFeatures,
};

/// The most fields a record returned as multi-value may have: the size the escape step's
/// `ESCAPE_RECORD_MAX_FIELDS` (`compiler/opt_escape.vl`) already gives ruling (B). A vector
/// (3), a quaternion (4) and plumb's five-field `Quat` fit; a 4x4 matrix (16) does not. Past the return registers (two
/// integer and two float values on x86-64) each field is a store and a load through a return
/// area, which still costs well under the allocation it replaces: measured at 5, 6 and 8 `f64`
/// fields the twin is 2.2-3.1x faster on V8 and 3-6x on wasmtime (DECISIONS.md, D3625). Past
/// eight the copy at every call grows with the record and inlining is the better route.
pub const MV_RECORD_MAX_FIELDS: usize = 8;

/// The most fields a record ARGUMENT taken apart may have. A parameter has no return area: its
/// fields are ordinary arguments, so the bound is where the copy's cost catches up with the
/// allocation's, measured (DECISIONS.md, "`-O` takes a record argument apart up to 64
/// fields"), and a field may be a reference.
pub const MV_ARG_MAX_FIELDS: usize = 64;

/// The most parameters a twin may take, well under engines' limits (V8 accepts 1000): a
/// function's record parameters, in order, may be taken as fields only while its own
/// parameters plus their fields stay within it, so every twin of it does.
const MV_TWIN_MAX_PARAMS: usize = 128;

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
type Shape = (Vec<(ValType, bool)>, bool);

/// Whether a field of this type may be held apart from its record: a number, or a reference
/// the step can spell in a twin's signature (passed through as the same object).
fn field_val(v: ValType) -> bool {
    Num::of(v).is_some() || (matches!(v, ValType::Ref(_)) && put_val(&mut Vec::new(), v).is_some())
}

/// Whether a record of this shape may also be RETURNED as fields: the narrower result bound.
fn result_shape(s: &Shape) -> bool {
    s.0.len() <= MV_RECORD_MAX_FIELDS && s.0.iter().all(|&(v, _)| Num::of(v).is_some())
}

/// What the op after a recorded one is, for the adjacency tests.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Next {
    Other,
    StructGet(u32, u32),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Call(u32),
    ReturnCall(u32),
    LocalGet(u32),
    LocalSet(u32),
    LocalTee(u32),
}

/// One recorded op of a body: its ordinal among the body's ops and what the analysis needs.
#[derive(Clone, Debug)]
struct Ins {
    k: u32,
    kind: Kind,
    reach: bool,
    next: Next,
    /// For a call: the producers of its arguments, as a range into `Body::args`.
    args: (u32, u32),
}

struct Body {
    /// The body's bytes in the module: locals header and operators.
    range: (usize, usize),
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

struct Module {
    n_imports: u32,
    /// Per function (imports first): its type index.
    func_type: Vec<u32>,
    /// Per type index: `Some((params, results))` for a function type.
    func_sig: Vec<Option<(Vec<ValType>, Vec<ValType>)>>,
    /// Per type index: its shape when it is a record the step may take apart.
    record: Vec<Option<Shape>>,
    /// Per type index: its shape when it has a record's fields, before any refusal.
    shape_all: Vec<Option<Shape>>,
    /// Per type index: its shape when it would be a record but for a write, judged by index
    /// (D3765). Such a record is taken apart only as a FRESH argument: a `struct.new` handed
    /// straight to a parameter its callee uses field-only, which nothing else can reach.
    fresh: Vec<Option<Shape>>,
    /// Every struct type sits in one rec group, so two type indices are never one wasm type
    /// and a write is charged by index rather than by shape.
    by_index: bool,
    /// Per type index: the root of its subtyping component (itself when it has none).
    comp: Vec<u32>,
    /// Per written struct type: the first function that writes it.
    writer: HashMap<u32, u32>,
    /// Per record with a reference field that may hold a struct nothing writes: that struct
    /// (`NONE` for an abstract reference).
    nested: HashMap<u32, u32>,
    bodies: Vec<Body>,
    names: bool,
}

impl Module {
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
    /// The shape of a record that may be taken apart as an argument: a record, or a written
    /// one, which only a fresh argument qualifies (D3765).
    fn arg_shape(&self, t: u32) -> Option<&Shape> {
        self.shape_of_type(t)
            .or_else(|| self.fresh.get(t as usize)?.as_ref())
    }
    fn is_fresh_only(&self, t: u32) -> bool {
        self.fresh.get(t as usize).is_some_and(|s| s.is_some())
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
fn scan(bytes: &[u8]) -> Option<Module> {
    let mut m = Module {
        n_imports: 0,
        func_type: Vec::new(),
        func_sig: Vec::new(),
        record: Vec::new(),
        shape_all: Vec::new(),
        fresh: Vec::new(),
        by_index: false,
        comp: Vec::new(),
        writer: HashMap::new(),
        nested: HashMap::new(),
        bodies: Vec::new(),
        names: false,
    };
    let mut supers: Vec<(u32, u32)> = Vec::new();
    // The rec groups that hold a struct type.
    let mut struct_groups: HashSet<usize> = HashSet::new();
    let mut n_groups = 0usize;
    let mut tainted: HashSet<u32> = HashSet::new();
    let mut is_struct: Vec<bool> = Vec::new();
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
                        is_struct.push(matches!(ct.inner, CompositeInnerType::Struct(_)));
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
                                let fields: Option<Vec<(ValType, bool)>> = st
                                    .fields
                                    .iter()
                                    .map(|f| match f.element_type {
                                        StorageType::Val(v) if field_val(v) => Some((v, f.mutable)),
                                        _ => None,
                                    })
                                    .collect();
                                rec = fields
                                    .filter(|fs| !fs.is_empty() && fs.len() <= MV_ARG_MAX_FIELDS)
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
        let span = urange(body.range());
        let mut b = Body {
            range: (span.start, span.end),
            locals,
            ins: Vec::new(),
            args: Vec::new(),
            exits_otherwise: false,
        };
        let f = fi;
        fi += 1;
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
                _ => Next::Other,
            };
            if let Some(li) = last_recorded.take() {
                if b.ins[li].k + 1 == k {
                    b.ins[li].next = as_next;
                }
            }
            let mut record = |kind: Kind, args: &[u32]| {
                let a0 = b.args.len() as u32;
                b.args.extend_from_slice(args);
                b.ins.push(Ins {
                    k,
                    kind,
                    reach,
                    next: Next::Other,
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
                        last_recorded = Some(record(kind, &args));
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
                        last_recorded = Some(record(Kind::LocalGet(*local_index), &[]));
                    }
                }
                Operator::LocalSet { local_index } | Operator::LocalTee { local_index } => {
                    if local_rec.get(*local_index as usize) == Some(&true) {
                        let kind = if matches!(op, Operator::LocalSet { .. }) {
                            Kind::LocalSet(*local_index)
                        } else {
                            Kind::LocalTee(*local_index)
                        };
                        last_recorded = Some(record(kind, &[]));
                    }
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
    m.fresh = vec![None; m.record.len()];
    if m.by_index {
        let written: HashSet<u32> = tainted
            .iter()
            .filter_map(|&t| m.comp.get(t as usize).copied())
            .collect();
        for (t, slot) in m.record.iter_mut().enumerate() {
            if written.contains(&m.comp[t]) {
                m.fresh[t] = slot.take();
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
    // A reference field that may hold a struct nothing writes (judging by shape, any struct).
    let written: HashSet<u32> = tainted
        .iter()
        .filter_map(|&t| m.comp.get(t as usize).copied())
        .collect();
    let sealed = |h: u32| {
        is_struct.get(h as usize) == Some(&true)
            && (!m.by_index || !written.contains(&m.comp[h as usize]))
    };
    for t in 0..m.record.len() {
        let inner = m.arg_shape(t as u32).and_then(|(fs, _)| {
            fs.iter().find_map(|&(v, _)| match v {
                ValType::Ref(r) => match r.heap_type() {
                    HeapType::Abstract {
                        ty: AbstractHeapType::Any | AbstractHeapType::Eq | AbstractHeapType::Struct,
                        ..
                    } => Some(NONE),
                    h => concrete_index(h).filter(|&h| sealed(h)),
                },
                _ => None,
            })
        });
        if let Some(h) = inner {
            m.nested.insert(t as u32, h);
        }
    }
    Some(m)
}

struct Analysis {
    /// The functions whose record result a twin may return as fields.
    producer: HashSet<u32>,
    /// `(f, a)`: parameter `a` of `f` is used field-only.
    fo_param: HashSet<(u32, u32)>,
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

/// The record type a parameter names, a written one included: one a fresh argument may fill.
fn param_arg_record(m: &Module, f: u32, j: u32) -> Option<u32> {
    let ValType::Ref(r) = *m.sig(f).0.get(j as usize)? else {
        return None;
    };
    concrete_index(r.heap_type()).filter(|&t| m.arg_shape(t).is_some())
}

/// `same_shape`, or the same written record type, which only a fresh argument fills.
fn same_arg(m: &Module, a: u32, b: u32) -> bool {
    same_shape(m, a, b) || (a == b && m.is_fresh_only(a))
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
    m.record_of(rs[0])
        .filter(|(_, s)| result_shape(s))
        .map(|(t, _)| t)
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
            return same_arg(m, st, t);
        }
        let ix = (f - m.n_imports) as usize;
        match consumers[ix].get(&i.k) {
            Some(&(ck, j)) => {
                let c = m.body(f).at(ck).expect("a consumer is recorded");
                let h = callee_of(c).expect("a consumer is a call");
                fo.contains(&(h, j))
                    && param_arg_record(m, h, j).is_some_and(|pt| same_arg(m, pt, t))
            }
            None => false,
        }
    };
    // Field-only parameters: a greatest fixpoint over the whole call graph. A record whose
    // reference field may hold a struct nothing writes stays whole for a callee the escape step
    // may inline: that struct may be made fresh beside the record, and the escape step removes
    // both, where taken apart here the inner one is still allocated.
    // The parameters that may be taken apart at all, within `MV_TWIN_MAX_PARAMS`.
    // Records first, then written records, so a fresh-only parameter never takes the width
    // a record parameter had.
    let mut allowed: HashSet<(u32, u32)> = HashSet::new();
    for f in defined() {
        let small = {
            let r = m.body(f).range;
            r.1 - r.0 <= crate::ESCAPE_INLINE_MAX_BYTES
        };
        let mut width = m.sig(f).0.len();
        for fresh in [false, true] {
            for j in 0..m.sig(f).0.len().min(64) as u32 {
                let Some(t) = param_arg_record(m, f, j) else {
                    continue;
                };
                if m.is_fresh_only(t) != fresh {
                    continue;
                }
                let grow = fields_of(m, t).len() - 1;
                if !(small && m.nested.contains_key(&t)) && width + grow <= MV_TWIN_MAX_PARAMS {
                    width += grow;
                    allowed.insert((f, j));
                }
            }
        }
    }
    let mut fo: HashSet<(u32, u32)> = allowed.clone();
    loop {
        let drop: Vec<(u32, u32)> = fo
            .iter()
            .copied()
            .filter(|&(f, a)| {
                let t = param_arg_record(m, f, a).expect("a candidate names a record");
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
    Analysis {
        producer,
        fo_param: fo,
    }
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

fn fields_of(m: &Module, t: u32) -> Vec<ValType> {
    m.arg_shape(t)
        .map_or_else(Vec::new, |s| s.0.iter().map(|&(v, _)| v).collect())
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
            fo_param: without_fresh(&m, a.fo_param),
        }
    })
}

/// `pairs` without the parameters of a written record type: those are taken apart only where
/// the argument is fresh, so the other steps' cost rules may not count on them.
fn without_fresh(m: &Module, mut pairs: HashSet<(u32, u32)>) -> HashSet<(u32, u32)> {
    pairs.retain(|&(f, j)| !param_arg_record(m, f, j).is_some_and(|t| m.is_fresh_only(t)));
    pairs
}

/// What the multi-value step holds field by field in a module: per defined function the locals
/// it scalarizes, and the `(function, parameter)` pairs a call passes as fields. The step itself
/// is the compiler's (`optMultivalueScalarized` in `compiler/opt_multivalue.vl`).
pub(crate) type Scalarized = (Vec<HashSet<u32>>, HashSet<(u32, u32)>);

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
