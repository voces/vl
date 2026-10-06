//! The `-O`/`-O3` inline-record step (lane IR1, sunpa SP-039; docs/internals/inline-records-design.md
//! slice S1): a struct field that holds a small record nobody writes stores the record's fields
//! in the parent instead, so storing one allocates nothing and reading one is a single load.
//!
//! **What qualifies.** A record `V` is a struct type of 1 to `MV_RECORD_MAX_FIELDS` numeric
//! fields such that, over the whole module: no `struct.set` (or atomic write) reaches its
//! subtyping component, as the multi-value step charges writes (D3630); no `ref.eq` or
//! `extern.convert_any` takes an operand whose static type can hold a `V`; no type declares
//! `V` as its supertype, so a `V` slot only ever holds a `V`; and no value that crosses the
//! module boundary (an import's or export's signature, an exposed table or a tag, the
//! signatures those reach, and, under `--stable-layout`, every type reachable from one through
//! fields and elements too) can hold a `V`. Under those four no expression can tell a shared
//! box from a copy, so a read may copy the fields out and a store may copy them in.
//!
//! **The boundary is the signature (owner ruling 2026-10-05, inline-records-design.md §6 Q2).**
//! A record's layout is not part of a module's boundary: only a type a boundary signature names
//! keeps its layout and identity, because a JS host can hold that object but cannot read a
//! struct's fields. A record nested in one (a field, a list element, a union box's payload) may
//! be inlined. A value handed to an `any`/`eq`/`struct` place is still refused when such a
//! reference crosses, since JS may then hold that very object. `vl build --stable-layout`
//! selects the conservative rule, for units linked wasm to wasm or read field by field.
//!
//! A field `j` of a struct `P` is inlined when its type is a reference to such a `V`; every
//! value stored into it in reachable code is non-null by its static type (a nullable record
//! local that validates as non-null is declared so first, and a read of one that a dataflow
//! proves holds no null there is cast) or is read from another inlined field; `P` is never made by `struct.new_default`, a constant expression or an atomic op,
//! and cannot cross the boundary itself; every type `P` is in a subtyping relation with
//! inlines the same field the same way; and no read of the field needs the whole record where
//! it would cost an allocation that sharing the box does not (a read that is field-read, held
//! in a local that is only field-read, or passed to a parameter the multi-value step takes as
//! fields is free). The field becomes `V`'s fields, and later fields shift by `|V| - 1`.
//!
//! **The rewrite.** `struct.new P` takes the fields where the record was: a `struct.new V`
//! operand is deleted (its fields are already on the stack in order), any other operand is
//! read field by field right after the op that produced it, and an operand whose producer is
//! not known is spilled with everything above it. `struct.set P j` holds the stored record in a
//! local, so every source field is read from that one value, then sets the parent's fields.
//! `struct.get P j` followed by a field read of `V` (through an optional `ref.as_non_null`) is
//! one `struct.get`; any other read re-boxes with `struct.new V`, a copy taken at the read, as
//! the language's value semantics require. A stored value is held in a non-null local right
//! after its producer, so the multi-value step, which runs next, sees `call; local.set` with
//! field reads only and gives the producer its twin.
//!
//! **Lists (slice S2).** The same scan finds arrays of such records, and `flat.rs` then
//! flattens each that qualifies into one array of the records' fields, on this step's output.
//!
//! **Safety.** Every struct type must sit in one rec group (VL's emitter puts them there), so
//! changing a parent's fields cannot make two types equal. The output is validated, and on any
//! failure, or anything the step does not parse or re-encode, the input is kept unchanged.
//! Validation cannot see a field index that shifted wrongly and still type-checks, so the
//! fixtures grade by output. `$VL_INLINE_EXPLAIN=1` prints, per record type and per candidate
//! field, why it was taken or not.

use std::collections::{HashMap, HashSet};
use wasmparser::{
    AbstractHeapType, CompositeInnerType, ExternalKind, FieldType, FuncValidatorAllocations,
    HeapType, Operator, Parser, Payload, RefType, StorageType, SubType, TypeRef, UnpackedIndex,
    ValType, ValidPayload, Validator, WasmFeatures,
};

use crate::multivalue::{
    concrete_index, field_facts, function_names, put_uleb, put_val, BodyMove, FieldFacts, Num,
    MV_RECORD_MAX_FIELDS,
};

const NONE: u32 = u32::MAX;

/// One value a parent's inlinable field is given at a `struct.new` or `struct.set`, or an
/// element is given at an array op (`field` is then the operand's position).
#[derive(Clone, Debug)]
pub(crate) struct Opnd {
    pub(crate) field: u32,
    /// Its static type admits null (reachable code only; unreachable code is never run).
    pub(crate) nullable: bool,
    /// The op that pushed it, when that op's top result is exactly this value and it sits in
    /// the consumer's own block segment; `NONE` otherwise.
    pub(crate) prod: u32,
    /// The producer is a `struct.new` of this record type.
    prod_new: Option<u32>,
    /// The producer reads this candidate field: non-null exactly when that field is inlined.
    from_get: Option<(u32, u32)>,
    /// Its static type admits null, but it is read from a local the dataflow proves holds
    /// none there: a store casts it with `ref.as_non_null`, which never traps.
    pub(crate) cast: bool,
}

/// One op the non-null dataflow replays: control flow, a set of a tracked local (and whether
/// the value stored excludes null), or a read of one.
enum Flow<'a> {
    Ctl(Operator<'a>),
    Set(u32, bool),
    Get(u32),
}

/// The `local.get`s (by op) of `flow` that read a non-null value from a nullable local.
fn non_null_gets(flow: &[(u32, Flow)]) -> HashSet<u32> {
    let mut killed: HashMap<u32, HashSet<u32>> = HashMap::new();
    let mut open: Vec<Option<u32>> = Vec::new();
    for (k, f) in flow {
        match f {
            Flow::Ctl(Operator::Loop { .. }) => open.push(Some(*k)),
            Flow::Ctl(
                Operator::Block { .. }
                | Operator::If { .. }
                | Operator::Try { .. }
                | Operator::TryTable { .. },
            ) => open.push(None),
            Flow::Ctl(Operator::End | Operator::Delegate { .. }) => {
                open.pop();
            }
            Flow::Set(l, false) => {
                for lk in open.iter().flatten() {
                    killed.entry(*lk).or_default().insert(*l);
                }
            }
            _ => {}
        }
    }
    let mut asg = Assigned::new();
    let mut out = HashSet::new();
    for (k, f) in flow {
        match f {
            Flow::Ctl(op) => asg.op(op, killed.get(k)),
            Flow::Set(l, nn) => asg.set(*l, *nn),
            Flow::Get(l) => {
                if asg.has(*l) {
                    out.insert(*k);
                }
            }
        }
    }
    out
}

/// Which nullable record locals hold a non-null value, in one forward pass over a body's
/// structured control flow: a local is in the set where on every path the last `local.set` or
/// `local.tee` of it stored a value whose type excludes null. A loop's entry state, less the
/// locals some set inside the loop may make null, holds at every back edge.
struct Assigned {
    /// `None` while the current op is unreachable.
    cur: Option<HashSet<u32>>,
    frames: Vec<AFrame>,
}

struct AFrame {
    is_loop: bool,
    is_if: bool,
    has_else: bool,
    entry: Option<HashSet<u32>>,
    /// The meet of every reachable path to this frame's end; `None` while there is none.
    out: Option<HashSet<u32>>,
}

impl Assigned {
    fn new() -> Assigned {
        Assigned {
            cur: Some(HashSet::new()),
            frames: vec![AFrame {
                is_loop: false,
                is_if: false,
                has_else: false,
                entry: Some(HashSet::new()),
                out: None,
            }],
        }
    }
    fn meet(out: &mut Option<HashSet<u32>>, s: &Option<HashSet<u32>>) {
        if let Some(s) = s {
            match out {
                None => *out = Some(s.clone()),
                Some(o) => o.retain(|l| s.contains(l)),
            }
        }
    }
    fn branch(&mut self, depth: u32) {
        let n = self.frames.len();
        if let Some(fr) = n
            .checked_sub(1 + depth as usize)
            .map(|i| &mut self.frames[i])
        {
            if !fr.is_loop {
                Self::meet(&mut fr.out, &self.cur);
            }
        }
    }
    fn push(&mut self, is_loop: bool, is_if: bool) {
        self.frames.push(AFrame {
            is_loop,
            is_if,
            has_else: false,
            entry: self.cur.clone(),
            out: None,
        });
    }
    /// Track control-flow op `op`; a loop starts without the locals in `killed`.
    fn op(&mut self, op: &Operator, killed: Option<&HashSet<u32>>) {
        match op {
            Operator::Block { .. } | Operator::Try { .. } => self.push(false, false),
            Operator::Loop { .. } => {
                if let (Some(c), Some(kl)) = (&mut self.cur, killed) {
                    c.retain(|l| !kl.contains(l));
                }
                self.push(true, false)
            }
            Operator::If { .. } => self.push(false, true),
            Operator::TryTable { try_table } => {
                // A catch may leave from any point inside, where at least the entry holds.
                for c in &try_table.catches {
                    let l = match c {
                        wasmparser::Catch::One { label, .. }
                        | wasmparser::Catch::OneRef { label, .. }
                        | wasmparser::Catch::All { label }
                        | wasmparser::Catch::AllRef { label } => *label,
                    };
                    self.branch(l);
                }
                self.push(false, false);
            }
            Operator::Else => {
                if let Some(fr) = self.frames.last_mut() {
                    Self::meet(&mut fr.out, &self.cur);
                    fr.has_else = true;
                    self.cur = fr.entry.clone();
                }
            }
            Operator::Catch { .. } | Operator::CatchAll => {
                if let Some(fr) = self.frames.last_mut() {
                    Self::meet(&mut fr.out, &self.cur);
                    self.cur = fr.entry.clone();
                }
            }
            Operator::End | Operator::Delegate { .. } => {
                if let Some(mut fr) = self.frames.pop() {
                    if fr.is_if && !fr.has_else {
                        Self::meet(&mut fr.out, &fr.entry);
                    }
                    Self::meet(&mut fr.out, &self.cur);
                    self.cur = fr.out;
                }
            }
            Operator::Br { relative_depth } => {
                self.branch(*relative_depth);
                self.cur = None;
            }
            Operator::BrIf { relative_depth }
            | Operator::BrOnNull { relative_depth }
            | Operator::BrOnNonNull { relative_depth }
            | Operator::BrOnCast { relative_depth, .. }
            | Operator::BrOnCastFail { relative_depth, .. } => self.branch(*relative_depth),
            Operator::BrTable { targets } => {
                for d in targets.targets().flatten().chain([targets.default()]) {
                    self.branch(d);
                }
                self.cur = None;
            }
            Operator::Return
            | Operator::Unreachable
            | Operator::Throw { .. }
            | Operator::ThrowRef
            | Operator::Rethrow { .. }
            | Operator::ReturnCall { .. }
            | Operator::ReturnCallRef { .. }
            | Operator::ReturnCallIndirect { .. } => self.cur = None,
            _ => {}
        }
    }
    fn set(&mut self, l: u32, non_null: bool) {
        if let Some(c) = &mut self.cur {
            if non_null {
                c.insert(l);
            } else {
                c.remove(&l);
            }
        }
    }
    fn has(&self, l: u32) -> bool {
        self.cur.as_ref().is_some_and(|c| c.contains(&l))
    }
}

/// An op on a candidate array type (slice S2, `flat.rs`).
#[derive(Clone, Debug)]
pub(crate) enum ArrKind {
    NewDefault,
    /// `array.new_fixed`: its operands, bottom first.
    NewFixed(Vec<Opnd>),
    Get,
    Set(Opnd),
    Len,
    Copy,
}

#[derive(Clone, Debug)]
pub(crate) struct ASite {
    pub(crate) k: u32,
    pub(crate) off: u32,
    pub(crate) reach: bool,
    pub(crate) ty: u32,
    pub(crate) kind: ArrKind,
}

/// How one `array.get` of a candidate array type uses the element it reads.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AUse {
    /// A field read of field `x` at op `last`, through an optional `ref.as_non_null`.
    Field { last: u32, x: u32 },
    /// Held in local `l`, predicted to be taken apart (`elem_locals`): re-boxed there, and the
    /// box deleted, by the multi-value step alone when `needs_mv`.
    Local { l: u32, needs_mv: bool },
    /// Passed straight to parameter `arg` of `callee`: free when the multi-value step takes
    /// that parameter as fields.
    Arg { callee: u32, arg: u32 },
    /// Anything else: the read would allocate where today it shares the box.
    Whole,
}

#[derive(Clone, Debug)]
enum SiteKind {
    New(Vec<Opnd>),
    Set(Opnd),
}

#[derive(Clone, Debug)]
struct Site {
    k: u32,
    /// The op's offset in the module, for the explain line.
    off: u32,
    reach: bool,
    ty: u32,
    kind: SiteKind,
}

pub(crate) struct Body {
    pub(crate) range: (usize, usize),
    pub(crate) ops_start: usize,
    /// The locals header with its record locals declared non-null, when that validated.
    pub(crate) tightened: Option<Vec<u8>>,
    /// Parameters plus declared locals.
    pub(crate) n_locals: u32,
    sites: Vec<Site>,
    /// Some op names a candidate parent type, so its field indices may move.
    touches: bool,
    /// The ops on candidate array types, and how each element read (by op) is used (S2).
    pub(crate) asites: Vec<ASite>,
    pub(crate) areads: HashMap<u32, AUse>,
    /// The element reads (by op) a `ref.as_non_null` directly follows.
    pub(crate) cast_after: HashSet<u32>,
}

/// The ops a read's classification looks at; every other op is `Other`.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Small {
    Other,
    Call(u32),
    AsNonNull,
    ArrayGet(u32),
    LocalGet(u32),
    LocalSet(u32),
    LocalTee(u32),
    StructGet(u32, u32),
    StructNew(u32),
}

/// How the reads of one candidate field use the record they get.
#[derive(Clone, Copy, Default)]
struct ReadTally {
    /// Followed by a field read of the record: one `struct.get` of the parent.
    field: u32,
    /// Held in a local that is set once and only ever field-read: re-boxed, and the box is
    /// scalarized by binaryen's heap2local.
    local: u32,
    /// Passed straight to a parameter the multi-value step takes as fields: the re-box is
    /// deleted there.
    arg: u32,
    /// Anything else: the read would allocate where today it shares the box.
    whole: u32,
    whole_in: Option<u32>,
}

/// What can hold a value whose identity some op observes.
#[derive(Clone, Copy)]
pub(crate) enum Holder {
    Concrete(u32),
    /// `any`, `eq` or `struct`: every record.
    Any,
}

pub(crate) struct Scan {
    pub(crate) subs: Vec<SubType>,
    /// Per rec group: whether it was written explicitly, and its type count.
    pub(crate) groups: Vec<(bool, usize)>,
    func_type: Vec<u32>,
    pub(crate) n_imports: u32,
    /// Per type: its fields as numbers when it is a record-shaped struct.
    pub(crate) rec: Vec<Option<Vec<Num>>>,
    pub(crate) has_sub: Vec<bool>,
    comp: Vec<u32>,
    /// Per (parent, field): the record type the field holds, for every field that could be inlined.
    potential: HashMap<(u32, u32), u32>,
    /// Per array type whose element is a reference to a leaf record of one number type: that
    /// record (S2).
    pub(crate) arrays: HashMap<u32, u32>,
    /// Per candidate array type: an op on it the flattening cannot rewrite, as (op, function).
    pub(crate) arr_bad: HashMap<u32, (String, u32)>,
    /// The record types of `potential` and `arrays`.
    records: HashSet<u32>,
    parents: HashSet<u32>,
    writer: HashMap<u32, u32>,
    default_made: HashMap<u32, u32>,
    atomic_on: HashMap<u32, u32>,
    const_made: HashSet<u32>,
    identity: Vec<(Holder, u32)>,
    /// The value types of imports, exports and exposed tables.
    boundary: Vec<(Holder, String)>,
    /// Every type a value crossing the boundary can reach, through fields, elements and
    /// function signatures, with the boundary it crosses; `crossing_any` when one of them is
    /// an abstract `any`, `eq` or `struct` reference, which can hold every record.
    crossing: HashMap<u32, String>,
    crossing_any: Option<String>,
    /// The concrete types some op hands to a place typed `any`, `eq` or `struct` (a union
    /// box's payload, say): only a record one of them can hold is carried by `crossing_any`.
    erased: HashMap<u32, u32>,
    /// Some op handed an abstract place a value whose type could not be mapped back.
    erased_any: Option<u32>,
    pub(crate) bodies: Vec<Body>,
    reads: HashMap<(u32, u32), ReadTally>,
    /// Reads passed straight to a call, as (parent, field, callee, argument, function).
    arg_reads: Vec<(u32, u32, u32, u32, u32)>,
    /// The multi-value step's facts about the scanned module, made on first use.
    pub(crate) mv: std::cell::OnceCell<FieldFacts>,
}

fn holder_of(v: ValType) -> Option<Holder> {
    let ValType::Ref(r) = v else { return None };
    match r.heap_type() {
        HeapType::Abstract { ty, .. } => matches!(
            ty,
            AbstractHeapType::Any | AbstractHeapType::Eq | AbstractHeapType::Struct
        )
        .then_some(Holder::Any),
        h => concrete_index(h).map(Holder::Concrete),
    }
}

/// `holder_of` for a type the validator answers: its concrete types are canonical ids, which
/// `ids` maps back to module type indices. An id it cannot map holds every record.
fn holder_of_operand(
    v: ValType,
    ids: &HashMap<wasmparser::types::CoreTypeId, Vec<u32>>,
) -> Option<Holder> {
    let ValType::Ref(r) = v else { return None };
    match r.heap_type() {
        HeapType::Concrete(UnpackedIndex::Id(id)) | HeapType::Exact(UnpackedIndex::Id(id)) => {
            Some(match ids.get(&id).map(Vec::as_slice) {
                Some(&[t]) => Holder::Concrete(t),
                _ => Holder::Any,
            })
        }
        _ => holder_of(v),
    }
}

impl Scan {
    /// The value types a value of type `t` carries: its fields, its element, or its
    /// signature's (only a signature's when `direct`).
    fn inner_types(&self, t: u32, direct: bool) -> Vec<ValType> {
        match &self.subs[t as usize].composite_type.inner {
            CompositeInnerType::Struct(_) | CompositeInnerType::Array(_) if direct => Vec::new(),
            CompositeInnerType::Struct(st) => st
                .fields
                .iter()
                .filter_map(|f| match f.element_type {
                    StorageType::Val(v) => Some(v),
                    _ => None,
                })
                .collect(),
            CompositeInnerType::Array(at) => match at.0.element_type {
                StorageType::Val(v) => vec![v],
                _ => Vec::new(),
            },
            CompositeInnerType::Func(ft) => {
                ft.params().iter().chain(ft.results()).copied().collect()
            }
            CompositeInnerType::Cont(_) => Vec::new(),
        }
    }
    pub(crate) fn sig(&self, t: u32) -> Option<(Vec<ValType>, Vec<ValType>)> {
        match &self.subs.get(t as usize)?.composite_type.inner {
            CompositeInnerType::Func(ft) => Some((ft.params().to_vec(), ft.results().to_vec())),
            _ => None,
        }
    }
    pub(crate) fn fields(&self, t: u32) -> &[FieldType] {
        match self.subs.get(t as usize).map(|s| &s.composite_type.inner) {
            Some(CompositeInnerType::Struct(st)) => &st.fields,
            _ => &[],
        }
    }
    pub(crate) fn supertype(&self, t: u32) -> Option<u32> {
        self.subs
            .get(t as usize)?
            .supertype_idx
            .and_then(|p| p.as_module_index())
    }
    /// Whether a value of type `v` may stand where `h` is expected.
    pub(crate) fn holds(&self, h: Holder, v: u32) -> bool {
        match h {
            Holder::Any => true,
            Holder::Concrete(t) => {
                let mut u = Some(v);
                let mut guard = 0;
                while let Some(x) = u {
                    if x == t {
                        return true;
                    }
                    guard += 1;
                    if guard > self.subs.len() {
                        return false;
                    }
                    u = self.supertype(x);
                }
                false
            }
        }
    }
}

/// Parse the module and walk every body under the validator. `None` when it does not parse or
/// validate, or has no field the step could inline; `Err` names why the step declines outright.
pub(crate) fn scan(bytes: &[u8], stable_layout: bool) -> Result<Option<Scan>, String> {
    let mut s = Scan {
        subs: Vec::new(),
        groups: Vec::new(),
        func_type: Vec::new(),
        n_imports: 0,
        rec: Vec::new(),
        has_sub: Vec::new(),
        comp: Vec::new(),
        potential: HashMap::new(),
        arrays: HashMap::new(),
        arr_bad: HashMap::new(),
        records: HashSet::new(),
        parents: HashSet::new(),
        writer: HashMap::new(),
        default_made: HashMap::new(),
        atomic_on: HashMap::new(),
        const_made: HashSet::new(),
        identity: Vec::new(),
        boundary: Vec::new(),
        crossing: HashMap::new(),
        crossing_any: None,
        erased: HashMap::new(),
        erased_any: None,
        bodies: Vec::new(),
        reads: HashMap::new(),
        arg_reads: Vec::new(),
        mv: std::cell::OnceCell::new(),
    };
    let mut struct_groups = 0usize;
    let mut globals: Vec<ValType> = Vec::new();
    let mut tables: Vec<ValType> = Vec::new();
    let mut tags: Vec<u32> = Vec::new();
    let mut table_imported = false;
    let mut exports: Vec<(ExternalKind, u32, String)> = Vec::new();
    let mut import_tys: Vec<(ValType, String)> = Vec::new();
    let mut const_exprs: Vec<wasmparser::ConstExpr> = Vec::new();
    let bad = |_| "the module does not parse".to_string();
    for payload in Parser::new(0).parse_all(bytes) {
        match payload.map_err(bad)? {
            Payload::TypeSection(r) => {
                for group in r {
                    let group = group.map_err(bad)?;
                    let explicit = group.is_explicit_rec_group();
                    let mut n = 0usize;
                    let mut has_struct = false;
                    for sub in group.into_types() {
                        if matches!(sub.composite_type.inner, CompositeInnerType::Struct(_)) {
                            has_struct = true;
                        }
                        s.subs.push(sub);
                        n += 1;
                    }
                    if has_struct {
                        struct_groups += 1;
                    }
                    s.groups.push((explicit, n));
                }
            }
            Payload::ImportSection(r) => {
                for imp in r.into_imports() {
                    let imp = imp.map_err(bad)?;
                    let what = format!("import {}.{}", imp.module, imp.name);
                    match imp.ty {
                        TypeRef::Func(t) | TypeRef::FuncExact(t) => {
                            s.func_type.push(t);
                            s.n_imports += 1;
                            if let Some((ps, rs)) = s.sig(t) {
                                for v in ps.into_iter().chain(rs) {
                                    import_tys.push((v, what.clone()));
                                }
                            }
                        }
                        TypeRef::Global(g) => {
                            globals.push(g.content_type);
                            import_tys.push((g.content_type, what));
                        }
                        TypeRef::Table(t) => {
                            table_imported = true;
                            tables.push(ValType::Ref(t.element_type));
                            import_tys.push((ValType::Ref(t.element_type), what));
                        }
                        TypeRef::Tag(t) => {
                            tags.push(t.func_type_idx);
                            if let Some((ps, _)) = s.sig(t.func_type_idx) {
                                for v in ps {
                                    import_tys.push((v, what.clone()));
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            Payload::FunctionSection(r) => {
                for t in r {
                    s.func_type.push(t.map_err(bad)?);
                }
            }
            Payload::TableSection(r) => {
                for t in r {
                    let t = t.map_err(bad)?;
                    tables.push(ValType::Ref(t.ty.element_type));
                    if let wasmparser::TableInit::Expr(e) = t.init {
                        const_exprs.push(e);
                    }
                }
            }
            Payload::TagSection(r) => {
                for t in r {
                    tags.push(t.map_err(bad)?.func_type_idx);
                }
            }
            Payload::GlobalSection(r) => {
                for g in r {
                    let g = g.map_err(bad)?;
                    globals.push(g.ty.content_type);
                    const_exprs.push(g.init_expr);
                }
            }
            Payload::ExportSection(r) => {
                for e in r {
                    let e = e.map_err(bad)?;
                    exports.push((e.kind, e.index, e.name.to_string()));
                }
            }
            Payload::ElementSection(r) => {
                for e in r {
                    let e = e.map_err(bad)?;
                    if let wasmparser::ElementItems::Expressions(_, items) = e.items {
                        for x in items {
                            const_exprs.push(x.map_err(bad)?);
                        }
                    }
                }
            }
            Payload::CustomSection(c) if c.name() == "name" => {
                if let wasmparser::KnownCustom::Name(r) = c.as_known() {
                    for sub in r {
                        if matches!(sub, Ok(wasmparser::Name::Field(_))) {
                            return Err("the name section names struct fields".into());
                        }
                    }
                }
            }
            _ => {}
        }
    }
    if struct_groups > 1 {
        return Err(
            "struct types span several rec groups, so a changed parent could \
                    become equal to another type"
                .into(),
        );
    }
    let n_types = s.subs.len();
    s.has_sub = vec![false; n_types];
    s.comp = (0..n_types as u32).collect();
    fn root(c: &mut [u32], mut t: u32) -> u32 {
        while c[t as usize] != t {
            c[t as usize] = c[c[t as usize] as usize];
            t = c[t as usize];
        }
        t
    }
    for t in 0..n_types as u32 {
        if let Some(sup) = s.supertype(t).filter(|&p| (p as usize) < n_types) {
            s.has_sub[sup as usize] = true;
            let (ra, rb) = (root(&mut s.comp, t), root(&mut s.comp, sup));
            s.comp[ra.max(rb) as usize] = ra.min(rb);
        }
    }
    for t in 0..n_types as u32 {
        let r = root(&mut s.comp, t);
        s.comp[t as usize] = r;
    }
    let plain = |sub: &SubType| {
        !sub.composite_type.shared
            && sub.composite_type.descriptor_idx.is_none()
            && sub.composite_type.describes_idx.is_none()
    };
    for sub in &s.subs {
        let rec = match &sub.composite_type.inner {
            CompositeInnerType::Struct(st) if plain(sub) => st
                .fields
                .iter()
                .map(|f| match f.element_type {
                    StorageType::Val(v) => Num::of(v),
                    _ => None,
                })
                .collect::<Option<Vec<Num>>>()
                .filter(|fs| !fs.is_empty() && fs.len() <= MV_RECORD_MAX_FIELDS),
            _ => None,
        };
        s.rec.push(rec);
    }
    for (p, sub) in s.subs.iter().enumerate() {
        let CompositeInnerType::Struct(st) = &sub.composite_type.inner else {
            continue;
        };
        if !plain(sub) {
            continue;
        }
        for (j, f) in st.fields.iter().enumerate() {
            let StorageType::Val(ValType::Ref(r)) = f.element_type else {
                continue;
            };
            let Some(v) = concrete_index(r.heap_type()) else {
                continue;
            };
            if s.rec.get(v as usize).is_some_and(|x| x.is_some()) && !s.has_sub[v as usize] {
                s.potential.insert((p as u32, j as u32), v);
                s.parents.insert(p as u32);
            }
        }
    }
    // S2's candidates: an array of references to a leaf record whose fields share one number
    // type, so its elements can sit side by side in one array of that number.
    for (a, sub) in s.subs.iter().enumerate() {
        let CompositeInnerType::Array(at) = &sub.composite_type.inner else {
            continue;
        };
        let StorageType::Val(ValType::Ref(r)) = at.0.element_type else {
            continue;
        };
        let Some(v) = concrete_index(r.heap_type()) else {
            continue;
        };
        let uniform = s
            .rec
            .get(v as usize)
            .and_then(|x| x.as_ref())
            .is_some_and(|fs| fs.iter().all(|&n| n == fs[0]));
        if plain(sub) && uniform && !s.has_sub[v as usize] {
            s.arrays.insert(a as u32, v);
        }
    }
    if s.potential.is_empty() && s.arrays.is_empty() {
        return Ok(None);
    }
    s.records = s
        .potential
        .values()
        .chain(s.arrays.values())
        .copied()
        .collect();
    // What crosses the module boundary, and what constant expressions build.
    for (v, what) in import_tys {
        if let Some(h) = holder_of(v) {
            s.boundary.push((h, what));
        }
    }
    let tables_exposed = table_imported || exports.iter().any(|e| e.0 == ExternalKind::Table);
    for (kind, ix, name) in &exports {
        let what = format!("export {name}");
        let tys: Vec<ValType> = match kind {
            ExternalKind::Func | ExternalKind::FuncExact => s
                .func_type
                .get(*ix as usize)
                .and_then(|&t| s.sig(t))
                .map(|(ps, rs)| ps.into_iter().chain(rs).collect())
                .unwrap_or_default(),
            ExternalKind::Global => globals.get(*ix as usize).copied().into_iter().collect(),
            ExternalKind::Table => tables.get(*ix as usize).copied().into_iter().collect(),
            ExternalKind::Tag => tags
                .get(*ix as usize)
                .and_then(|&t| s.sig(t))
                .map(|(ps, _)| ps)
                .unwrap_or_default(),
            _ => Vec::new(),
        };
        for v in tys {
            if let Some(h) = holder_of(v) {
                s.boundary.push((h, what.clone()));
            }
        }
    }
    if tables_exposed {
        // Any function may be reached through an exposed table.
        for f in s.n_imports as usize..s.func_type.len() {
            if let Some((ps, rs)) = s.sig(s.func_type[f]) {
                for v in ps.into_iter().chain(rs) {
                    if let Some(h) = holder_of(v) {
                        s.boundary
                            .push((h, "a function in an exposed table".into()));
                    }
                }
            }
        }
    }
    // What crosses: the types a boundary signature names, and the signatures they reach. A JS
    // host cannot read a struct's fields, so fields and elements are followed only under
    // `--stable-layout`, where everything a crossing value reaches keeps its layout.
    let direct = !stable_layout;
    let mut work: Vec<(u32, String)> = Vec::new();
    for (h, what) in &s.boundary {
        match h {
            Holder::Any => {
                s.crossing_any.get_or_insert_with(|| what.clone());
            }
            Holder::Concrete(t) => work.push((*t, what.clone())),
        }
    }
    while let Some((t, what)) = work.pop() {
        if s.crossing.contains_key(&t) || t as usize >= s.subs.len() {
            continue;
        }
        s.crossing.insert(t, what.clone());
        for v in s.inner_types(t, direct) {
            match holder_of(v) {
                Some(Holder::Any) => {
                    s.crossing_any.get_or_insert_with(|| what.clone());
                }
                Some(Holder::Concrete(u)) => work.push((u, what.clone())),
                None => {}
            }
        }
    }
    for e in const_exprs {
        let mut ops = e.get_operators_reader();
        while !ops.eof() {
            match ops.read().map_err(bad)? {
                Operator::StructNew { struct_type_index }
                | Operator::StructNewDefault { struct_type_index } => {
                    s.const_made.insert(struct_type_index);
                }
                // An empty list's backing is the one array a constant expression may make.
                Operator::ArrayNewFixed { array_size: 0, .. } => {}
                Operator::ArrayNew {
                    array_type_index: a,
                }
                | Operator::ArrayNewDefault {
                    array_type_index: a,
                }
                | Operator::ArrayNewFixed {
                    array_type_index: a,
                    ..
                } => {
                    if s.arrays.contains_key(&a) {
                        s.arr_bad
                            .entry(a)
                            .or_insert(("it is made in a constant expression".into(), NONE));
                    }
                }
                _ => {}
            }
        }
    }
    // Every body, under the validator, which answers operand types and the stack's height.
    let mut validator = Validator::new_with_features(WasmFeatures::all());
    let mut allocs = FuncValidatorAllocations::default();
    let mut fi = s.n_imports;
    let invalid = |_| "the module does not validate".to_string();
    // The validator names a concrete operand type by its canonical id, not its module index.
    // Two module types the validator canonicalizes to one id stay ambiguous: such an id
    // holds every record.
    let mut ids: HashMap<wasmparser::types::CoreTypeId, Vec<u32>> = HashMap::new();
    for payload in Parser::new(0).parse_all(bytes) {
        let payload = payload.map_err(bad)?;
        let valid = validator.payload(&payload).map_err(invalid)?;
        if matches!(payload, Payload::TypeSection(_)) {
            let types = validator.types(0).ok_or("no module types")?;
            for t in 0..types.core_type_count_in_module() {
                ids.entry(types.core_type_at_in_module(t))
                    .or_default()
                    .push(t);
            }
        }
        let ValidPayload::Func(to_validate, body) = valid else {
            continue;
        };
        let f = fi;
        fi += 1;
        // A nullable local of a record type that is always set before it is read, and only
        // ever to a non-null value, is declared non-null when the body still validates so; the
        // values a store reads from it are then non-null by their type.
        let start = body.range().start;
        let mut tightened: Option<Vec<u8>> = None;
        if let Some(pb) = tighten(&s, &bytes[start..body.range().end], start) {
            let trial = wasmparser::FuncToValidate {
                resources: to_validate.resources.clone(),
                index: to_validate.index,
                ty: to_validate.ty,
                features: to_validate.features,
            };
            let mut tv = trial.into_validator(std::mem::take(&mut allocs));
            let ok = tv
                .validate(&wasmparser::FunctionBody::new(
                    wasmparser::BinaryReader::new(&pb, start),
                ))
                .is_ok();
            allocs = tv.into_allocations();
            if ok {
                tightened = Some(pb);
            }
        }
        let body = match &tightened {
            Some(pb) => wasmparser::FunctionBody::new(wasmparser::BinaryReader::new(pb, start)),
            None => body,
        };
        let mut fv = to_validate.into_validator(std::mem::take(&mut allocs));
        let n_params = s
            .func_type
            .get(f as usize)
            .and_then(|&t| s.sig(t))
            .map_or(0, |(ps, _)| ps.len() as u32);
        let mut n_locals = n_params;
        let (params, results) = s
            .func_type
            .get(f as usize)
            .and_then(|&t| s.sig(t))
            .unwrap_or_default();
        // Each local's type, run-length: (first index, type).
        let mut local_runs: Vec<(u32, ValType)> = params
            .iter()
            .enumerate()
            .map(|(i, &v)| (i as u32, v))
            .collect();
        let mut lr = body.get_locals_reader().map_err(bad)?;
        for _ in 0..lr.get_count() {
            let off = lr.original_position();
            let (n, t) = lr.read().map_err(bad)?;
            fv.define_locals(off, n, t).map_err(invalid)?;
            local_runs.push((n_locals, t));
            n_locals += n;
        }
        let local_type = |l: u32| -> Option<ValType> {
            let i = local_runs.partition_point(|&(at, _)| at <= l);
            local_runs.get(i.checked_sub(1)?).map(|&(_, t)| t)
        };
        let mut b = Body {
            range: (body.range().start, body.range().end),
            ops_start: lr.original_position(),
            tightened: tightened
                .as_ref()
                .map(|pb| pb[..lr.original_position() - start].to_vec()),
            n_locals,
            sites: Vec::new(),
            touches: false,
            asites: Vec::new(),
            areads: HashMap::new(),
            cast_after: HashSet::new(),
        };
        let mut owner: Vec<u32> = Vec::new();
        let mut post: Vec<u32> = Vec::new();
        let mut new_of: HashMap<u32, u32> = HashMap::new();
        let mut small: Vec<Small> = Vec::new();
        let mut gets: Vec<(u32, u32, u32)> = Vec::new();
        let mut get_at: HashMap<u32, (u32, u32)> = HashMap::new();
        let mut agets: Vec<(u32, u32)> = Vec::new();
        // A nullable record local holds no null where some set reaches every path and no set
        // is of a value whose type admits null: per `local.get`, its local when assigned there.
        let tracked = |l: u32| {
            l >= n_params
                && matches!(local_type(l), Some(ValType::Ref(r))
                    if concrete_index(r.heap_type()).is_some_and(|v| s.records.contains(&v)))
        };
        // The ops that dataflow replays after the walk, with their op index.
        let mut flow: Vec<(u32, Flow)> = Vec::new();
        // Per op that pushed a call's argument: the call's callee and the argument's index.
        let mut arg_of: HashMap<u32, (u32, u32)> = HashMap::new();
        let mut seg: Vec<u32> = vec![0];
        let mut ops = body.get_operators_reader().map_err(bad)?;
        let mut k: u32 = 0;
        while !ops.eof() {
            let (op, off) = ops.read_with_offset().map_err(bad)?;
            let hb = fv.operand_stack_height() as usize;
            let depth = fv.control_stack_height();
            let frame = fv.get_control_frame(0).ok_or("no control frame")?;
            let reach = !frame.unreachable;
            let base = frame.height;
            let seg_lo = *seg.last().ok_or("no segment")?;
            // The producer of stack position `p`, when its top result is exactly `p`.
            let producer = |p: usize| -> u32 {
                if !reach || p < base {
                    return NONE;
                }
                match owner.get(p) {
                    Some(&q) if q != NONE && q >= seg_lo && post[q as usize] as usize == p + 1 => q,
                    _ => NONE,
                }
            };
            let nullable_at = |d: usize| -> bool {
                reach
                    && match fv.get_operand_type(d) {
                        Some(Some(ValType::Ref(r))) => r.is_nullable(),
                        Some(Some(_)) => true,
                        _ => false,
                    }
            };
            let opnd = |field: u32, d: usize| -> Opnd {
                let q = if hb > d { producer(hb - 1 - d) } else { NONE };
                Opnd {
                    field,
                    nullable: nullable_at(d),
                    prod: q,
                    prod_new: (q != NONE).then(|| new_of.get(&q).copied()).flatten(),
                    from_get: (q != NONE).then(|| get_at.get(&q).copied()).flatten(),
                    cast: false,
                }
            };
            if let Operator::Call { function_index } = &op {
                let n = s
                    .func_type
                    .get(*function_index as usize)
                    .and_then(|&t| s.sig(t))
                    .map_or(0, |(ps, _)| ps.len());
                for j in 0..n {
                    if hb >= n {
                        if let Some(&q) = owner.get(hb - n + j) {
                            if reach && q != NONE && q >= seg_lo {
                                arg_of.insert(q, (*function_index, j as u32));
                            }
                        }
                    }
                }
            }
            // A value handed to a place typed `any`, `eq` or `struct` forgets its type there.
            if reach {
                let (want, above) = expected(&s, &op, &fv, &results, &globals, &tags, &local_type);
                let n = want.len();
                for (i, w) in want.iter().enumerate() {
                    if !matches!(holder_of(*w), Some(Holder::Any)) {
                        continue;
                    }
                    let d = above + (n - 1 - i);
                    if let Some(Some(v)) = fv.get_operand_type(d) {
                        match holder_of_operand(v, &ids) {
                            Some(Holder::Concrete(c)) => {
                                s.erased.entry(c).or_insert(f);
                            }
                            // A type the map does not know: every record may be in it.
                            Some(Holder::Any) if !matches!(holder_of(v), Some(Holder::Any)) => {
                                s.erased_any.get_or_insert(f);
                            }
                            _ => {}
                        }
                    }
                }
            }
            match &op {
                Operator::StructNew {
                    struct_type_index: t,
                } => {
                    if s.parents.contains(t) {
                        b.touches = true;
                        let m = s.fields(*t).len();
                        let opnds: Vec<Opnd> = (0..m as u32)
                            .filter(|j| s.potential.contains_key(&(*t, *j)))
                            .map(|j| opnd(j, m - 1 - j as usize))
                            .collect();
                        b.sites.push(Site {
                            k,
                            off: off as u32,
                            reach,
                            ty: *t,
                            kind: SiteKind::New(opnds),
                        });
                    }
                }
                Operator::StructSet {
                    struct_type_index: t,
                    field_index: j,
                } => {
                    s.writer.entry(*t).or_insert(f);
                    if s.parents.contains(t) {
                        b.touches = true;
                        if s.potential.contains_key(&(*t, *j)) {
                            b.sites.push(Site {
                                k,
                                off: off as u32,
                                reach,
                                ty: *t,
                                kind: SiteKind::Set(opnd(*j, 0)),
                            });
                        }
                    }
                }
                Operator::StructGet {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructGetS {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructGetU {
                    struct_type_index: t,
                    ..
                } => {
                    if s.parents.contains(t) {
                        b.touches = true;
                    }
                }
                Operator::StructNewDefault {
                    struct_type_index: t,
                } => {
                    s.default_made.entry(*t).or_insert(f);
                }
                Operator::StructAtomicSet {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicRmwAdd {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicRmwSub {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicRmwAnd {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicRmwOr {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicRmwXor {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicRmwXchg {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicRmwCmpxchg {
                    struct_type_index: t,
                    ..
                } => {
                    s.writer.entry(*t).or_insert(f);
                    s.atomic_on.entry(*t).or_insert(f);
                }
                Operator::StructAtomicGet {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicGetS {
                    struct_type_index: t,
                    ..
                }
                | Operator::StructAtomicGetU {
                    struct_type_index: t,
                    ..
                } => {
                    s.atomic_on.entry(*t).or_insert(f);
                }
                Operator::StructNewDesc { .. } | Operator::StructNewDefaultDesc { .. } => {
                    return Err("the module uses custom descriptors".into());
                }
                Operator::RefEq => {
                    for d in 0..2 {
                        if let Some(Some(v)) = fv.get_operand_type(d) {
                            if let Some(h) = holder_of_operand(v, &ids) {
                                s.identity.push((h, f));
                            }
                        }
                    }
                }
                Operator::ExternConvertAny => {
                    if let Some(Some(v)) = fv.get_operand_type(0) {
                        if let Some(h) = holder_of_operand(v, &ids) {
                            s.identity.push((h, f));
                        }
                    }
                }
                _ => {}
            }
            // S2: every op on a candidate array type, and the ops the flattening cannot rewrite.
            if !s.arrays.is_empty() {
                let mut asite = |kind: ArrKind, a: u32| {
                    b.asites.push(ASite {
                        k,
                        off: off as u32,
                        reach,
                        ty: a,
                        kind,
                    });
                };
                let mut bad = |a: u32, what: &str| {
                    if s.arrays.contains_key(&a) {
                        s.arr_bad.entry(a).or_insert((what.to_string(), f));
                    }
                };
                match op {
                    // `filled(n, v)` shares one box across every slot; flat, it would hold `n`
                    // copies of `v`'s fields, `n` times the memory, and V8 refuses large ones.
                    Operator::ArrayNew {
                        array_type_index: a,
                    } => bad(
                        a,
                        "an array.new fills it from one shared value, which a flat array would \
                         copy into every element",
                    ),
                    Operator::ArrayNewDefault {
                        array_type_index: a,
                    } if s.arrays.contains_key(&a) => asite(ArrKind::NewDefault, a),
                    Operator::ArrayNewFixed {
                        array_type_index: a,
                        array_size: m,
                    } if s.arrays.contains_key(&a) => {
                        let opnds = (0..m).map(|i| opnd(i, (m - 1 - i) as usize)).collect();
                        asite(ArrKind::NewFixed(opnds), a)
                    }
                    Operator::ArrayGet {
                        array_type_index: a,
                    } if s.arrays.contains_key(&a) => {
                        agets.push((k, a));
                        asite(ArrKind::Get, a)
                    }
                    Operator::ArraySet {
                        array_type_index: a,
                    } if s.arrays.contains_key(&a) => asite(ArrKind::Set(opnd(0, 0)), a),
                    Operator::ArrayCopy {
                        array_type_index_dst: a,
                        array_type_index_src: c,
                    } => {
                        if a == c && s.arrays.contains_key(&a) {
                            asite(ArrKind::Copy, a)
                        } else {
                            bad(a, "an array.copy from another array type");
                            bad(c, "an array.copy into another array type");
                        }
                    }
                    Operator::ArrayLen => match fv.get_operand_type(0) {
                        Some(Some(v)) => match holder_of_operand(v, &ids) {
                            Some(Holder::Concrete(a)) if s.arrays.contains_key(&a) => {
                                asite(ArrKind::Len, a)
                            }
                            Some(Holder::Concrete(_)) => {}
                            _ => {
                                let mut all: Vec<u32> = s.arrays.keys().copied().collect();
                                all.sort_unstable();
                                for a in all {
                                    bad(a, "an array.len of an abstract array reference");
                                }
                            }
                        },
                        _ => {}
                    },
                    Operator::ArrayNewData {
                        array_type_index: a,
                        ..
                    }
                    | Operator::ArrayNewElem {
                        array_type_index: a,
                        ..
                    }
                    | Operator::ArrayFill {
                        array_type_index: a,
                    }
                    | Operator::ArrayInitData {
                        array_type_index: a,
                        ..
                    }
                    | Operator::ArrayInitElem {
                        array_type_index: a,
                        ..
                    }
                    | Operator::ArrayAtomicGet {
                        array_type_index: a,
                        ..
                    }
                    | Operator::ArrayAtomicSet {
                        array_type_index: a,
                        ..
                    }
                    | Operator::ArrayAtomicRmwXchg {
                        array_type_index: a,
                        ..
                    }
                    | Operator::ArrayAtomicRmwCmpxchg {
                        array_type_index: a,
                        ..
                    } => bad(a, "an array op the flattening does not rewrite"),
                    Operator::RefAsNonNull => {
                        if let Some(&Small::ArrayGet(a)) = small.last() {
                            if s.arrays.contains_key(&a) {
                                b.cast_after.insert(k - 1);
                            }
                        }
                    }
                    _ => {}
                }
            }
            if let Operator::StructNew {
                struct_type_index: t,
            } = op
            {
                if s.rec.get(t as usize).is_some_and(|r| r.is_some()) {
                    new_of.insert(k, t);
                }
            }
            match op {
                Operator::LocalGet { local_index: l } if tracked(l) => {
                    flow.push((k, Flow::Get(l)));
                }
                Operator::LocalSet { local_index: l } | Operator::LocalTee { local_index: l }
                    if tracked(l) =>
                {
                    // Unreachable code never runs: its sets cannot make a local null.
                    flow.push((k, Flow::Set(l, !reach || !nullable_at(0))));
                }
                Operator::Block { .. }
                | Operator::Loop { .. }
                | Operator::If { .. }
                | Operator::Else
                | Operator::End
                | Operator::Try { .. }
                | Operator::Catch { .. }
                | Operator::CatchAll
                | Operator::Delegate { .. }
                | Operator::TryTable { .. }
                | Operator::Br { .. }
                | Operator::BrIf { .. }
                | Operator::BrTable { .. }
                | Operator::BrOnNull { .. }
                | Operator::BrOnNonNull { .. }
                | Operator::BrOnCast { .. }
                | Operator::BrOnCastFail { .. }
                | Operator::Return
                | Operator::Unreachable
                | Operator::Throw { .. }
                | Operator::ThrowRef
                | Operator::Rethrow { .. }
                | Operator::ReturnCall { .. }
                | Operator::ReturnCallRef { .. }
                | Operator::ReturnCallIndirect { .. } => flow.push((k, Flow::Ctl(op.clone()))),
                _ => {}
            }
            small.push(match op {
                Operator::RefAsNonNull => Small::AsNonNull,
                Operator::LocalGet { local_index } => Small::LocalGet(local_index),
                Operator::LocalSet { local_index } => Small::LocalSet(local_index),
                Operator::LocalTee { local_index } => Small::LocalTee(local_index),
                Operator::StructGet {
                    struct_type_index,
                    field_index,
                } => {
                    if s.potential.contains_key(&(struct_type_index, field_index)) {
                        gets.push((k, struct_type_index, field_index));
                        get_at.insert(k, (struct_type_index, field_index));
                    }
                    Small::StructGet(struct_type_index, field_index)
                }
                Operator::StructNew { struct_type_index } => Small::StructNew(struct_type_index),
                Operator::ArrayGet { array_type_index } => Small::ArrayGet(array_type_index),
                Operator::Call { function_index } => Small::Call(function_index),
                _ => Small::Other,
            });
            // Which stack positions this op wrote, as the multi-value step reads it.
            let arity = op.operator_arity(&fv);
            fv.op(off, &op).map_err(invalid)?;
            let ha = fv.operand_stack_height() as usize;
            let mut lo = match arity {
                Some((_, pushes)) => ha.saturating_sub(pushes as usize),
                None => hb.min(ha).saturating_sub(1).min(base),
            };
            if fv.control_stack_height() > depth {
                lo = lo.min(fv.get_control_frame(0).ok_or("no control frame")?.height);
            }
            owner.resize(ha.max(owner.len()), NONE);
            for p in lo..ha {
                owner[p] = k;
            }
            owner.truncate(ha);
            post.push(ha as u32);
            match op {
                Operator::Block { .. }
                | Operator::Loop { .. }
                | Operator::If { .. }
                | Operator::Try { .. }
                | Operator::TryTable { .. } => seg.push(k + 1),
                Operator::Else | Operator::Catch { .. } | Operator::CatchAll => {
                    *seg.last_mut().ok_or("no segment")? = k + 1;
                }
                Operator::End | Operator::Delegate { .. } => {
                    seg.pop();
                }
                _ => {}
            }
            k += 1;
        }
        allocs = fv.into_allocations();
        // A store read from a nullable local that holds no null there is non-null after all.
        let non_null = non_null_gets(&flow);
        let refine = |o: &mut Opnd| {
            if o.nullable && o.prod != NONE && non_null.contains(&o.prod) {
                o.nullable = false;
                o.cast = true;
            }
        };
        for site in &mut b.sites {
            match &mut site.kind {
                SiteKind::New(os) => os.iter_mut().for_each(refine),
                SiteKind::Set(o) => refine(o),
            }
        }
        for site in &mut b.asites {
            match &mut site.kind {
                ArrKind::Set(o) => refine(o),
                ArrKind::NewFixed(os) => os.iter_mut().for_each(refine),
                _ => {}
            }
        }
        let uses = local_uses(&small, &gets);
        for &(k, p, j) in &gets {
            let v = s.potential[&(p, j)];
            let how = classify_read(&s, &small, &uses, k as usize, v, n_params);
            // The op whose value a call would take: the read, or the cast right after it.
            let last = if small.get(k as usize + 1) == Some(&Small::AsNonNull) {
                k + 1
            } else {
                k
            };
            let t = s.reads.entry((p, j)).or_default();
            match (how, arg_of.get(&last)) {
                (0, _) => t.field += 1,
                (1, _) => t.local += 1,
                (_, Some(&(g, a))) => s.arg_reads.push((p, j, g, a, f)),
                _ => {
                    t.whole += 1;
                    t.whole_in.get_or_insert(f);
                }
            }
        }
        if !agets.is_empty() {
            let stored: HashMap<u32, u32> = b
                .asites
                .iter()
                .filter_map(|x| match &x.kind {
                    ArrKind::Set(o) if o.prod != NONE => Some((o.prod, x.ty)),
                    _ => None,
                })
                .collect();
            let mv = || s.mv.get_or_init(|| field_facts(bytes));
            // `plain`: locals set once and only field-read, copied or stored back directly, which
            // binaryen's heap2local takes apart with or without the multi-value step. `held`: also those
            // the step alone takes apart, so the flattening checks it does (D3736).
            // heap2local takes a box apart only in a local set once, so a local set again is
            // judged as `held` and checked against the step.
            let mut plain = elem_locals(&s, &small, &agets, &stored, &arg_of, &mv, n_params, false);
            let mut sets: HashMap<u32, u32> = HashMap::new();
            for op in &small {
                if let Small::LocalSet(l) | Small::LocalTee(l) = *op {
                    *sets.entry(l).or_default() += 1;
                }
            }
            plain.retain(|l| sets.get(l) == Some(&1));
            let held = elem_locals(&s, &small, &agets, &stored, &arg_of, &mv, n_params, true);
            for &(k, a) in &agets {
                let v = s.arrays[&a];
                let last = if small.get(k as usize + 1) == Some(&Small::AsNonNull) {
                    k + 1
                } else {
                    k
                };
                let how = match after_cast(&small, k as usize) {
                    Some((n, Small::StructGet(t, x)))
                        if field_read_of(&s, Small::StructGet(t, x), v) =>
                    {
                        AUse::Field { last: n as u32, x }
                    }
                    Some((_, Small::LocalSet(l))) if plain.contains(&l) || held.contains(&l) => {
                        AUse::Local {
                            l,
                            needs_mv: !plain.contains(&l),
                        }
                    }
                    _ => match arg_of.get(&last) {
                        Some(&(callee, arg)) => AUse::Arg { callee, arg },
                        None => AUse::Whole,
                    },
                };
                b.areads.insert(k, how);
            }
        }
        s.bodies.push(b);
    }
    if s.bodies.len() + s.n_imports as usize != s.func_type.len() {
        return Err("the function and code sections disagree".into());
    }
    // An erased value carries what it reaches, as a crossing one does.
    let mut work: Vec<(u32, u32)> = s.erased.iter().map(|(&t, &f)| (t, f)).collect();
    let mut reach: HashMap<u32, u32> = HashMap::new();
    while let Some((t, f)) = work.pop() {
        if reach.contains_key(&t) || t as usize >= s.subs.len() {
            continue;
        }
        reach.insert(t, f);
        for v in s.inner_types(t, direct) {
            if let Some(Holder::Concrete(u)) = holder_of(v) {
                work.push((u, f));
            }
        }
    }
    s.erased = reach;
    Ok(Some(s))
}

/// `body` (a function body at module offset `start`) with each nullable local of a record type a
/// field could inline declared non-null; `None` when it declares none. The two encodings are
/// one byte apart and the same length, so every offset in the body is unchanged.
fn tighten(s: &Scan, body: &[u8], start: usize) -> Option<Vec<u8>> {
    let mut r = wasmparser::BinaryReader::new(body, start);
    let n = r.read_var_u32().ok()?;
    let mut at: Vec<usize> = Vec::new();
    for _ in 0..n {
        r.read_var_u32().ok()?;
        let pos = r.original_position() - start;
        if let ValType::Ref(rt) = r.read::<ValType>().ok()? {
            let rec = concrete_index(rt.heap_type()).is_some_and(|v| s.records.contains(&v));
            if rt.is_nullable() && rec && body.get(pos) == Some(&0x63) {
                at.push(pos);
            }
        }
    }
    if at.is_empty() {
        return None;
    }
    let mut out = body.to_vec();
    for p in at {
        out[p] = 0x64;
    }
    Some(out)
}

/// The op after `k`, past one `ref.as_non_null`.
fn after_cast(small: &[Small], k: usize) -> Option<(usize, Small)> {
    let mut n = k + 1;
    if small.get(n) == Some(&Small::AsNonNull) {
        n += 1;
    }
    small.get(n).map(|&x| (n, x))
}

/// Whether `op` reads a field that a record of type `v` has.
fn field_read_of(s: &Scan, op: Small, v: u32) -> bool {
    matches!(op, Small::StructGet(t, x)
        if s.holds(Holder::Concrete(t), v) && (x as usize) < s.fields(t).len())
}

/// How a body uses one local that a record read is stored into: whether it is ever tee'd, how
/// many times it is set, and the field each get is read through (`None`: not field-read).
#[derive(Default)]
struct LocalUse {
    tee: bool,
    sets: u32,
    reads: Vec<Option<(u32, u32)>>,
}

/// The uses of every local some candidate read in `gets` is stored into, in one pass.
fn local_uses(small: &[Small], gets: &[(u32, u32, u32)]) -> HashMap<u32, LocalUse> {
    let mut out: HashMap<u32, LocalUse> = HashMap::new();
    for &(k, _, _) in gets {
        if let Some((_, Small::LocalSet(l))) = after_cast(small, k as usize) {
            out.entry(l).or_default();
        }
    }
    if out.is_empty() {
        return out;
    }
    for (q, &op) in small.iter().enumerate() {
        match op {
            Small::LocalTee(l) => {
                if let Some(u) = out.get_mut(&l) {
                    u.tee = true;
                }
            }
            Small::LocalSet(l) => {
                if let Some(u) = out.get_mut(&l) {
                    u.sets += 1;
                }
            }
            Small::LocalGet(l) => {
                if let Some(u) = out.get_mut(&l) {
                    u.reads.push(match after_cast(small, q) {
                        Some((_, Small::StructGet(t, x))) => Some((t, x)),
                        _ => None,
                    });
                }
            }
            _ => {}
        }
    }
    out
}

/// The locals (not parameters) an element read of a candidate array type is stored into that
/// are never tee'd, are set only to such a read of that same array (through an optional
/// `ref.as_non_null`), a fresh record of its element type or a producer's result, and whose
/// every read is a field read, the value an `array.set` of that array stores (`stored`, by the
/// op that pushes it) or an argument (`arg_of`) the multi-value step takes as fields. A
/// re-boxed read stored there is scalarized by the multi-value step (D3719).
#[allow(clippy::too_many_arguments)]
fn elem_locals<'m>(
    s: &Scan,
    small: &[Small],
    agets: &[(u32, u32)],
    stored: &HashMap<u32, u32>,
    arg_of: &HashMap<u32, (u32, u32)>,
    mv: &dyn Fn() -> &'m FieldFacts,
    n_params: u32,
    wide: bool,
) -> HashSet<u32> {
    // Parameter `j` of `g` is a field-only parameter of exactly record type `v`.
    let field_arg = |g: u32, j: u32, v: u32| -> bool {
        let named = wide
            && s
            .func_type
            .get(g as usize)
            .and_then(|&t| s.sig(t))
            .and_then(|(ps, _)| ps.get(j as usize).copied())
            .is_some_and(
                |p| matches!(p, ValType::Ref(r) if concrete_index(r.heap_type()) == Some(v)),
            );
        named && mv().fo_param.contains(&(g, j))
    };
    let mut arr_of: HashMap<u32, u32> = HashMap::new();
    let mut bad: HashSet<u32> = HashSet::new();
    for &(k, a) in agets {
        if let Some((_, Small::LocalSet(l))) = after_cast(small, k as usize) {
            if l >= n_params && *arr_of.entry(l).or_insert(a) != a {
                bad.insert(l);
            }
        }
    }
    // So is a local an `array.set` of the array stores, or one copied into such a local (the
    // emitter's scratch for `p[0] = base`): grown to a fixpoint, then judged as the rest.
    while wide {
        let before = arr_of.len();
        for (q, &op) in small.iter().enumerate() {
            let Small::LocalGet(l) = op else { continue };
            if l < n_params || arr_of.contains_key(&l) {
                continue;
            }
            let into = match small.get(q + 1) {
                Some(&Small::LocalSet(l3)) if l3 == l => None,
                Some(&Small::LocalSet(l3)) => arr_of.get(&l3).copied(),
                _ => stored.get(&(q as u32)).copied(),
            };
            if let Some(a) = into {
                arr_of.insert(l, a);
            }
        }
        if arr_of.len() == before {
            break;
        }
    }
    for &op in small {
        if let Small::LocalTee(l) = op {
            bad.insert(l);
        }
    }
    // A copy from one such local into another keeps both, so drop locals until none changes.
    loop {
        let good =
            |l: u32, a: u32, bad: &HashSet<u32>| arr_of.get(&l) == Some(&a) && !bad.contains(&l);
        let mut drop: Vec<u32> = Vec::new();
        for (q, &op) in small.iter().enumerate() {
            match op {
                Small::LocalSet(l) if !bad.contains(&l) => {
                    let Some(&a) = arr_of.get(&l) else { continue };
                    let from = |i: usize| small.get(i) == Some(&Small::ArrayGet(a));
                    let ok = match q.checked_sub(1).and_then(|p| small.get(p)) {
                        Some(&Small::StructNew(t)) => t == s.arrays[&a],
                        Some(&Small::AsNonNull) => q >= 2 && from(q - 2),
                        Some(&Small::LocalGet(l2)) => l2 != l && good(l2, a, &bad),
                        Some(&Small::Call(g)) => {
                            wide && mv().producer.get(&g) == Some(&s.arrays[&a])
                        }
                        Some(_) => from(q - 1),
                        None => false,
                    };
                    if !ok {
                        drop.push(l);
                    }
                }
                Small::LocalGet(l) if !bad.contains(&l) => {
                    let Some(&a) = arr_of.get(&l) else { continue };
                    let v = s.arrays[&a];
                    let ok = match after_cast(small, q) {
                        Some((_, op)) if field_read_of(s, op, v) => true,
                        Some((n, Small::LocalSet(l3))) => {
                            n == q + 1 && l3 != l && good(l3, a, &bad)
                        }
                        _ => {
                            stored.get(&(q as u32)) == Some(&a)
                                || arg_of
                                    .get(&(q as u32))
                                    .is_some_and(|&(g, j)| field_arg(g, j, v))
                        }
                    };
                    if !ok {
                        drop.push(l);
                    }
                }
                _ => {}
            }
        }
        if drop.is_empty() {
            break;
        }
        bad.extend(drop);
    }
    arr_of.into_keys().filter(|l| !bad.contains(l)).collect()
}

/// How the read of a record field at op `k` uses the record: 0 a field read, 1 a local that
/// holds only this read and is only field-read, 2 anything else.
fn classify_read(
    s: &Scan,
    small: &[Small],
    uses: &HashMap<u32, LocalUse>,
    k: usize,
    v: u32,
    n_params: u32,
) -> u8 {
    match after_cast(small, k) {
        Some((_, op)) if field_read_of(s, op, v) => 0,
        Some((_, Small::LocalSet(l))) if l >= n_params => match uses.get(&l) {
            Some(u)
                if !u.tee
                    && u.sets == 1
                    && u.reads.iter().all(|r| {
                        r.is_some_and(|(t, x)| field_read_of(s, Small::StructGet(t, x), v))
                    }) =>
            {
                1
            }
            _ => 2,
        },
        _ => 2,
    }
}

/// The types `op` takes from the operand stack where its immediates fix them, bottom first,
/// and how many operands sit above them (a call_ref's callee, a br_if's condition).
#[allow(clippy::too_many_arguments)]
fn expected(
    s: &Scan,
    op: &Operator,
    fv: &wasmparser::FuncValidator<wasmparser::ValidatorResources>,
    results: &[ValType],
    globals: &[ValType],
    tags: &[u32],
    local_type: &dyn Fn(u32) -> Option<ValType>,
) -> (Vec<ValType>, usize) {
    let block = |bt: wasmparser::BlockType, loop_: bool| -> Vec<ValType> {
        match bt {
            wasmparser::BlockType::Empty => Vec::new(),
            wasmparser::BlockType::Type(v) => {
                if loop_ {
                    Vec::new()
                } else {
                    vec![v]
                }
            }
            wasmparser::BlockType::FuncType(i) => s
                .sig(i)
                .map(|(ps, rs)| if loop_ { ps } else { rs })
                .unwrap_or_default(),
        }
    };
    let label = |d: u32| -> Vec<ValType> {
        fv.get_control_frame(d as usize)
            .map_or_else(Vec::new, |fr| {
                block(fr.block_type, fr.kind == wasmparser::FrameKind::Loop)
            })
    };
    let sig_params = |t: u32| s.sig(t).map(|(ps, _)| ps).unwrap_or_default();
    let field = |t: u32, f: u32| -> Vec<ValType> {
        match s.fields(t).get(f as usize).map(|x| x.element_type) {
            Some(StorageType::Val(v)) => vec![v],
            _ => Vec::new(),
        }
    };
    let elem = |t: u32| -> Option<ValType> {
        match &s.subs.get(t as usize)?.composite_type.inner {
            CompositeInnerType::Array(at) => match at.0.element_type {
                StorageType::Val(v) => Some(v),
                _ => None,
            },
            _ => None,
        }
    };
    match *op {
        Operator::LocalSet { local_index } | Operator::LocalTee { local_index } => {
            (local_type(local_index).into_iter().collect(), 0)
        }
        Operator::GlobalSet { global_index } => (
            globals
                .get(global_index as usize)
                .copied()
                .into_iter()
                .collect(),
            0,
        ),
        Operator::Call { function_index } | Operator::ReturnCall { function_index } => (
            s.func_type
                .get(function_index as usize)
                .map_or_else(Vec::new, |&t| sig_params(t)),
            0,
        ),
        Operator::CallRef { type_index } | Operator::ReturnCallRef { type_index } => {
            (sig_params(type_index), 1)
        }
        Operator::CallIndirect { type_index, .. }
        | Operator::ReturnCallIndirect { type_index, .. } => (sig_params(type_index), 1),
        Operator::Return => (results.to_vec(), 0),
        Operator::End => (label(0), 0),
        Operator::Br { relative_depth } => (label(relative_depth), 0),
        Operator::BrIf { relative_depth } => (label(relative_depth), 1),
        Operator::BrTable { ref targets } => (label(targets.default()), 1),
        Operator::Block { blockty } | Operator::Loop { blockty } => (
            match blockty {
                wasmparser::BlockType::FuncType(i) => sig_params(i),
                _ => Vec::new(),
            },
            0,
        ),
        Operator::If { blockty } => (
            match blockty {
                wasmparser::BlockType::FuncType(i) => sig_params(i),
                _ => Vec::new(),
            },
            1,
        ),
        Operator::StructNew { struct_type_index } => (
            s.fields(struct_type_index)
                .iter()
                .filter_map(|f| match f.element_type {
                    StorageType::Val(v) => Some(v),
                    _ => Some(ValType::I32),
                })
                .collect(),
            0,
        ),
        Operator::StructSet {
            struct_type_index,
            field_index,
        } => (field(struct_type_index, field_index), 0),
        Operator::ArrayNew { array_type_index } => {
            (elem(array_type_index).into_iter().collect(), 1)
        }
        Operator::ArrayNewFixed {
            array_type_index,
            array_size,
        } => (
            elem(array_type_index)
                .map_or_else(Vec::new, |v| vec![v; array_size.min(4096) as usize]),
            0,
        ),
        Operator::ArraySet { array_type_index } => {
            (elem(array_type_index).into_iter().collect(), 0)
        }
        Operator::ArrayFill { array_type_index } => {
            (elem(array_type_index).into_iter().collect(), 1)
        }
        Operator::Throw { tag_index } => (
            tags.get(tag_index as usize)
                .map_or_else(Vec::new, |&t| sig_params(t)),
            0,
        ),
        Operator::TypedSelect { ty } => (vec![ty, ty], 1),
        _ => (Vec::new(), 0),
    }
}

/// How a value of type `t` can cross the module boundary, if it can: through a crossing type
/// it may stand for, or by being handed to an `any`/`eq`/`struct` place (in the function
/// named) when such a reference crosses.
pub(crate) fn crossing(s: &Scan, t: u32, names: &dyn Fn(u32) -> String) -> Option<String> {
    if let Some(w) = &s.crossing_any {
        let erased = s
            .erased
            .iter()
            .filter(|(&c, _)| s.holds(Holder::Concrete(c), t))
            .map(|(_, &f)| f)
            .chain(s.erased_any)
            .min();
        if let Some(f) = erased {
            return Some(format!(
                "it is stored as an abstract reference in {}, and one crosses at {w}",
                names(f)
            ));
        }
    }
    s.crossing
        .iter()
        .filter(|(&u, _)| s.holds(Holder::Concrete(u), t))
        .map(|(_, w)| w.clone())
        .min()
}

/// Why record type `v` may not be stored inline; `None` when it may.
pub(crate) fn record_refusal(s: &Scan, v: u32, names: &dyn Fn(u32) -> String) -> Option<String> {
    let comp = s.comp[v as usize];
    if let Some((&u, &f)) = s
        .writer
        .iter()
        .filter(|(&u, _)| s.comp.get(u as usize) == Some(&comp))
        .min_by_key(|(&u, _)| u)
    {
        return Some(if u == v {
            format!("its fields are written (struct.set {u} in {})", names(f))
        } else {
            format!(
                "type {u}, in its subtyping component, is written (struct.set {u} in {})",
                names(f)
            )
        });
    }
    if let Some(what) = crossing(s, v, names) {
        return Some(format!(
            "a value of it can cross the module boundary ({what})"
        ));
    }
    if let Some((_, f)) = s.identity.iter().find(|(h, _)| s.holds(*h, v)) {
        return Some(format!(
            "its identity is observable (ref.eq or extern.convert_any in {})",
            names(*f)
        ));
    }
    None
}

/// The step: `Some((rewritten module, where each output body came from))`, or `None` when it
/// changes nothing. `stable_layout` (`vl build --stable-layout`) keeps the layout of every type
/// a crossing value reaches, not only of the types a boundary signature names.
pub fn inline_step(bytes: &[u8], stable_layout: bool) -> Option<Stepped> {
    let flag = |n: &str| std::env::var_os(n).is_some_and(|v| !v.is_empty() && v != "0");
    let explaining = flag("VL_INLINE_EXPLAIN");
    // `$VL_INLINE_REBOX=1`: inline a field even where a read re-boxes, so a grid can grade the
    // re-box at every read position. A measurement facility, undocumented in `vl help build`.
    let rebox_all = flag("VL_INLINE_REBOX");
    // `$VL_INLINE_SPILL=1`: take every store apart at the store, never at its producer, so a
    // grid reaches the path an unknown producer takes. Also a measurement facility.
    let spill_all = flag("VL_INLINE_SPILL");
    // `$VL_OPT_NO_FLAT=1`: inline record fields but flatten no list (S2's control).
    let no_flat = flag("VL_OPT_NO_FLAT");
    let mut s = match scan(bytes, stable_layout) {
        Ok(Some(s)) => s,
        Ok(None) => {
            if explaining {
                eprintln!(
                    "inline-explain: step skipped: no struct field or array element holds a \
                     leaf record (1 to {MV_RECORD_MAX_FIELDS} numeric fields)"
                );
            }
            return None;
        }
        Err(why) => {
            if explaining {
                eprintln!("inline-explain: step skipped: {why}");
            }
            return None;
        }
    };
    let fnames = if explaining {
        function_names(bytes)
    } else {
        HashMap::new()
    };
    let name = |f: u32| {
        fnames
            .get(&f)
            .cloned()
            .unwrap_or_else(|| format!("func {f}"))
    };
    let fields = if s.potential.is_empty() {
        None
    } else {
        fields_step(&mut s, bytes, explaining, rebox_all, spill_all, &name)
    };
    if s.arrays.is_empty() || no_flat {
        return fields.map(|(bytes, moved)| Stepped {
            bytes,
            moved,
            fields: true,
            flat: false,
        });
    }
    // Slice S2 reads the field step's output, so a re-boxed field read it stores is seen.
    let flat = match &fields {
        None => crate::flat::flat_step(&s, bytes, explaining, rebox_all, spill_all, &name),
        Some((out, _)) => match scan(out, stable_layout) {
            Ok(Some(s2)) => {
                crate::flat::flat_step(&s2, out, explaining, rebox_all, spill_all, &name)
            }
            _ => None,
        },
    };
    match (fields, flat) {
        (None, None) => None,
        (Some((bytes, moved)), None) => Some(Stepped {
            bytes,
            moved,
            fields: true,
            flat: false,
        }),
        (None, Some((bytes, moved))) => Some(Stepped {
            bytes,
            moved,
            fields: false,
            flat: true,
        }),
        (Some((_, first)), Some((bytes, second))) => Some(Stepped {
            bytes,
            moved: first
                .into_iter()
                .zip(second)
                .map(|(a, b)| BodyMove {
                    from: a.from,
                    to: a.to,
                    pairs: a.pairs.iter().map(|&(o, m)| (o, b.place(m))).collect(),
                })
                .collect(),
            fields: true,
            flat: true,
        }),
    }
}

/// The step's output: the module, where each body came from, and which slices changed it.
pub struct Stepped {
    pub bytes: Vec<u8>,
    pub moved: Vec<BodyMove>,
    /// S1 inlined a record field.
    pub fields: bool,
    /// S2 flattened a list.
    pub flat: bool,
}

/// Slice S1: inline the record fields `s` finds that qualify.
fn fields_step(
    s: &mut Scan,
    bytes: &[u8],
    explaining: bool,
    rebox_all: bool,
    spill_all: bool,
    name: &dyn Fn(u32) -> String,
) -> Option<(Vec<u8>, Vec<BodyMove>)> {
    // The records that may be copied, and the fields that may hold one inline.
    let mut records: Vec<u32> = s.potential.values().copied().collect();
    records.sort_unstable();
    records.dedup();
    let mut ok_record: HashSet<u32> = HashSet::new();
    for &v in &records {
        let why = record_refusal(s, v, name);
        if explaining {
            let spelled: Vec<&str> = s.rec[v as usize]
                .iter()
                .flatten()
                .map(|n| match n {
                    Num::I32 => "i32",
                    Num::I64 => "i64",
                    Num::F32 => "f32",
                    Num::F64 => "f64",
                })
                .collect();
            match &why {
                None => eprintln!(
                    "inline-explain: type {v} {{{}}}: candidate",
                    spelled.join(", ")
                ),
                Some(w) => {
                    eprintln!(
                        "inline-explain: type {v} {{{}}}: refused: {w}",
                        spelled.join(", ")
                    )
                }
            }
        }
        if why.is_none() {
            ok_record.insert(v);
        }
    }
    // A read passed to a call is free when the multi-value step takes that parameter as fields.
    if !s.arg_reads.is_empty() {
        let facts = s.mv.take().unwrap_or_else(|| field_facts(bytes));
        for (p, j, g, a, f) in std::mem::take(&mut s.arg_reads) {
            let t = s.reads.entry((p, j)).or_default();
            if facts.fo_param.contains(&(g, a)) {
                t.arg += 1;
            } else {
                t.whole += 1;
                t.whole_in.get_or_insert(f);
            }
        }
        let _ = s.mv.set(facts);
    }
    let s: &Scan = s;
    let mut refused: HashMap<(u32, u32), String> = HashMap::new();
    // A store of a value whose type admits null refuses its field, unless the value is read
    // from a field that is itself inlined (a re-box is never null): those wait for the fixpoint.
    let mut needs: Vec<((u32, u32), (u32, u32), String)> = Vec::new();
    for (bi, b) in s.bodies.iter().enumerate() {
        let f = s.n_imports + bi as u32;
        for site in b.sites.iter().filter(|x| x.reach) {
            let opnds: Vec<&Opnd> = match &site.kind {
                SiteKind::New(os) => os.iter().collect(),
                SiteKind::Set(o) => vec![o],
            };
            for o in opnds.into_iter().filter(|o| o.nullable) {
                let op = if matches!(site.kind, SiteKind::New(_)) {
                    "struct.new"
                } else {
                    "struct.set"
                };
                let why = format!(
                    "a value whose type admits null is stored into it ({op} at byte {:#x} in {})",
                    site.off,
                    name(f)
                );
                match o.from_get {
                    Some(src) if src != (site.ty, o.field) => {
                        needs.push(((site.ty, o.field), src, why))
                    }
                    Some(_) => {}
                    None => {
                        refused.entry((site.ty, o.field)).or_insert(why);
                    }
                }
            }
        }
    }
    let mut inline: HashMap<(u32, u32), u32> = HashMap::new();
    let mut pairs: Vec<(u32, u32)> = s.potential.keys().copied().collect();
    pairs.sort_unstable();
    for &(p, j) in &pairs {
        let v = s.potential[&(p, j)];
        let why = if !ok_record.contains(&v) {
            Some(format!("its record type {v} is refused (above)"))
        } else if let Some(f) = s.default_made.get(&p) {
            Some(format!(
                "type {p} is made by struct.new_default (in {})",
                name(*f)
            ))
        } else if let Some(f) = s.atomic_on.get(&p) {
            Some(format!("type {p} is accessed atomically (in {})", name(*f)))
        } else if let Some(what) = crossing(s, p, name) {
            Some(format!("type {p} can cross the module boundary ({what}), so its layout is not ours to change"))
        } else if s.const_made.contains(&p) {
            Some(format!(
                "type {p} is made in a constant expression (a global's initializer)"
            ))
        } else if let Some(w) = refused.get(&(p, j)) {
            Some(w.clone())
        } else if let Some(t) = s.reads.get(&(p, j)).filter(|t| t.whole > 0 && !rebox_all) {
            Some(format!(
                "{} of its {} read(s) take the whole record (first in {}), and each would \
                 allocate a copy where today it shares the box",
                t.whole,
                t.field + t.local + t.arg + t.whole,
                name(t.whole_in.unwrap_or(0))
            ))
        } else {
            None
        };
        match why {
            None => {
                inline.insert((p, j), v);
            }
            Some(w) => {
                refused.insert((p, j), w);
            }
        }
    }
    // A subtype and its supertype must lay a shared field out the same way, and a field fed
    // from another field's read needs that field inlined.
    loop {
        let mut drop: Vec<((u32, u32), String)> = Vec::new();
        for (dst, src, why) in &needs {
            if inline.contains_key(dst) && !inline.contains_key(src) {
                drop.push((*dst, why.clone()));
            }
        }
        for t in 0..s.subs.len() as u32 {
            let Some(sup) = s.supertype(t) else { continue };
            let n = s.fields(t).len().min(s.fields(sup).len()) as u32;
            for j in 0..n {
                let (a, b) = (inline.get(&(t, j)), inline.get(&(sup, j)));
                if a != b {
                    if a.is_some() {
                        drop.push((
                            (t, j),
                            format!("its supertype {sup} does not inline field {j}"),
                        ));
                    }
                    if b.is_some() {
                        drop.push((
                            (sup, j),
                            format!("its subtype {t} does not inline field {j}"),
                        ));
                    }
                }
            }
        }
        if drop.is_empty() {
            break;
        }
        for (key, why) in drop {
            if inline.remove(&key).is_some() {
                refused.insert(key, why);
            }
        }
    }
    if inline.is_empty() {
        if explaining {
            for &(p, j) in &pairs {
                if let Some(w) = refused.get(&(p, j)) {
                    eprintln!(
                        "inline-explain: type {p} field {j} (type {}): not inlined: {w}",
                        s.potential[&(p, j)]
                    );
                }
            }
            eprintln!("inline-explain: no field inlined");
        }
        return None;
    }
    let out = rewrite(s, bytes, &inline, spill_all);
    let (out, moved, stats) = match out {
        Ok(x) => x,
        Err(why) => {
            if explaining {
                eprintln!("inline-explain: step abandoned: {why}");
            }
            return None;
        }
    };
    if explaining {
        for &(p, j) in &pairs {
            let v = s.potential[&(p, j)];
            match refused.get(&(p, j)) {
                Some(w) => {
                    eprintln!("inline-explain: type {p} field {j} (type {v}): not inlined: {w}")
                }
                None => {
                    let st = stats.get(&(p, j)).copied().unwrap_or_default();
                    let rt = s.reads.get(&(p, j)).copied().unwrap_or_default();
                    eprintln!(
                        "inline-explain: type {p} field {j} (type {v}): inlined; {} store(s) \
                         ({} taken apart at the producer, {} spilled), {} read(s) as fields, \
                         {} re-boxed ({} into a field-read local, {} into a field parameter)",
                        st.stores,
                        st.at_producer,
                        st.spilled,
                        st.field_reads,
                        st.reboxed,
                        rt.local,
                        rt.arg
                    );
                }
            }
        }
    }
    if let Err(e) = Validator::new_with_features(WasmFeatures::all()).validate_all(&out) {
        if explaining {
            eprintln!("inline-explain: step abandoned: its output does not validate: {e}");
        }
        return None;
    }
    if explaining {
        let parents: HashSet<u32> = inline.keys().map(|&(p, _)| p).collect();
        eprintln!(
            "inline-explain: {} field(s) of {} type(s) inlined",
            inline.len(),
            parents.len()
        );
    }
    Some((out, moved))
}

#[derive(Clone, Copy, Default)]
struct Stats {
    stores: u32,
    at_producer: u32,
    spilled: u32,
    field_reads: u32,
    reboxed: u32,
}

/// Per parent with an inlined field: old field index to new, and the record each inlined
/// field holds.
pub(crate) struct Layout {
    start: Vec<u32>,
    rec: Vec<Option<u32>>,
}

pub(crate) fn gc_op(out: &mut Vec<u8>, sub: u32, t: u32, field: Option<u32>) {
    out.push(0xfb);
    put_uleb(out, sub as u64);
    put_uleb(out, t as u64);
    if let Some(j) = field {
        put_uleb(out, j as u64);
    }
}

/// A `ref.as_non_null` when `cast`: a stored value the dataflow proves non-null.
pub(crate) fn cast_if(out: &mut Vec<u8>, cast: bool) {
    if cast {
        out.push(0xd4);
    }
}

pub(crate) fn local_op(out: &mut Vec<u8>, op: u8, l: u32) {
    out.push(op);
    put_uleb(out, l as u64);
}

pub(crate) fn ref_ty(nullable: bool, t: u32) -> Option<ValType> {
    RefType::new(nullable, HeapType::Concrete(UnpackedIndex::Module(t))).map(ValType::Ref)
}

type Rewritten = (Vec<u8>, Vec<BodyMove>, HashMap<(u32, u32), Stats>);

fn rewrite(
    s: &Scan,
    bytes: &[u8],
    inline: &HashMap<(u32, u32), u32>,
    spill_all: bool,
) -> Result<Rewritten, String> {
    let mut layout: HashMap<u32, Layout> = HashMap::new();
    for &(p, _) in inline.keys() {
        layout.entry(p).or_insert_with(|| {
            let m = s.fields(p).len() as u32;
            let mut start = Vec::with_capacity(m as usize + 1);
            let mut rec = Vec::with_capacity(m as usize);
            let mut at = 0u32;
            for j in 0..m {
                start.push(at);
                let v = inline.get(&(p, j)).copied();
                rec.push(v);
                at += v.map_or(1, |v| {
                    s.rec[v as usize].as_ref().map_or(1, |r| r.len() as u32)
                });
            }
            start.push(at);
            Layout { start, rec }
        });
    }
    let rec_len = |v: u32| s.rec[v as usize].as_ref().map_or(0, |r| r.len() as u32);
    let mut stats: HashMap<(u32, u32), Stats> = HashMap::new();
    let fail = |w: &str| w.to_string();
    let mut bodies: Vec<std::borrow::Cow<[u8]>> = Vec::with_capacity(s.bodies.len());
    let mut body_moves: Vec<Vec<(u32, u32)>> = Vec::with_capacity(s.bodies.len());
    for b in &s.bodies {
        if !b.touches {
            bodies.push(std::borrow::Cow::Borrowed(&bytes[b.range.0..b.range.1]));
            body_moves.push(vec![(b.range.0 as u32, 0)]);
            continue;
        }
        let mut extra: Vec<ValType> = Vec::new();
        let mut next_local = b.n_locals;
        let mut new_local = |t: ValType, extra: &mut Vec<ValType>| {
            extra.push(t);
            next_local += 1;
            next_local - 1
        };
        let mut replace: HashMap<u32, Vec<u8>> = HashMap::new();
        let mut after: HashMap<u32, Vec<u8>> = HashMap::new();
        for site in &b.sites {
            let Some(lay) = layout.get(&site.ty) else {
                continue;
            };
            let p = site.ty;
            match &site.kind {
                SiteKind::Set(o) => {
                    let Some(v) = lay.rec[o.field as usize] else {
                        continue;
                    };
                    let st = stats.entry((p, o.field)).or_default();
                    st.stores += 1;
                    let tv = new_local(ref_ty(false, v).ok_or("ref type")?, &mut extra);
                    let tp = new_local(ref_ty(true, p).ok_or("ref type")?, &mut extra);
                    let mut code = Vec::new();
                    if site.reach && o.prod != NONE && !spill_all {
                        let mut a = Vec::new();
                        cast_if(&mut a, o.cast);
                        local_op(&mut a, 0x21, tv);
                        if after.insert(o.prod, a).is_some() || replace.contains_key(&o.prod) {
                            return Err(fail("two rewrites claim one producer"));
                        }
                        st.at_producer += 1;
                    } else {
                        cast_if(&mut code, o.cast);
                        local_op(&mut code, 0x21, tv);
                        st.spilled += 1;
                    }
                    local_op(&mut code, 0x21, tp);
                    let base = lay.start[o.field as usize];
                    for i in 0..rec_len(v) {
                        local_op(&mut code, 0x20, tp);
                        local_op(&mut code, 0x20, tv);
                        gc_op(&mut code, 2, v, Some(i));
                        gc_op(&mut code, 5, p, Some(base + i));
                    }
                    replace.insert(site.k, code);
                }
                SiteKind::New(os) => {
                    let ins: Vec<&Opnd> = os
                        .iter()
                        .filter(|o| lay.rec[o.field as usize].is_some())
                        .collect();
                    if ins.is_empty() {
                        continue;
                    }
                    let at_producers = site.reach
                        && !spill_all
                        && ins.iter().all(|o| {
                            o.prod != NONE
                                && !after.contains_key(&o.prod)
                                && !replace.contains_key(&o.prod)
                        });
                    if at_producers {
                        for o in &ins {
                            let v = lay.rec[o.field as usize].expect("filtered");
                            let st = stats.entry((p, o.field)).or_default();
                            st.stores += 1;
                            st.at_producer += 1;
                            if o.prod_new == Some(v) {
                                replace.insert(o.prod, Vec::new());
                            } else {
                                let tv = new_local(ref_ty(false, v).ok_or("ref type")?, &mut extra);
                                let mut a = Vec::new();
                                cast_if(&mut a, o.cast);
                                local_op(&mut a, 0x21, tv);
                                for i in 0..rec_len(v) {
                                    local_op(&mut a, 0x20, tv);
                                    gc_op(&mut a, 2, v, Some(i));
                                }
                                after.insert(o.prod, a);
                            }
                        }
                    } else {
                        let fields = s.fields(p);
                        let first = ins[0].field as usize;
                        let mut ls: Vec<u32> = Vec::new();
                        for (j, f) in fields.iter().enumerate().skip(first) {
                            let t = match lay.rec[j] {
                                Some(v) => ref_ty(false, v).ok_or("ref type")?,
                                None => match f.element_type {
                                    StorageType::Val(v) => v,
                                    _ => ValType::I32,
                                },
                            };
                            ls.push(new_local(t, &mut extra));
                        }
                        let mut code = Vec::new();
                        for (i, &l) in ls.iter().enumerate().rev() {
                            let j = (first + i) as u32;
                            cast_if(&mut code, ins.iter().any(|o| o.field == j && o.cast));
                            local_op(&mut code, 0x21, l);
                        }
                        for (i, &l) in ls.iter().enumerate() {
                            let j = first + i;
                            match lay.rec[j] {
                                Some(v) => {
                                    let st = stats.entry((p, j as u32)).or_default();
                                    st.stores += 1;
                                    st.spilled += 1;
                                    for x in 0..rec_len(v) {
                                        local_op(&mut code, 0x20, l);
                                        gc_op(&mut code, 2, v, Some(x));
                                    }
                                }
                                None => local_op(&mut code, 0x20, l),
                            }
                        }
                        gc_op(&mut code, 0, p, None);
                        replace.insert(site.k, code);
                    }
                }
            }
        }
        // Stream the body, with the plan, re-encoding every field index of a changed parent.
        let mut reader = wasmparser::OperatorsReader::new(wasmparser::BinaryReader::new(
            &bytes[b.ops_start..b.range.1],
            b.ops_start,
        ));
        let mut ops: Vec<(Operator, usize, usize)> = Vec::new();
        while !reader.eof() {
            let (op, off) = reader
                .read_with_offset()
                .map_err(|_| "a body does not decode")?;
            let end = if reader.eof() {
                b.range.1
            } else {
                reader.original_position()
            };
            ops.push((op, off, end));
        }
        let mut code: Vec<u8> = Vec::with_capacity(b.range.1 - b.ops_start + 64);
        let mut moved: Vec<(u32, u32)> = Vec::with_capacity(ops.len());
        let mut i = 0usize;
        while i < ops.len() {
            let (op, off, end) = &ops[i];
            let k = i as u32;
            moved.push((*off as u32, code.len() as u32));
            let mut consumed = 1usize;
            if let Some(r) = replace.get(&k) {
                code.extend_from_slice(r);
            } else {
                match op {
                    Operator::StructGet {
                        struct_type_index: p,
                        field_index: j,
                    } if layout.contains_key(p) => {
                        let lay = &layout[p];
                        let nj = lay.start[*j as usize];
                        match lay.rec[*j as usize] {
                            None => gc_op(&mut code, 2, *p, Some(nj)),
                            Some(v) => {
                                // A field read of the record, through an optional non-null cast.
                                let mut n = i + 1;
                                if matches!(ops.get(n), Some((Operator::RefAsNonNull, _, _))) {
                                    n += 1;
                                }
                                let read = match ops.get(n) {
                                    Some((
                                        Operator::StructGet {
                                            struct_type_index: t,
                                            field_index: x,
                                        },
                                        _,
                                        _,
                                    )) if s.holds(Holder::Concrete(*t), v)
                                        && (*x as usize) < s.fields(*t).len()
                                        && (i + 1..=n).all(|q| {
                                            !replace.contains_key(&(q as u32))
                                                && !after.contains_key(&(q as u32))
                                        })
                                        && !after.contains_key(&k) =>
                                    {
                                        Some(*x)
                                    }
                                    _ => None,
                                };
                                let st = stats.entry((*p, *j)).or_default();
                                match read {
                                    Some(x) => {
                                        st.field_reads += 1;
                                        gc_op(&mut code, 2, *p, Some(nj + x));
                                        consumed = n + 1 - i;
                                    }
                                    None => {
                                        st.reboxed += 1;
                                        let n = rec_len(v);
                                        if n == 1 {
                                            gc_op(&mut code, 2, *p, Some(nj));
                                        } else {
                                            let tp = new_local(
                                                ref_ty(true, *p).ok_or("ref type")?,
                                                &mut extra,
                                            );
                                            local_op(&mut code, 0x21, tp);
                                            for x in 0..n {
                                                local_op(&mut code, 0x20, tp);
                                                gc_op(&mut code, 2, *p, Some(nj + x));
                                            }
                                        }
                                        gc_op(&mut code, 0, v, None);
                                        // The box is non-null already; a cast after it would
                                        // hide the allocation from the multi-value step.
                                        if matches!(
                                            ops.get(i + 1),
                                            Some((Operator::RefAsNonNull, _, _))
                                        ) && !replace.contains_key(&(k + 1))
                                            && !after.contains_key(&k)
                                        {
                                            consumed = 2;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Operator::StructGetS {
                        struct_type_index: p,
                        field_index: j,
                    } if layout.contains_key(p) => {
                        gc_op(&mut code, 3, *p, Some(layout[p].start[*j as usize]))
                    }
                    Operator::StructGetU {
                        struct_type_index: p,
                        field_index: j,
                    } if layout.contains_key(p) => {
                        gc_op(&mut code, 4, *p, Some(layout[p].start[*j as usize]))
                    }
                    Operator::StructSet {
                        struct_type_index: p,
                        field_index: j,
                    } if layout.contains_key(p) => {
                        if layout[p].rec[*j as usize].is_some() {
                            return Err(fail("an inlined field's store was not planned"));
                        }
                        gc_op(&mut code, 5, *p, Some(layout[p].start[*j as usize]))
                    }
                    _ => code.extend_from_slice(&bytes[*off..*end]),
                }
            }
            if let Some(a) = after.get(&k) {
                code.extend_from_slice(a);
            }
            for q in 1..consumed {
                moved.push((ops[i + q].1 as u32, code.len() as u32));
            }
            i += consumed;
        }
        let (out, moves) = finish_body(bytes, b, &code, moved, extra)?;
        bodies.push(std::borrow::Cow::Owned(out));
        body_moves.push(moves);
    }
    let types = type_section(s, &|out, t| encode_sub(out, s, t, &layout, &HashMap::new()))?;
    let (out, moved) = assemble(s, bytes, types, &bodies, &body_moves)?;
    Ok((out, moved, stats))
}

/// A rewritten body: its locals header (the old entries, tightened when that validated, then
/// `extra`) followed by `code`, and where each op moved, per `moved`'s offsets into `code`.
pub(crate) fn finish_body(
    bytes: &[u8],
    b: &Body,
    code: &[u8],
    moved: Vec<(u32, u32)>,
    extra: Vec<ValType>,
) -> Result<(Vec<u8>, Vec<(u32, u32)>), String> {
    let mut lr = wasmparser::BinaryReader::new(&bytes[b.range.0..b.ops_start], b.range.0);
    let n_entries = lr
        .read_var_u32()
        .map_err(|_| "a locals header does not decode")?;
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
    match &b.tightened {
        Some(h) => out.extend_from_slice(&h[entries_start - b.range.0..]),
        None => out.extend_from_slice(&bytes[entries_start..b.ops_start]),
    }
    for (n, t) in groups {
        put_uleb(&mut out, n as u64);
        put_val(&mut out, t).ok_or("a local's type does not encode")?;
    }
    let header = out.len() as u32;
    out.extend_from_slice(code);
    let moves = std::iter::once((b.range.0 as u32, 0))
        .chain(moved.into_iter().map(|(o, n)| (o, n + header)))
        .collect();
    Ok((out, moves))
}

/// The type section with every type re-encoded by `encode`, its rec groups kept.
pub(crate) fn type_section(
    s: &Scan,
    encode: &dyn Fn(&mut Vec<u8>, u32) -> Option<()>,
) -> Result<Vec<u8>, String> {
    let mut types: Vec<u8> = Vec::new();
    put_uleb(&mut types, s.groups.len() as u64);
    let mut t = 0usize;
    for &(explicit, n) in &s.groups {
        if explicit {
            types.push(0x4e);
            put_uleb(&mut types, n as u64);
        } else if n != 1 {
            return Err("an implicit rec group holds several types".into());
        }
        for _ in 0..n {
            encode(&mut types, t as u32).ok_or("a type does not re-encode")?;
            t += 1;
        }
    }
    Ok(types)
}

/// The module with a new type section and new bodies; every other section is copied.
pub(crate) fn assemble(
    s: &Scan,
    bytes: &[u8],
    mut types: Vec<u8>,
    bodies: &[std::borrow::Cow<[u8]>],
    body_moves: &[Vec<(u32, u32)>],
) -> Result<(Vec<u8>, Vec<BodyMove>), String> {
    let mut out = bytes[..8].to_vec();
    let mut moved: Vec<BodyMove> = Vec::new();
    let mut p = 8usize;
    let mut saw = (false, false);
    while p < bytes.len() {
        let id = bytes[p];
        let mut q = p + 1;
        let len = super::leb_u32(bytes, &mut q).ok_or("a section does not frame")? as usize;
        let section_end = q
            .checked_add(len)
            .filter(|&e| e <= bytes.len())
            .ok_or("frame")?;
        let payload: Option<Vec<u8>> = match id {
            1 => {
                saw.0 = true;
                Some(std::mem::take(&mut types))
            }
            10 => {
                saw.1 = true;
                let mut sec = Vec::with_capacity(len + 1024);
                put_uleb(&mut sec, bodies.len() as u64);
                let mut starts = Vec::with_capacity(bodies.len());
                for b in bodies {
                    put_uleb(&mut sec, b.len() as u64);
                    starts.push(sec.len());
                    sec.extend_from_slice(b);
                }
                let mut head = vec![id];
                put_uleb(&mut head, sec.len() as u64);
                let base = (out.len() + head.len()) as u32;
                for ((moves, &at), b) in body_moves.iter().zip(&starts).zip(&s.bodies) {
                    let at = base + at as u32;
                    moved.push(BodyMove {
                        from: b.range.0 as u32,
                        to: b.range.1 as u32,
                        pairs: moves.iter().map(|&(old, new)| (old, at + new)).collect(),
                    });
                }
                Some(sec)
            }
            _ => None,
        };
        match payload {
            Some(sec) => {
                out.push(id);
                put_uleb(&mut out, sec.len() as u64);
                out.extend_from_slice(&sec);
            }
            None => out.extend_from_slice(&bytes[p..section_end]),
        }
        p = section_end;
    }
    if saw != (true, true) {
        return Err("no type or code section".into());
    }
    Ok((out, moved))
}

fn encode_field(out: &mut Vec<u8>, f: &FieldType) -> Option<()> {
    match f.element_type {
        StorageType::I8 => out.push(0x78),
        StorageType::I16 => out.push(0x77),
        StorageType::Val(v) => put_val(out, v)?,
    }
    out.push(f.mutable as u8);
    Some(())
}

/// Type `t` in the binary format, with a parent's inlined fields expanded and a flattened
/// array's element (`flat`) made the number its record's fields share.
pub(crate) fn encode_sub(
    out: &mut Vec<u8>,
    s: &Scan,
    t: u32,
    layout: &HashMap<u32, Layout>,
    flat: &HashMap<u32, Num>,
) -> Option<()> {
    let sub = &s.subs[t as usize];
    let ct = &sub.composite_type;
    if ct.shared || ct.descriptor_idx.is_some() || ct.describes_idx.is_some() {
        return None;
    }
    let sup = sub.supertype_idx.map(|p| p.as_module_index());
    if !sub.is_final || sup.is_some() {
        out.push(if sub.is_final { 0x4f } else { 0x50 });
        match sup {
            Some(Some(i)) => {
                put_uleb(out, 1);
                put_uleb(out, i as u64);
            }
            Some(None) => return None,
            None => put_uleb(out, 0),
        }
    }
    match &ct.inner {
        CompositeInnerType::Func(ft) => {
            out.push(0x60);
            put_uleb(out, ft.params().len() as u64);
            for &v in ft.params() {
                put_val(out, v)?;
            }
            put_uleb(out, ft.results().len() as u64);
            for &v in ft.results() {
                put_val(out, v)?;
            }
        }
        CompositeInnerType::Array(at) => {
            out.push(0x5e);
            match flat.get(&t) {
                Some(n) => {
                    put_val(out, n.val())?;
                    out.push(at.0.mutable as u8);
                }
                None => encode_field(out, &at.0)?,
            }
        }
        CompositeInnerType::Struct(st) => {
            out.push(0x5f);
            match layout.get(&t) {
                None => {
                    put_uleb(out, st.fields.len() as u64);
                    for f in st.fields.iter() {
                        encode_field(out, f)?;
                    }
                }
                Some(lay) => {
                    put_uleb(out, *lay.start.last()? as u64);
                    for (j, f) in st.fields.iter().enumerate() {
                        match lay.rec[j] {
                            None => encode_field(out, f)?,
                            Some(v) => {
                                for &n in s.rec[v as usize].as_ref()? {
                                    put_val(out, n.val())?;
                                    out.push(f.mutable as u8);
                                }
                            }
                        }
                    }
                }
            }
        }
        CompositeInnerType::Cont(_) => return None,
    }
    Some(())
}
