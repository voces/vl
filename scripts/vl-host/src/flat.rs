//! The `-O`/`-O3` flattened-list step (lane S2, sunpa D3681; docs/internals/inline-records-design.md
//! slice S2), run by `inline::inline_step` on the inline-record step's output: an array whose
//! elements are small records nobody writes holds the records' fields side by side instead, so
//! a push allocates nothing and a field read is one `array.get`.
//!
//! **What qualifies.** An array type `A` of (nullable or not) references to a record `V` that
//! the inline-record step would copy (`inline::record_refusal`: never written, no observable
//! identity, a leaf, not named by a boundary signature), whose fields all have one number type;
//! `A` is in no subtyping relation, sits in `V`'s rec group, cannot cross the boundary itself,
//! and every op on it is one the step rewrites: `array.new_default`, `array.new_fixed`,
//! `array.get`, `array.set`, `array.len` (of an operand typed `A`) and `array.copy` within `A`.
//! An `array.new` (`filled(n, v)`) refuses `A`: it shares one box across every slot, and a flat
//! array would hold `n` copies of its fields. A constant expression may only make an empty
//! one. Every element stored in reachable code is non-null by its static type, or by a
//! dataflow proof that the local it is read from holds no null there.
//!
//! **The cost rule.** `A` is flattened only when no element read would allocate where today
//! it shares the box (a read that is field-read, passed to a parameter the multi-value step
//! takes as fields, or held in a local that step scalarizes is free: one set only to such
//! reads, fresh records or producer results, and read only for a field, a store back or such
//! a parameter), and when its reads come to at most `FLAT_READS_PER_STORE` whole elements per
//! store, statically (a field read is `1/n` of one): a flat read is one bounds-checked
//! `array.get` per field where a boxed one is one per element, so a list read far more often
//! than it is written stays boxed (inline-records-design.md §7).
//!
//! **The rewrite.** With `n` fields, element `i`'s field `j` is element `i * n + j` of the new
//! array. An index or length `x` becomes `x * n`, or `-n` (out of bounds) when `x * n` would
//! wrap, so every access that trapped still traps and no other does. A length read divides by
//! `n`. A store reads every field of the stored value, held in a local right after its
//! producer so the multi-value step gives a producer call its twin. A field read through an
//! optional `ref.as_non_null` is one `array.get`; any other read re-boxes with `struct.new V`,
//! a copy taken at the read.
//!
//! **Safety.** As the inline-record step's: one rec group, the output validated, the input kept
//! on any failure. Fixtures grade by output. `$VL_INLINE_EXPLAIN=1` explains each array type.

use std::collections::{HashMap, HashSet};
use wasmparser::ValType;

use crate::inline::{
    assemble, cast_if, crossing, encode_sub, finish_body, gc_op, local_op, record_refusal, ref_ty,
    type_section, ASite, AUse, ArrKind, Opnd, Scan,
};
use crate::multivalue::{put_sleb, put_uleb, BodyMove, Num};

const NONE: u32 = u32::MAX;

/// An array stays boxed when its static reads exceed this many whole elements (`n` field reads
/// each) per static store. Measured on V8, a store saves what about 6.5 whole-element reads of
/// a flat list cost over a boxed one (on wasmtime about 70): inline-records-design.md §7.
pub(crate) const FLAT_READS_PER_STORE: u32 = 6;

/// The most operands an `array.new_fixed` may have after expansion: V8's limit.
const NEW_FIXED_MAX: u32 = 10_000;

#[derive(Clone, Copy, Default)]
struct Tally {
    stores: u32,
    field: u32,
    local: u32,
    arg: u32,
    whole: u32,
    whole_in: Option<u32>,
}

/// What `tallies` finds: per array its tally, why it is refused outright, and each free read's
/// local `(array, function, local)` and parameter `(array, callee, parameter)`.
type Tallies = (
    HashMap<u32, Tally>,
    HashMap<u32, String>,
    Vec<(u32, u32, u32)>,
    Vec<(u32, u32, u32)>,
);

/// The tallies of every candidate array. For an array in `unfreed`, where the multi-value step
/// was found not to take them apart, reads into a local or a field parameter count whole.
fn tallies(
    s: &Scan,
    bytes: &[u8],
    unfreed: &HashSet<u32>,
    name: &dyn Fn(u32) -> String,
) -> Tallies {
    let mut tally: HashMap<u32, Tally> = HashMap::new();
    let mut refused: HashMap<u32, String> = HashMap::new();
    let mut held: Vec<(u32, u32, u32)> = Vec::new();
    let mut args: Vec<(u32, u32, u32)> = Vec::new();
    let mut arg_reads: Vec<(u32, u32, u32, u32)> = Vec::new();
    for (bi, b) in s.bodies.iter().enumerate() {
        let f = s.n_imports + bi as u32;
        for site in &b.asites {
            let a = site.ty;
            let t = tally.entry(a).or_default();
            let n = rec_len(s, s.arrays[&a]);
            let mut store = |o: &Opnd, op: &str| {
                t.stores += 1;
                if site.reach && o.nullable {
                    refused.entry(a).or_insert_with(|| {
                        format!(
                            "a value whose type admits null is stored into it ({op} at byte \
                             {:#x} in {})",
                            site.off,
                            name(f)
                        )
                    });
                }
            };
            match &site.kind {
                ArrKind::Set(o) => store(o, "array.set"),
                ArrKind::NewFixed(os) => {
                    for o in os {
                        store(o, "array.new_fixed");
                    }
                    if os.len() as u32 * n > NEW_FIXED_MAX {
                        refused.entry(a).or_insert_with(|| {
                            format!(
                                "an array.new_fixed of {} elements would exceed {NEW_FIXED_MAX} \
                                 operands (in {})",
                                os.len(),
                                name(f)
                            )
                        });
                    }
                }
                ArrKind::Get => match b.areads.get(&site.k) {
                    Some(AUse::Field { .. }) => t.field += 1,
                    Some(&AUse::Local { l, needs_mv }) if !(needs_mv && unfreed.contains(&a)) => {
                        t.local += 1;
                        if needs_mv {
                            held.push((a, f, l));
                        }
                    }
                    Some(&AUse::Arg { callee, arg }) if !unfreed.contains(&a) => {
                        arg_reads.push((a, callee, arg, f))
                    }
                    _ => {
                        t.whole += 1;
                        t.whole_in.get_or_insert(f);
                    }
                },
                _ => {}
            }
        }
    }
    if !arg_reads.is_empty() {
        let fo = &s
            .mv
            .get_or_init(|| crate::multivalue::field_facts(bytes))
            .fo_param;
        for (a, g, j, f) in arg_reads {
            let t = tally.entry(a).or_default();
            if fo.contains(&(g, j)) {
                t.arg += 1;
                args.push((a, g, j));
            } else {
                t.whole += 1;
                t.whole_in.get_or_insert(f);
            }
        }
    }
    (tally, refused, held, args)
}

/// The step on `bytes` (described by `s`): `Some((rewritten module, where each body came
/// from))`, or `None` when it flattens nothing.
pub(crate) fn flat_step(
    s: &Scan,
    bytes: &[u8],
    explaining: bool,
    rebox_all: bool,
    spill_all: bool,
    name: &dyn Fn(u32) -> String,
) -> Option<(Vec<u8>, Vec<BodyMove>)> {
    let mut cands: Vec<u32> = s.arrays.keys().copied().collect();
    cands.sort_unstable();
    if cands.is_empty() {
        return None;
    }
    let group_of = |t: u32| -> usize {
        let mut at = 0usize;
        for (gi, &(_, n)) in s.groups.iter().enumerate() {
            at += n;
            if (t as usize) < at {
                return gi;
            }
        }
        usize::MAX
    };
    let say = |lines: &[String]| {
        if explaining {
            for l in lines {
                eprintln!("{l}");
            }
        }
    };
    // A read into a local or a field parameter is free only if the multi-value step takes it
    // apart, and the step does so only where it rewrites the module at all. So the rewrite is
    // checked against the step's own answer, and an array it would leave a re-box in is planned
    // again with those reads counted whole (D3736).
    let mut unfreed: HashSet<u32> = HashSet::new();
    loop {
        let (tally, refused, held, args) = tallies(s, bytes, &unfreed, name);
        let mut lines: Vec<String> = Vec::new();
        let mut flat: HashMap<u32, Num> = HashMap::new();
        for &a in &cands {
            let v = s.arrays[&a];
            let t = tally.get(&a).copied().unwrap_or_default();
            let n = rec_len(s, v) as u64;
            let why = if let Some(w) = record_refusal(s, v, name) {
                Some(format!("its element type {v} is refused: {w}"))
            } else if s.supertype(a).is_some() || s.has_sub[a as usize] {
                Some("it is in a subtyping relation".into())
            } else if group_of(a) != group_of(v) {
                Some(format!(
                    "it is not in the rec group of its element type {v}"
                ))
            } else if let Some(w) = crossing(s, a, name) {
                Some(format!("it can cross the module boundary ({w})"))
            } else if let Some((w, f)) = s.arr_bad.get(&a) {
                Some(if *f == NONE {
                    w.clone()
                } else {
                    format!("{w} (in {})", name(*f))
                })
            } else if let Some(w) = refused.get(&a) {
                Some(w.clone())
            } else if t.whole > 0 && !rebox_all {
                Some(format!(
                    "{} of its {} element read(s) take the whole element (first in {}), and \
                     each would allocate a copy where today it shares the box{}",
                    t.whole,
                    t.field + t.local + t.arg + t.whole,
                    name(t.whole_in.unwrap_or(0)),
                    if unfreed.contains(&a) {
                        " (the multi-value step would not take its held reads apart)"
                    } else {
                        ""
                    }
                ))
            } else if t.field as u64 + n * (t.local + t.arg) as u64
                > FLAT_READS_PER_STORE as u64 * n * t.stores as u64
                && !rebox_all
            {
                Some(format!(
                    "its reads ({} of a field, {} of a whole element) are more than \
                     {FLAT_READS_PER_STORE} whole elements' worth per store ({} store(s)), \
                     and a flat read costs one bounds-checked array.get per field",
                    t.field,
                    t.local + t.arg,
                    t.stores
                ))
            } else {
                None
            };
            if let Some(w) = &why {
                lines.push(format!(
                    "inline-explain: array type {a} (of type {v}): not flattened: {w}"
                ));
            }
            if why.is_none() {
                let num = s.rec[v as usize].as_ref().map(|r| r[0])?;
                flat.insert(a, num);
            }
        }
        if flat.is_empty() {
            say(&lines);
            if explaining {
                eprintln!("inline-explain: no array flattened");
            }
            return None;
        }
        let out = rewrite(s, bytes, &flat, spill_all);
        let (out, moved, stats) = match out {
            Ok(x) => x,
            Err(why) => {
                say(&lines);
                if explaining {
                    eprintln!("inline-explain: flattening abandoned: {why}");
                }
                return None;
            }
        };
        if let Err(e) = wasmparser::Validator::new_with_features(wasmparser::WasmFeatures::all())
            .validate_all(&out)
        {
            say(&lines);
            if explaining {
                eprintln!(
                    "inline-explain: flattening abandoned: its output does not validate: {e}"
                );
            }
            return None;
        }
        // Does the multi-value step take apart every read counted free?
        let relied = |a: &u32| flat.contains_key(a) && !rebox_all;
        if held.iter().any(|(a, ..)| relied(a)) || args.iter().any(|(a, ..)| relied(a)) {
            let took = crate::multivalue::scalarized(&out);
            let mut left: HashSet<u32> = HashSet::new();
            for &(a, f, l) in held.iter().filter(|(a, ..)| relied(a)) {
                let ok = took.as_ref().is_some_and(|(locals, _)| {
                    locals
                        .get((f - s.n_imports) as usize)
                        .is_some_and(|ls| ls.contains(&l))
                });
                if !ok {
                    left.insert(a);
                }
            }
            for &(a, g, j) in args.iter().filter(|(a, ..)| relied(a)) {
                if !took
                    .as_ref()
                    .is_some_and(|(_, params)| params.contains(&(g, j)))
                {
                    left.insert(a);
                }
            }
            if !left.is_empty() {
                unfreed.extend(left);
                continue;
            }
        }
        say(&lines);
        if explaining {
            let mut done: Vec<u32> = flat.keys().copied().collect();
            done.sort_unstable();
            for a in done {
                let t = tally.get(&a).copied().unwrap_or_default();
                let st = stats.get(&a).copied().unwrap_or_default();
                eprintln!(
                    "inline-explain: array type {a} (of type {}): flattened; {} store(s) ({} \
                     taken apart at the producer, {} spilled), {} read(s) as fields, {} \
                     re-boxed ({} into a local the multi-value step scalarizes, {} into a field \
                     parameter)",
                    s.arrays[&a],
                    t.stores,
                    st.at_producer,
                    st.spilled,
                    st.field,
                    st.whole,
                    t.local,
                    t.arg
                );
            }
        }
        return Some((out, moved));
    }
}

fn rec_len(s: &Scan, v: u32) -> u32 {
    s.rec[v as usize].as_ref().map_or(0, |r| r.len() as u32)
}

fn i32_const(code: &mut Vec<u8>, v: i32) {
    code.push(0x41);
    put_sleb(code, v as i64);
}

/// `x` on the stack becomes `x * n`, or `-n` when that would wrap: every index it gives, plus
/// a field offset below `n`, is then out of bounds exactly when `x` was.
fn scale(code: &mut Vec<u8>, n: u32, ti: u32) {
    if n == 1 {
        return;
    }
    let limit = ((u32::MAX as u64 + 1 - n as u64) / n as u64 + 1) as u32;
    local_op(code, 0x22, ti);
    i32_const(code, n as i32);
    code.push(0x6c);
    i32_const(code, -(n as i32));
    local_op(code, 0x20, ti);
    i32_const(code, limit as i32);
    code.push(0x49);
    code.push(0x1b);
}

fn plus(code: &mut Vec<u8>, j: u32) {
    if j > 0 {
        i32_const(code, j as i32);
        code.push(0x6a);
    }
}

#[derive(Clone, Copy, Default)]
struct Stats {
    at_producer: u32,
    spilled: u32,
    field: u32,
    whole: u32,
}

type Rewritten = (Vec<u8>, Vec<BodyMove>, HashMap<u32, Stats>);

fn rewrite(
    s: &Scan,
    bytes: &[u8],
    flat: &HashMap<u32, Num>,
    spill_all: bool,
) -> Result<Rewritten, String> {
    let mut stats: HashMap<u32, Stats> = HashMap::new();
    let mut bodies: Vec<std::borrow::Cow<[u8]>> = Vec::with_capacity(s.bodies.len());
    let mut body_moves: Vec<Vec<(u32, u32)>> = Vec::with_capacity(s.bodies.len());
    for b in &s.bodies {
        let sites: Vec<&ASite> = b
            .asites
            .iter()
            .filter(|x| flat.contains_key(&x.ty))
            .collect();
        if sites.is_empty() {
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
        let ti = new_local(ValType::I32, &mut extra);
        let mut replace: HashMap<u32, Vec<u8>> = HashMap::new();
        let mut after: HashMap<u32, Vec<u8>> = HashMap::new();
        // Pass 1: each store's value is held in a local, set right after its producer when that
        // is known (so a producer call is left `call; local.set` for the multi-value step), else
        // at the store. Per store: (the local, set at the store, cast to non-null there).
        let mut held: HashMap<u32, (u32, bool, bool)> = HashMap::new();
        for site in &sites {
            let ArrKind::Set(o) = &site.kind else {
                continue;
            };
            let v = s.arrays[&site.ty];
            let st = stats.entry(site.ty).or_default();
            let tv = new_local(ref_ty(false, v).ok_or("ref type")?, &mut extra);
            let known = site.reach && o.prod != NONE && !spill_all;
            if known && !after.contains_key(&o.prod) {
                let mut a = Vec::new();
                cast_if(&mut a, o.cast);
                local_op(&mut a, 0x21, tv);
                after.insert(o.prod, a);
                st.at_producer += 1;
                held.insert(site.k, (tv, false, false));
            } else {
                st.spilled += 1;
                held.insert(site.k, (tv, true, o.cast));
            }
        }
        // Pass 2: each site's code.
        let mut consume: HashMap<u32, usize> = HashMap::new();
        for site in &sites {
            let a = site.ty;
            let v = s.arrays[&a];
            let n = rec_len(s, v);
            let k = site.k;
            let mut code = Vec::new();
            let ta = || -> Result<ValType, String> { Ok(ref_ty(true, a).ok_or("ref type")?) };
            match &site.kind {
                ArrKind::Get => {
                    let field = match b.areads.get(&k) {
                        Some(&AUse::Field { last, x })
                            if !after.contains_key(&k)
                                && (k + 1..=last).all(|q| !after.contains_key(&q)) =>
                        {
                            Some((last, x))
                        }
                        _ => None,
                    };
                    if let Some((last, x)) = field {
                        scale(&mut code, n, ti);
                        plus(&mut code, x);
                        gc_op(&mut code, 11, a, None);
                        consume.insert(k, (last - k + 1) as usize);
                        stats.entry(a).or_default().field += 1;
                    } else {
                        let tb = new_local(ValType::I32, &mut extra);
                        let tarr = new_local(ta()?, &mut extra);
                        scale(&mut code, n, ti);
                        local_op(&mut code, 0x21, tb);
                        local_op(&mut code, 0x21, tarr);
                        for j in 0..n {
                            local_op(&mut code, 0x20, tarr);
                            local_op(&mut code, 0x20, tb);
                            plus(&mut code, j);
                            gc_op(&mut code, 11, a, None);
                        }
                        gc_op(&mut code, 0, v, None);
                        stats.entry(a).or_default().whole += 1;
                        // The box is non-null already; a cast after it would hide the allocation
                        // from the multi-value step.
                        if b.cast_after.contains(&k)
                            && !after.contains_key(&k)
                            && !after.contains_key(&(k + 1))
                        {
                            consume.insert(k, 2);
                        }
                    }
                }
                ArrKind::Set(_) => {
                    let tb = new_local(ValType::I32, &mut extra);
                    let tarr = new_local(ta()?, &mut extra);
                    let &(tv, at_store, cast) = held.get(&k).ok_or("a store was not planned")?;
                    if at_store {
                        cast_if(&mut code, cast);
                        local_op(&mut code, 0x21, tv);
                    }
                    scale(&mut code, n, ti);
                    local_op(&mut code, 0x21, tb);
                    local_op(&mut code, 0x21, tarr);
                    for j in 0..n {
                        local_op(&mut code, 0x20, tarr);
                        local_op(&mut code, 0x20, tb);
                        plus(&mut code, j);
                        local_op(&mut code, 0x20, tv);
                        gc_op(&mut code, 2, v, Some(j));
                        gc_op(&mut code, 14, a, None);
                    }
                }
                ArrKind::NewDefault => {
                    scale(&mut code, n, ti);
                    gc_op(&mut code, 7, a, None);
                }
                ArrKind::NewFixed(os) => {
                    if os.is_empty() {
                        continue;
                    }
                    let tvs: Vec<u32> = os
                        .iter()
                        .map(|_| Ok(new_local(ref_ty(false, v).ok_or("ref type")?, &mut extra)))
                        .collect::<Result<_, String>>()?;
                    for (&tv, o) in tvs.iter().zip(os).rev() {
                        cast_if(&mut code, o.cast);
                        local_op(&mut code, 0x21, tv);
                    }
                    for &tv in &tvs {
                        for j in 0..n {
                            local_op(&mut code, 0x20, tv);
                            gc_op(&mut code, 2, v, Some(j));
                        }
                    }
                    code.push(0xfb);
                    put_uleb(&mut code, 8);
                    put_uleb(&mut code, a as u64);
                    put_uleb(&mut code, (os.len() as u64) * n as u64);
                    stats.entry(a).or_default().spilled += os.len() as u32;
                }
                ArrKind::Len => {
                    code.push(0xfb);
                    put_uleb(&mut code, 15);
                    if n > 1 {
                        i32_const(&mut code, n as i32);
                        code.push(0x6e);
                    }
                }
                ArrKind::Copy => {
                    let tl = new_local(ValType::I32, &mut extra);
                    let ts = new_local(ValType::I32, &mut extra);
                    let td = new_local(ValType::I32, &mut extra);
                    let tsrc = new_local(ta()?, &mut extra);
                    local_op(&mut code, 0x21, tl);
                    local_op(&mut code, 0x21, ts);
                    local_op(&mut code, 0x21, tsrc);
                    local_op(&mut code, 0x21, td);
                    local_op(&mut code, 0x20, td);
                    scale(&mut code, n, ti);
                    local_op(&mut code, 0x20, tsrc);
                    local_op(&mut code, 0x20, ts);
                    scale(&mut code, n, ti);
                    local_op(&mut code, 0x20, tl);
                    scale(&mut code, n, ti);
                    code.push(0xfb);
                    put_uleb(&mut code, 17);
                    put_uleb(&mut code, a as u64);
                    put_uleb(&mut code, a as u64);
                }
            }
            if replace.insert(k, code).is_some() {
                return Err("two rewrites claim one op".into());
            }
        }
        // Stream the body with the plan.
        let mut reader = wasmparser::OperatorsReader::new(wasmparser::BinaryReader::new(
            &bytes[b.ops_start..b.range.1],
            b.ops_start,
        ));
        let mut offs: Vec<(usize, usize)> = Vec::new();
        while !reader.eof() {
            let (_, off) = reader
                .read_with_offset()
                .map_err(|_| "a body does not decode")?;
            let end = if reader.eof() {
                b.range.1
            } else {
                reader.original_position()
            };
            offs.push((off, end));
        }
        let mut code: Vec<u8> = Vec::with_capacity(b.range.1 - b.ops_start + 64);
        let mut moved: Vec<(u32, u32)> = Vec::with_capacity(offs.len());
        let mut i = 0usize;
        while i < offs.len() {
            let (off, end) = offs[i];
            let k = i as u32;
            moved.push((off as u32, code.len() as u32));
            match replace.get(&k) {
                Some(r) => code.extend_from_slice(r),
                None => code.extend_from_slice(&bytes[off..end]),
            }
            let consumed = consume.get(&k).copied().unwrap_or(1);
            if let Some(a) = after.get(&k) {
                code.extend_from_slice(a);
            }
            for q in 1..consumed {
                moved.push((offs[i + q].0 as u32, code.len() as u32));
            }
            i += consumed;
        }
        let (out, moves) = finish_body(bytes, b, &code, moved, extra)?;
        bodies.push(std::borrow::Cow::Owned(out));
        body_moves.push(moves);
    }
    let types = type_section(s, &|out, t| encode_sub(out, s, t, &HashMap::new(), flat))?;
    let (out, moved) = assemble(s, bytes, types, &bodies, &body_moves)?;
    Ok((out, moved, stats))
}
