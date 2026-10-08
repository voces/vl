//! Names the heap types a validator "type mismatch" elides.
//!
//! wasmparser renders every concrete reference as `(ref $type)` (and a canonical id as
//! `(id N)`), so `expected (ref $type), found (ref null $type)` names nothing a reader can
//! act on. `explain` re-validates the module, stops at the failing operator, reads the two
//! types off the validator's own operand stack and the operator's signature, and rewrites the
//! sentence with module type indices, adding each index's VL type name (asked of the compiler
//! that emitted the module) and its struct or array shape.
//!
//! It never guesses: a sentence it cannot match exactly is left as the engine wrote it.

use std::collections::HashMap;
use std::fmt::Write as _;

use wasmparser::types::{CoreTypeId, TypeIdentifier};
use wasmparser::{
    BinaryReader, BlockType, CompositeInnerType, FrameKind, FuncValidator, HeapType, Operator,
    OperatorsReader, Parser, RefType, StorageType, SubType, UnpackedIndex, ValType, ValidPayload,
    Validator, ValidatorResources, WasmFeatures, WasmModuleResources,
};

/// `sentence` with its elided heap types named, or `None` when there is nothing to name or
/// the module's own failure does not match it. `vl_name` answers a module type index's VL
/// type name, or "" when it has none.
pub fn explain(
    bytes: &[u8],
    sentence: &str,
    vl_name: &mut dyn FnMut(u32) -> String,
) -> Option<String> {
    if !sentence.contains("$type") && !sentence.contains("(id ") {
        return None;
    }
    let fail = find_failure(bytes)?;
    let mut legend: Vec<u32> = Vec::new();
    let mut msg = fail.message.clone();
    if let Some((want, got)) = &fail.pair {
        let elided = format!("expected {}, found {}", elided(want), elided(got));
        if msg.contains(&elided) {
            let named = format!(
                "expected {}, found {}",
                fail.render(want, &mut legend),
                fail.render(got, &mut legend)
            );
            msg = msg.replace(&elided, &named);
        }
    }
    msg = fail.rename_ids(&msg, &mut legend);
    if legend.is_empty() || !sentence.contains(&fail.message) {
        return None;
    }
    let mut notes = String::new();
    for idx in &legend {
        let shape = fail.shape(*idx);
        let name = vl_name(*idx);
        let _ = write!(notes, "; ${idx} is ");
        if !name.is_empty() {
            let _ = write!(notes, "`{name}`, ");
        }
        notes.push_str(&shape);
    }
    Some(sentence.replacen(&fail.message, &format!("{msg}{notes}"), 1))
}

/// `t` as the validator's messages write it: a concrete heap type is `$type`.
fn elided(t: &ValType) -> String {
    match t {
        ValType::Ref(r) if matches!(r.heap_type(), HeapType::Concrete(_)) => {
            if r.is_nullable() {
                "(ref null $type)".to_string()
            } else {
                "(ref $type)".to_string()
            }
        }
        _ => t.to_string(),
    }
}

/// What the re-validation saw at the failing operator.
struct Failure {
    /// The validator's own sentence, without its offset.
    message: String,
    /// The (expected, found) pair the sentence names, when the operator's signature gives one.
    pair: Option<(ValType, ValType)>,
    /// Each module type, by index.
    subtypes: Vec<SubType>,
    /// A canonical type id's number to its module index.
    by_id: HashMap<u32, u32>,
}

impl Failure {
    fn index_of(&self, u: &UnpackedIndex) -> Option<u32> {
        match u {
            UnpackedIndex::Module(i) => Some(*i),
            UnpackedIndex::Id(id) => self.by_id.get(&(id.index() as u32)).copied(),
            UnpackedIndex::RecGroup(_) => None,
        }
    }

    /// `t` as the validator writes it, with a concrete heap type's module index in place
    /// of `$type`, recording that index in `legend`.
    fn render(&self, t: &ValType, legend: &mut Vec<u32>) -> String {
        let ValType::Ref(r) = t else {
            return t.to_string();
        };
        let HeapType::Concrete(u) = r.heap_type() else {
            return t.to_string();
        };
        let Some(idx) = self.index_of(&u) else {
            return t.to_string();
        };
        if !legend.contains(&idx) {
            legend.push(idx);
        }
        if r.is_nullable() {
            format!("(ref null ${idx})")
        } else {
            format!("(ref ${idx})")
        }
    }

    /// `msg` with each `(id N)` the validator printed replaced by its module index.
    fn rename_ids(&self, msg: &str, legend: &mut Vec<u32>) -> String {
        let mut out = String::new();
        let mut rest = msg;
        while let Some(k) = rest.find("(id ") {
            let tail = &rest[k + 4..];
            let digits: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
            let close = tail[digits.len()..].starts_with(')');
            match digits.parse::<u32>().ok().and_then(|n| self.by_id.get(&n)) {
                Some(idx) if close => {
                    if !legend.contains(idx) {
                        legend.push(*idx);
                    }
                    out.push_str(&rest[..k]);
                    let _ = write!(out, "${idx}");
                    rest = &tail[digits.len() + 1..];
                }
                _ => {
                    out.push_str(&rest[..k + 4]);
                    rest = tail;
                }
            }
        }
        out.push_str(rest);
        out
    }

    /// Type `idx`'s structure: `struct {i32, mut (ref $1)}`, `array (mut i8)` or a function.
    fn shape(&self, idx: u32) -> String {
        let Some(st) = self.subtypes.get(idx as usize) else {
            return "a type".to_string();
        };
        let mut scratch = Vec::new();
        let field = |f: &wasmparser::FieldType, scratch: &mut Vec<u32>| {
            let ty = match f.element_type {
                StorageType::I8 => "i8".to_string(),
                StorageType::I16 => "i16".to_string(),
                StorageType::Val(v) => self.render(&v, scratch),
            };
            if f.mutable {
                format!("mut {ty}")
            } else {
                ty
            }
        };
        match &st.composite_type.inner {
            CompositeInnerType::Struct(s) => {
                let fs: Vec<String> = s.fields.iter().map(|f| field(f, &mut scratch)).collect();
                format!("struct {{{}}}", fs.join(", "))
            }
            CompositeInnerType::Array(a) => format!("array ({})", field(&a.0, &mut scratch)),
            CompositeInnerType::Func(_) => "a function type".to_string(),
            _ => "a type".to_string(),
        }
    }
}

/// Re-validates `bytes` and describes the first failing operator, or `None` when the module
/// validates or fails outside a function body.
fn find_failure(bytes: &[u8]) -> Option<Failure> {
    let mut validator = Validator::new_with_features(WasmFeatures::all());
    let mut by_id: HashMap<u32, u32> = HashMap::new();
    let mut subtypes: Vec<SubType> = Vec::new();
    for payload in Parser::new(0).parse_all(bytes) {
        let payload = payload.ok()?;
        match validator.payload(&payload).ok()? {
            ValidPayload::Func(func, body) => {
                if subtypes.is_empty() {
                    let types = validator.types(0)?;
                    for i in 0..types.core_type_count_in_module() {
                        let id: CoreTypeId = types.core_type_at_in_module(i);
                        by_id.insert(id.index() as u32, i);
                        subtypes.push(types[id].clone());
                    }
                }
                let mut fv = func.into_validator(Default::default());
                let mut reader: BinaryReader = body.get_binary_reader();
                fv.read_locals(&mut reader).ok()?;
                let mut ops = OperatorsReader::new(reader);
                while !ops.eof() {
                    let (op, off) = ops.read_with_offset().ok()?;
                    // Read before `op` runs: a failed operator may leave the stack popped.
                    let pairs: Vec<(ValType, Option<ValType>)> = expected_operands(&fv, &op)
                        .into_iter()
                        .map(|(d, want)| (want, fv.get_operand_type(d).flatten()))
                        .collect();
                    if let Err(e) = fv.op(off, &op) {
                        let message = e.message().to_string();
                        let pair = pairs.into_iter().find_map(|(want, got)| {
                            let got = got?;
                            let elided =
                                format!("expected {}, found {}", elided(&want), elided(&got));
                            message.contains(&elided).then_some((want, got))
                        });
                        return Some(Failure {
                            message,
                            pair,
                            subtypes,
                            by_id,
                        });
                    }
                }
            }
            ValidPayload::End(_) => return None,
            _ => {}
        }
    }
    None
}

/// The operand types operator `op` demands, each with its stack depth before `op` runs.
fn expected_operands(
    fv: &FuncValidator<ValidatorResources>,
    op: &Operator,
) -> Vec<(usize, ValType)> {
    let res = fv.resources();
    let func_ty = |id: CoreTypeId| res.sub_type_at_id(id).composite_type.inner.clone();
    let params_of = |inner: CompositeInnerType| match inner {
        CompositeInnerType::Func(f) => f.params().to_vec(),
        _ => Vec::new(),
    };
    let results_of = |inner: CompositeInnerType| match inner {
        CompositeInnerType::Func(f) => f.results().to_vec(),
        _ => Vec::new(),
    };
    let module_ty = |idx: u32| res.sub_type_at(idx).map(|s| s.composite_type.inner.clone());
    let nullable_ref = |idx: u32| {
        RefType::new(true, HeapType::Concrete(UnpackedIndex::Module(idx))).map(ValType::Ref)
    };
    let stacked = |tys: Vec<ValType>, below: usize| -> Vec<(usize, ValType)> {
        tys.into_iter()
            .rev()
            .enumerate()
            .map(|(d, t)| (d + below, t))
            .collect()
    };
    let unpack = |s: StorageType| match s {
        StorageType::Val(v) => v,
        _ => ValType::I32,
    };
    let block_results = |bt: BlockType| match bt {
        BlockType::Empty => Vec::new(),
        BlockType::Type(t) => vec![t],
        BlockType::FuncType(i) => module_ty(i).map(results_of).unwrap_or_default(),
    };
    let label_types = |depth: u32| -> Vec<ValType> {
        let Some(frame) = fv.get_control_frame(depth as usize) else {
            return Vec::new();
        };
        if frame.kind == FrameKind::Loop {
            match frame.block_type {
                BlockType::FuncType(i) => module_ty(i).map(params_of).unwrap_or_default(),
                _ => Vec::new(),
            }
        } else if depth + 1 == fv.control_stack_height() {
            res.type_id_of_function(fv.index())
                .map(|id| results_of(func_ty(id)))
                .unwrap_or_default()
        } else {
            block_results(frame.block_type)
        }
    };
    match op {
        Operator::Call { function_index } | Operator::ReturnCall { function_index } => res
            .type_id_of_function(*function_index)
            .map(|id| stacked(params_of(func_ty(id)), 0))
            .unwrap_or_default(),
        Operator::CallRef { type_index } | Operator::ReturnCallRef { type_index } => {
            let mut v: Vec<(usize, ValType)> = nullable_ref(*type_index)
                .map(|r| (0, r))
                .into_iter()
                .collect();
            v.extend(stacked(
                module_ty(*type_index).map(params_of).unwrap_or_default(),
                1,
            ));
            v
        }
        Operator::Return => stacked(label_types(fv.control_stack_height().saturating_sub(1)), 0),
        Operator::End | Operator::Else => stacked(label_types(0), 0),
        Operator::Br { relative_depth } => stacked(label_types(*relative_depth), 0),
        Operator::BrIf { relative_depth } => stacked(label_types(*relative_depth), 1),
        Operator::LocalSet { local_index } | Operator::LocalTee { local_index } => fv
            .get_local_type(*local_index)
            .map(|t| (0, t))
            .into_iter()
            .collect(),
        Operator::GlobalSet { global_index } => res
            .global_at(*global_index)
            .map(|g| (0, g.content_type))
            .into_iter()
            .collect(),
        Operator::StructNew { struct_type_index } => match module_ty(*struct_type_index) {
            Some(CompositeInnerType::Struct(s)) => {
                stacked(s.fields.iter().map(|f| unpack(f.element_type)).collect(), 0)
            }
            _ => Vec::new(),
        },
        Operator::StructSet {
            struct_type_index,
            field_index,
        } => {
            let mut v = Vec::new();
            if let Some(CompositeInnerType::Struct(s)) = module_ty(*struct_type_index) {
                if let Some(f) = s.fields.get(*field_index as usize) {
                    v.push((0, unpack(f.element_type)));
                }
            }
            v.extend(nullable_ref(*struct_type_index).map(|r| (1, r)));
            v
        }
        Operator::StructGet {
            struct_type_index, ..
        }
        | Operator::StructGetS {
            struct_type_index, ..
        }
        | Operator::StructGetU {
            struct_type_index, ..
        } => nullable_ref(*struct_type_index)
            .map(|r| (0, r))
            .into_iter()
            .collect(),
        Operator::ArrayGet { array_type_index }
        | Operator::ArrayGetS { array_type_index }
        | Operator::ArrayGetU { array_type_index } => nullable_ref(*array_type_index)
            .map(|r| (1, r))
            .into_iter()
            .collect(),
        Operator::ArraySet { array_type_index } => {
            let mut v = Vec::new();
            if let Some(CompositeInnerType::Array(a)) = module_ty(*array_type_index) {
                v.push((0, unpack(a.0.element_type)));
            }
            v.extend(nullable_ref(*array_type_index).map(|r| (2, r)));
            v
        }
        Operator::ArrayNew { array_type_index } => match module_ty(*array_type_index) {
            Some(CompositeInnerType::Array(a)) => vec![(1, unpack(a.0.element_type))],
            _ => Vec::new(),
        },
        Operator::ArrayNewFixed {
            array_type_index,
            array_size,
        } => match module_ty(*array_type_index) {
            // `array_size` is read straight off the module: past the operand stack's height the
            // operator fails on arity, not on a type, so there is no pair to name.
            Some(CompositeInnerType::Array(a)) if *array_size <= fv.operand_stack_height() => {
                let t = unpack(a.0.element_type);
                (0..*array_size as usize).map(|d| (d, t)).collect()
            }
            _ => Vec::new(),
        },
        _ => Vec::new(),
    }
}
