#!/usr/bin/env python3
"""The grammar of ORDINARY VL programs, as data.

Every other instrument in this repo samples a population somebody already named: a
capability probe is one hand-written program per KNOWN gap, the distilled corpus is
generated over FIXED axes, a position matrix takes a template. This table is the
population nobody named — the shapes a tutorial would contain — and the sampler pairs
two spellings of one program out of it so a disagreement is self-validating.

Weighting is deliberately toward the TEXTBOOK end: D1473 was the most ordinary shape in
the batch that found it (a discriminated-union `area(s: Shape)`), and a grammar that
optimises for coverage of the type lattice drifts exotic and the rate falls. See
docs/internals/day-one-sampler.md.

Nothing here renders; `render.py` walks these records. Nothing here runs a program;
`sample.py` does. Keeping the three apart is what lets the grammar grow without the
grader's vocabulary drifting from `scripts/capability-probes/run.py`'s.
"""

# ---------------------------------------------------------------------------
# VALUES. Each record is one ordinary type, in BOTH spellings.
#
#   decls    (name, rhs) type declarations the NAMED face emits
#   named    the type spelling that uses those names
#   inline   the same type with every name expanded — the spelling fixtures avoid
#   expr     a single expression of the type, or None when `mk` builds it
#   mk       statement lines ending in `return`, wrapped in a helper returning {T}.
#            A value whose bare literal would infer something ELSE than the declared
#            type (`3` is not `i32 | string`) MUST use `mk`, or the inferred face of a
#            pair is a different program and every disagreement is the generator's.
#   alt      another expression of the type, for `??` defaults and re-assignment
#   reads    how the value is consumed; each carries the exact expected stdout
#
# A read's `want` is the CONTRACT the pair is graded on. `named_only` marks a read
# whose spelling needs a declared name (`is Rect`), which the inline face cannot
# write — that pair is graded on RUNS-ness alone (see render.asymmetric).
# ---------------------------------------------------------------------------

REC_DECL = ("Rec", "{ name: string, n: i32 }")
REC_INLINE = "{ name: string, n: i32 }"
REC_EXPR = '{ name: "ada", n: 3 }'
REC_ALT = '{ name: "zed", n: 0 }'

# OPERATOR OVERLOADING. `isStrFuncName` (`compiler/parser.vl`) admits `[]`, `[]=` and
# `+ - * / % ^ > >= < <=` as quoted function names, dispatched by the `self` parameter's
# TYPE — DECISIONS.md B14, "the one place ad-hoc overloading is allowed". `==` / `!=` are
# the design's bounded exclusion, and the parser says so, so no record declares one: both
# faces would refuse together and a both-fail is not a hit.
#
# Every record declares the operator AND a plain function with the same body, so the two
# faces of `operator_vs_call` differ in ONE LINE — which spelling the read uses. Both
# declarations stand in both faces, so a disagreement is about the CALL and not about
# whether declaring an operator perturbs the module at all.
#
# The receiver is a `new` NOMINAL type because the receiver type IS the dispatch key, which
# is also why these carry `no_inline`: expanding the name away is a different type and
# takes the operator with it. `alt` is a CALL for the same reason — a bare object literal
# in `??` or a re-assignment infers the structure, not the brand.


def _op_alt(name, ty):
    """The record's `alt`, as a function so the value keeps its nominal type wherever
    the generator drops it un-annotated."""
    return ["function %s(): %s {" % (name, ty),
            "  const r: %s = { x: 9 }" % ty,
            "  return r",
            "}"]


OP_MK = ["const r: {T} = { x: 3 }", "return r"]

VALUES = [
    {
        "id": "i32", "weight": 4, "decls": [], "named": "i32", "inline": "i32",
        "expr": "7", "alt": "0", "alt_infers": True, "features": ["scalar"],
        # MIXED-WIDTH arithmetic. `numWidensName` allows exactly three lossless edges —
        # `i32 -> i64`, `i32 -> f64`, `f32 -> f64` — and the operand is a LITERAL, so these
        # reads need no declaration and the record keeps declining `named_vs_inline`.
        # `same_add` is the CONTROL beside them: a disagreement it shares is not a widening
        # defect, which a table of mixed pairs alone could not tell.
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["7"]},
                  {"id": "same_add", "mix": "same",
                   "lines": ["print({v} + 1)"], "want": ["8"]},
                  {"id": "mix_i64", "mix": "i32->i64",
                   "lines": ["print({v} + 9000000000)"], "want": ["9000000007"]},
                  {"id": "mix_f64", "mix": "i32->f64",
                   "lines": ["print({v} + 2.5)"], "want": ["9.5"]},
                  {"id": "mix_f64_mul", "mix": "i32->f64",
                   "lines": ["print({v} * 2.5)"], "want": ["17.5"]},
                  {"id": "mix_cmp_i64", "mix": "i32->i64",
                   "lines": ["if {v} < 9000000000 { print(1) } else { print(0) }"],
                   "want": ["1"]}],
    },
    {
        "id": "f64", "weight": 2, "decls": [], "named": "f64", "inline": "f64",
        "expr": "2.5", "alt": "0.0", "alt_infers": True, "features": ["scalar", "f64"],
        # `arith` is the SAME-width control the record already had; `same_add` states it
        # in the shape the mixed reads use, and `mix_lit_i32` is the `i32 -> f64` edge with
        # the literal on the narrow side.
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["2.5"]},
                  {"id": "arith", "mix": "same",
                   "lines": ["print({v} * 2.0)"], "want": ["5"]},
                  {"id": "same_add", "mix": "same",
                   "lines": ["print({v} + 2.5)"], "want": ["5"]},
                  {"id": "mix_lit_i32", "mix": "i32->f64",
                   "lines": ["print({v} + 1)"], "want": ["3.5"]}],
    },
    {
        # The THIRD lossless edge, `f32 -> f64`, which no record could reach: there is no f32
        # literal, so the value has to come from an annotated return. No decls, so this record
        # declines `named_vs_inline` exactly as the other scalars do.
        "id": "f32", "weight": 2, "decls": [], "named": "f32", "inline": "f32",
        "expr": None, "mk": ["return 1.5"], "alt": "0.0",
        "features": ["scalar", "f32"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["1.5"]},
                  {"id": "same_add", "mix": "same",
                   "lines": ["print({v} + 1.5)"], "want": ["3"]},
                  {"id": "mix_f64", "mix": "f32->f64",
                   "lines": ["const wf: f64 = 2.5", "print({v} + wf)"], "want": ["4"]},
                  # The integer LITERAL adopts the context here, where the VALUE edge
                  # `i32 -> f32` is refused as lossy — a different rule from the lattice,
                  # so it gets its own read rather than riding the `i32 -> f64` tag.
                  {"id": "lit_default", "mix": "lit->f32",
                   "lines": ["print({v} + 1)"], "want": ["2.5"]}],
    },
    {
        "id": "string", "weight": 3, "decls": [], "named": "string", "inline": "string",
        "expr": '"hello"', "alt": '""', "alt_infers": True, "features": ["scalar", "string"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["hello"]},
                  {"id": "concat", "lines": ['print({v} + "!")'], "want": ["hello!"]},
                  {"id": "len", "lines": ["print({v}.length)"], "want": ["5"]}],
    },
    {
        "id": "boolean", "weight": 2, "decls": [], "named": "boolean",
        "inline": "boolean", "expr": "true", "alt": "false", "alt_infers": True, "features": ["scalar"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["true"]},
                  {"id": "branch",
                   "lines": ["if {v} { print(1) } else { print(0) }"], "want": ["1"]}],
    },
    {
        "id": "i64", "weight": 2, "decls": [], "named": "i64", "inline": "i64",
        "expr": "9000000000", "alt": "0", "features": ["scalar", "i64"],
        # The widening runs the OTHER way here: the literal is the narrow side. `same_add`
        # is the control, and `mix_div` is the same edge through a different operator —
        # `/` has its own lowering, so an edge proven at `+` is not proven at `/`.
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["9000000000"]},
                  {"id": "same_add", "mix": "same",
                   "lines": ["print({v} + 9000000000)"], "want": ["18000000000"]},
                  {"id": "mix_lit_i32", "mix": "i32->i64",
                   "lines": ["print({v} + 1)"], "want": ["9000000001"]},
                  {"id": "mix_div", "mix": "i32->i64",
                   "lines": ["print({v} / 2)"], "want": ["4500000000"]}],
    },
    {
        "id": "rec", "weight": 4, "decls": [REC_DECL], "named": "Rec",
        "inline": REC_INLINE, "expr": REC_EXPR, "alt": REC_ALT, "alt_infers": True,
        "features": ["struct"],
        "reads": [{"id": "field", "lines": ["print({v}.n)"], "want": ["3"]},
                  {"id": "strfield", "lines": ["print({v}.name)"], "want": ["ada"]}],
    },
    {
        # D1473's own shape: a union of struct arms with a literal discriminant.
        "id": "dunion", "weight": 5,
        "decls": [("Circle", '{ kind: "circle", r: f64 }'),
                  ("Rect", '{ kind: "rect", w: f64, h: f64 }'),
                  ("Shape", "Circle | Rect")],
        "named": "Shape",
        "inline": '{ kind: "circle", r: f64 } | { kind: "rect", w: f64, h: f64 }',
        "expr": None, "mk": ['return { kind: "rect", w: 2.0, h: 3.0 }'],
        "alt": '{ kind: "circle", r: 1.0 }',
        "features": ["union", "struct", "discriminant"],
        "reads": [
            {"id": "eq_narrow", "narrow": "eq",
             "lines": ['if {v}.kind == "rect" { print({v}.w) } else { print(0) }'],
             "want": ["2"]},
            {"id": "is_narrow", "narrow": "is", "named_only": True,
             "lines": ["if {v} is Rect { print({v}.w) } else { print(0) }"],
             "want": ["2"]},
            # The `match` spelling of the same test, with the arm BINDING its payload —
            # the shape the rename/nest landings touched. Named-only for `is_narrow`'s
            # reason: an arm names a declared type, which the inline face has none of.
            {"id": "match_bind", "narrow": "match", "named_only": True,
             "lines": ["match {v} {", "  Rect{w} => print(w)", "  Circle => print(0)",
                       "}"],
             "want": ["2"]},
            {"id": "shared", "lines": ["print({v}.kind)"], "want": ["rect"]},
        ],
    },
    {
        # Distinct-shaped arms, no literal discriminant: `is` is the only narrowing,
        # and it has no inline twin. `kind` is shared so the inline face can read it.
        "id": "sunion", "weight": 2,
        "decls": [("Dot", "{ kind: i32, r: f64 }"), ("Box", "{ kind: i32, w: f64 }"),
                  ("Fig", "Dot | Box")],
        "named": "Fig", "inline": "{ kind: i32, r: f64 } | { kind: i32, w: f64 }",
        "expr": None, "mk": ["return { kind: 2, w: 4.0 }"],
        "alt": "{ kind: 1, r: 1.0 }",
        "features": ["union", "struct"],
        # `thru` is the generic PIN the narrow-and-pin reads route through. It shares no name
        # with the `pinning` axis's `pass`, so the two never collide when both fire.
        "fns": ["function thru<T>(x: T): T { return x }"],
        "reads": [
            {"id": "shared", "lines": ["print({v}.kind)"], "want": ["2"]},
            {"id": "is_narrow", "narrow": "is", "named_only": True,
             "lines": ["if {v} is Box { print({v}.w) } else { print(0) }"],
             "want": ["4"]},
            # This record's narrow group had ONE member, so the `narrowing` axis never
            # applied to it at all: a second spelling is what makes the axis reachable
            # for a union with no literal discriminant.
            {"id": "match_bind", "narrow": "match", "named_only": True,
             "lines": ["match {v} {", "  Box{w} => print(w)", "  Dot => print(0)", "}"],
             "want": ["4"]},
            # NARROW x GENERIC-PIN. The value narrowed to `Box`, then routed through a generic
            # hole so the pin sees the REFINED member's rep, not the union box's. Each shares
            # its narrow group with the un-pinned read above, so the `narrowing` axis pairs
            # pinned against un-pinned — the same-shape control that makes a hit falsifiable.
            {"id": "is_pin", "narrow": "is", "named_only": True, "xnp": "is",
             "lines": ["if {v} is Box { print(thru({v}).w) } else { print(0) }"],
             "want": ["4"]},
            {"id": "match_pin", "narrow": "match", "named_only": True, "xnp": "match",
             "lines": ["match {v} {", "  Box{w} => print(thru(w))", "  Dot => print(0)",
                       "}"],
             "want": ["4"]},
        ],
    },
    {
        "id": "litunion", "weight": 3, "decls": [("Color", '"red" | "green"')],
        "named": "Color", "inline": '"red" | "green"', "expr": None,
        "mk": ['return "red"'], "alt": '"green"', "features": ["litunion"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["red"]},
                  {"id": "eq_narrow", "narrow": "eq",
                   "lines": ['if {v} == "red" { print(1) } else { print(0) }'],
                   "want": ["1"]},
                  # SYMMETRIC, unlike every other `match` read here: a literal arm names
                  # no declared type, so the inline face spells it too and
                  # `named_vs_inline` gets a `match` pair rather than an asymmetric one.
                  {"id": "match_lit", "narrow": "match",
                   "lines": ["match {v} {", '  "red" => print(1)',
                             '  "green" => print(0)', "}"],
                   "want": ["1"]}],
    },
    {
        "id": "nullable_ref", "weight": 4,
        "decls": [REC_DECL, ("MaybeRec", "Rec | null")],
        "named": "MaybeRec", "inline": REC_INLINE + " | null",
        "expr": None, "mk": ["return " + REC_EXPR], "alt": "null",
        "features": ["nullable", "struct"],
        "fns": ["function thru<T>(x: T): T { return x }"],
        "reads": [
            {"id": "nullcheck", "narrow": "ne_null",
             "lines": ["if {v} != null { print({v}.n) } else { print(0) }"],
             "want": ["3"]},
            # NARROW x GENERIC-PIN, the nullable face: the value narrowed non-null then routed
            # through a generic hole, so the pin sees a `Rec` where the un-narrowed rep is the
            # `Rec | null` niche. `ne_pin` pairs with `nullcheck`, `match_null_pin` with
            # `match_null` — each its own un-pinned control in the same narrow group.
            {"id": "ne_pin", "narrow": "ne_null", "xnp": "ne_null",
             "lines": ["if {v} != null { print(thru({v}).n) } else { print(0) }"],
             "want": ["3"]},
            {"id": "match_null_pin", "narrow": "match", "named_only": True, "xnp": "match",
             "lines": ["match {v} {", "  Rec{n} => print(thru(n))", "  null => print(0)",
                       "}"],
             "want": ["3"]},
            {"id": "isnull", "narrow": "is_null",
             "lines": ["if {v} is null { print(0) } else { print({v}.n) }"],
             "want": ["3"]},
            {"id": "coalesce",
             "lines": ["print(({v} ?? " + REC_ALT + ").n)"], "want": ["3"]},
            # The `null` ARM. Exhaustiveness demands it like any other member, so this is
            # the spelling where a missing case is a check error, not a fall-through.
            {"id": "match_null", "narrow": "match", "named_only": True,
             "lines": ["match {v} {", "  Rec{n} => print(n)", "  null => print(0)", "}"],
             "want": ["3"]},
        ],
    },
    {
        "id": "nullable_scalar", "weight": 3, "decls": [("MaybeN", "i32 | null")],
        "named": "MaybeN", "inline": "i32 | null", "expr": None,
        "mk": ["return 4"], "alt": "null", "features": ["nullable", "scalar"],
        "reads": [
            {"id": "coalesce", "lines": ["print({v} ?? 0)"], "want": ["4"]},
            {"id": "nullcheck", "narrow": "ne_null",
             "lines": ["if {v} != null { print({v}) } else { print(0) }"],
             "want": ["4"]},
            {"id": "isnull", "narrow": "is_null",
             "lines": ["if {v} is null { print(0) } else { print({v}) }"],
             "want": ["4"]},
            # Symmetric, unlike the struct twin: the arm names a PRIM, which needs no
            # declaration, so the inline face spells it too.
            {"id": "match_null", "narrow": "match",
             "lines": ["match {v} {", "  i32 => print({v})", "  null => print(0)", "}"],
             "want": ["4"]},
        ],
    },
    {
        "id": "list_i32", "weight": 3, "decls": [], "named": "i32[]", "inline": "i32[]",
        "expr": "[1, 2, 3]", "alt": "[0]", "alt_infers": True, "features": ["list", "scalar"],
        "reads": [{"id": "len", "lines": ["print({v}.length)"], "want": ["3"]},
                  {"id": "elem", "lines": ["print({v}[0])"], "want": ["1"]},
                  {"id": "forin",
                   "lines": ["let sum = 0", "for it in {v} { sum = sum + it }",
                             "print(sum)"], "want": ["6"]}],
    },
    {
        "id": "list_rec", "weight": 3, "decls": [REC_DECL], "named": "Rec[]",
        "inline": REC_INLINE + "[]", "expr": "[" + REC_EXPR + "]", "alt": "[" + REC_ALT + "]", "alt_infers": True,
        "features": ["list", "struct"],
        "reads": [{"id": "len", "lines": ["print({v}.length)"], "want": ["1"]},
                  {"id": "elem", "lines": ["print({v}[0].n)"], "want": ["3"]},
                  {"id": "forin", "lines": ["for it in {v} { print(it.n) }"],
                   "want": ["3"]}],
    },
    {
        "id": "map_str_i32", "weight": 2, "decls": [], "named": "{[string]: i32}",
        "inline": "{[string]: i32}", "expr": None,
        "mk": ["const m: {T} = Map()", 'm["k"] = 4', "return m"],
        "alt": "Map()", "features": ["map", "scalar"],
        "reads": [{"id": "size", "lines": ["print({v}.size)"], "want": ["1"]},
                  {"id": "read", "lines": ['print({v}["k"] ?? 0)'], "want": ["4"]}],
    },
    {
        "id": "map_str_rec", "weight": 2, "decls": [REC_DECL],
        "named": "{[string]: Rec}", "inline": "{[string]: " + REC_INLINE + "}",
        "expr": None,
        "mk": ["const m: {T} = Map()", 'm["k"] = ' + REC_EXPR, "return m"],
        "alt": "Map()", "features": ["map", "struct"],
        "reads": [{"id": "size", "lines": ["print({v}.size)"], "want": ["1"]},
                  {"id": "read", "lines": ['print(({v}["k"] ?? ' + REC_ALT + ").n)"],
                   "want": ["3"]}],
    },
    {
        "id": "closure", "weight": 2, "decls": [("Inc", "(i32) => i32")],
        "named": "Inc", "inline": "(i32) => i32", "expr": "(x: i32) => x + 1",
        "alt": "(x: i32) => x", "alt_infers": True, "features": ["closure"],
        "reads": [{"id": "call", "lines": ["print({v}(4))"], "want": ["5"]}],
    },
    {
        "id": "valunion", "weight": 3, "decls": [("Val", "i32 | string")],
        "named": "Val", "inline": "i32 | string", "expr": None,
        "mk": ["return 3"], "alt": '"x"',
        "features": ["union", "scalar"],
        "reads": [{"id": "is_narrow", "narrow": "is",
                   "lines": ["if {v} is i32 { print({v}) } else { print(0) }"],
                   "want": ["3"]},
                  {"id": "match_atom", "narrow": "match",
                   "lines": ["match {v} {", "  i32 => print({v})",
                             "  string => print(0)", "}"],
                   "want": ["3"]},
                  {"id": "as_q", "lines": ["print({v} as? i32 ?? -1)"], "want": ["3"]},
                  {"id": "bare", "lines": ["print({v})"], "want": ["3"]}],
    },
    # ── RECURSIVE types ────────────────────────────────────────────────────────────
    # A recursive type has NO inline spelling by construction — expanding `Node` inside
    # `Node` does not terminate — so these carry `no_inline` and the `named_vs_inline` axis
    # declines them. That is a property of the feature, not a gap in the grammar, and it is
    # why the CONTROL below is a non-recursive record of the same field shape: if the flat
    # twin refuses too, the recursion is not the ingredient.
    {
        "id": "rec_node", "weight": 3, "no_inline": True,
        "decls": [("Node", "{ v: i32, next: Node | null }")],
        "named": "Node", "inline": "Node", "expr": None,
        "mk": ["return { v: 1, next: { v: 2, next: null } }"],
        "alt": "{ v: 9, next: null }",
        "features": ["struct", "recursive", "nullable"],
        "reads": [
            {"id": "depth0", "lines": ["print({v}.v)"], "want": ["1"]},
            {"id": "depth1",
             "lines": ["const nx = {v}.next",
                       "if nx != null { print(nx.v) } else { print(0) }"],
             "want": ["2"]},
            {"id": "depth2",
             "lines": ["const n1 = {v}.next",
                       "if n1 != null {",
                       "  const n2 = n1.next",
                       "  if n2 != null { print(n2.v) } else { print(0) }",
                       "} else { print(0) }"],
             "want": ["0"]},
        ],
    },
    {
        # Recursive through a LIST field rather than a nullable one: the cycle runs through
        # the ref-list wrapper, which is a different interning path than the niche.
        "id": "rec_tree", "weight": 2, "no_inline": True,
        "decls": [("Tree", "{ t: i32, kids: Tree[] }")],
        "named": "Tree", "inline": "Tree", "expr": None,
        "mk": ["return { t: 7, kids: [] }"],
        "alt": "{ t: 0, kids: [] }",
        "features": ["struct", "recursive", "list"],
        "reads": [{"id": "depth0", "lines": ["print({v}.t)"], "want": ["7"]},
                  {"id": "kids", "lines": ["print({v}.kids.length)"], "want": ["0"]}],
    },
    {
        # MUTUAL recursion: neither name closes on its own, so the interner must reach a
        # fixpoint over a PAIR rather than over one declaration.
        "id": "rec_mutual", "weight": 2, "no_inline": True,
        "decls": [("Leaf", "{ w: i32, up: Branch | null }"),
                  ("Branch", "{ kids: Leaf | null }")],
        "named": "Branch", "inline": "Branch", "expr": None,
        "mk": ["return { kids: { w: 5, up: null } }"],
        "alt": "{ kids: null }",
        "features": ["struct", "recursive", "nullable"],
        "reads": [
            {"id": "depth1",
             "lines": ["const k = {v}.kids",
                       "if k != null { print(k.w) } else { print(0) }"],
             "want": ["5"]},
            {"id": "depth2",
             "lines": ["const k = {v}.kids",
                       "if k != null {",
                       "  const u = k.up",
                       "  if u != null { print(1) } else { print(0) }",
                       "} else { print(0) }"],
             "want": ["0"]},
        ],
    },
    {
        # THE CONTROL of the recursive set: the same field shape and the same reads with the
        # cycle CUT — `Tail` closes, so nothing here is recursive. A disagreement this record
        # shares is not a recursion defect, which no all-recursive table could tell.
        "id": "rec_flat", "weight": 2,
        "decls": [("Tail", "{ v: i32 }"), ("Head", "{ v: i32, next: Tail | null }")],
        "named": "Head", "inline": "{ v: i32, next: { v: i32 } | null }", "expr": None,
        "mk": ["return { v: 1, next: { v: 2 } }"],
        "alt": "{ v: 9, next: null }",
        "features": ["struct", "nullable"],
        "reads": [
            {"id": "depth0", "lines": ["print({v}.v)"], "want": ["1"]},
            {"id": "depth1",
             "lines": ["const nx = {v}.next",
                       "if nx != null { print(nx.v) } else { print(0) }"],
             "want": ["2"]},
        ],
    },
    {
        # THREE members, which is the smallest union an OR-PATTERN can be written over:
        # `"b" | "c"` collapses two arms, and a two-member union has no such pair. Its
        # `eq` twin needs `||`, so the group grades one arm-collapse against one
        # short-circuit — the same test, two control-flow shapes.
        "id": "litunion3", "weight": 2, "decls": [("Grade", '"a" | "b" | "c"')],
        "named": "Grade", "inline": '"a" | "b" | "c"', "expr": None,
        "mk": ['return "b"'], "alt": '"a"', "features": ["litunion"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["b"]},
                  {"id": "eq_narrow", "narrow": "eq",
                   "lines": ['if {v} == "b" || {v} == "c" { print(2) } else { print(9) }'],
                   "want": ["2"]},
                  {"id": "match_or", "narrow": "match",
                   "lines": ["match {v} {", '  "a" => print(9)',
                             '  "b" | "c" => print(2)', "}"],
                   "want": ["2"]}],
    },
    {
        # `+`: same-type binary, result is the RECEIVER type.
        "id": "op_add", "weight": 3, "decls": [("Vec", "new { x: i32 }")],
        "named": "Vec", "inline": "Vec", "no_inline": True,
        "fns": ['function "+"(self: Vec, other: Vec): Vec {',
                "  const r: Vec = { x: self.x + other.x }",
                "  return r",
                "}",
                "function plusVec(self: Vec, other: Vec): Vec {",
                "  const r: Vec = { x: self.x + other.x }",
                "  return r",
                "}",
                "const opW: Vec = { x: 4 }"] + _op_alt("altVec", "Vec"),
        "expr": None, "mk": OP_MK, "alt": "altVec()", "alt_infers": True,
        "features": ["struct", "operator", "op_add"],
        "reads": [{"id": "op", "op": "+",
                   "lines": ["print(({v} + opW).x)"], "want": ["7"]},
                  {"id": "call", "op": "+",
                   "lines": ["print(plusVec({v}, opW).x)"], "want": ["7"]}],
    },
    {
        # `*` with a MIXED operand — the right side is a plain `i32`, so the operator's
        # two parameters are not the same type and the dispatch key is only the left one.
        "id": "op_mul", "weight": 2, "decls": [("Sca", "new { x: i32 }")],
        "named": "Sca", "inline": "Sca", "no_inline": True,
        "fns": ['function "*"(self: Sca, k: i32): Sca {',
                "  const r: Sca = { x: self.x * k }",
                "  return r",
                "}",
                "function mulSca(self: Sca, k: i32): Sca {",
                "  const r: Sca = { x: self.x * k }",
                "  return r",
                "}"] + _op_alt("altSca", "Sca"),
        "expr": None, "mk": OP_MK, "alt": "altSca()", "alt_infers": True,
        "features": ["struct", "operator", "op_mul"],
        "reads": [{"id": "op", "op": "*",
                   "lines": ["print(({v} * 4).x)"], "want": ["12"]},
                  {"id": "call", "op": "*",
                   "lines": ["print(mulSca({v}, 4).x)"], "want": ["12"]}],
    },
    {
        # `<`, whose result is a BOOLEAN and not the receiver type, delivered into a
        # condition rather than a value position. An operator whose result re-enters the
        # receiver's own rep and one whose result leaves it are different lowerings.
        "id": "op_cmp", "weight": 2, "decls": [("Ord", "new { x: i32 }")],
        "named": "Ord", "inline": "Ord", "no_inline": True,
        "fns": ['function "<"(self: Ord, other: Ord): boolean {',
                "  return self.x < other.x",
                "}",
                "function ltOrd(self: Ord, other: Ord): boolean {",
                "  return self.x < other.x",
                "}",
                "const opO: Ord = { x: 4 }"] + _op_alt("altOrd", "Ord"),
        "expr": None, "mk": OP_MK, "alt": "altOrd()", "alt_infers": True,
        "features": ["struct", "operator", "op_cmp"],
        "reads": [{"id": "op", "op": "<",
                   "lines": ["if {v} < opO { print(1) } else { print(0) }"],
                   "want": ["1"]},
                  {"id": "call", "op": "<",
                   "lines": ["if ltOrd({v}, opO) { print(1) } else { print(0) }"],
                   "want": ["1"]}],
    },
    {
        # `[]` and `[]=` are TWO op groups on one record: the bracket READ and the bracket
        # WRITE are separate declarations and separate lowerings, so an edge proven at the
        # getter is not proven at the setter. The setter is also the only read here that
        # delivers the value into an ASSIGNMENT target rather than an expression.
        "id": "op_index", "weight": 3, "decls": [("Box", "new { x: i32 }")],
        "named": "Box", "inline": "Box", "no_inline": True,
        "fns": ['function "[]"(self: Box, i: i32): i32 { return self.x + i }',
                'function "[]="(self: Box, i: i32, k: i32) {',
                "  print(self.x + i + k)",
                "}",
                "function idxBox(self: Box, i: i32): i32 { return self.x + i }",
                "function setBox(self: Box, i: i32, k: i32) {",
                "  print(self.x + i + k)",
                "}"] + _op_alt("altBox", "Box"),
        "expr": None, "mk": OP_MK, "alt": "altBox()", "alt_infers": True,
        "features": ["struct", "operator", "op_index"],
        "reads": [{"id": "get_op", "op": "[]",
                   "lines": ["print({v}[4])"], "want": ["7"]},
                  {"id": "get_call", "op": "[]",
                   "lines": ["print(idxBox({v}, 4))"], "want": ["7"]},
                  {"id": "set_op", "op": "[]=",
                   "lines": ["{v}[4] = 5"], "want": ["12"]},
                  {"id": "set_call", "op": "[]=",
                   "lines": ["setBox({v}, 4, 5)"], "want": ["12"]}],
    },
    {
        # THE CONTROL. No operator is declared anywhere; the pair is a plain call against
        # its UFCS twin, which is the OTHER dispatch-by-receiver mechanism in the language.
        # A disagreement this record shares is about dispatch in general and is not an
        # operator defect — the job `rec_flat` does for recursion and `widen_same` for
        # widening, and the only thing that makes a zero on the other four readable.
        "id": "op_none", "weight": 2, "decls": [("Pln", "new { x: i32 }")],
        "named": "Pln", "inline": "Pln", "no_inline": True,
        "fns": ["function plusPln(self: Pln, k: i32): i32 { return self.x + k }"]
        + _op_alt("altPln", "Pln"),
        "expr": None, "mk": OP_MK, "alt": "altPln()", "alt_infers": True,
        "features": ["struct", "operator", "op_none"],
        "reads": [{"id": "call", "op": "none",
                   "lines": ["print(plusPln({v}, 4))"], "want": ["7"]},
                  {"id": "ufcs", "op": "none",
                   "lines": ["print({v}.plusPln(4))"], "want": ["7"]}],
    },
    {
        # OPERATOR x MIXED-WIDTH: an overloaded operator whose BODY crosses widths — the
        # `i32` field times an `f64` operand, so `self.x * k` widens `i32 -> f64` inside the
        # dispatch. `op`/`call` join `operator_vs_call`; the `opw` tag marks the width the
        # body mixes, and `op_samew` below is the same-shape control that makes a hit
        # falsifiable. The result LEAVES the receiver's rep (returns `f64`), like `op_cmp`.
        "id": "op_mixw_mul", "weight": 2, "decls": [("Mw", "new { x: i32 }")],
        "named": "Mw", "inline": "Mw", "no_inline": True,
        "fns": ['function "*"(self: Mw, k: f64): f64 { return self.x * k }',
                "function mulMw(self: Mw, k: f64): f64 { return self.x * k }"]
        + _op_alt("altMw", "Mw"),
        "expr": None, "mk": OP_MK, "alt": "altMw()", "alt_infers": True,
        "features": ["struct", "operator", "op_mixw", "opw_mix"],
        "reads": [{"id": "op", "op": "*", "opw": "mix",
                   "lines": ["print({v} * 2.5)"], "want": ["7.5"]},
                  {"id": "call", "op": "*", "opw": "mix",
                   "lines": ["print(mulMw({v}, 2.5))"], "want": ["7.5"]}],
    },
    {
        # The `i32 -> i64` edge of the same cross: `self.x + k` widens `i32` to `i64` in the
        # body, and a different operator (`+`) reaches a different lowering than `*`.
        "id": "op_mixw_add", "weight": 2, "decls": [("Aw", "new { x: i32 }")],
        "named": "Aw", "inline": "Aw", "no_inline": True,
        "fns": ['function "+"(self: Aw, k: i64): i64 { return self.x + k }',
                "function addAw(self: Aw, k: i64): i64 { return self.x + k }"]
        + _op_alt("altAw", "Aw"),
        "expr": None, "mk": OP_MK, "alt": "altAw()", "alt_infers": True,
        "features": ["struct", "operator", "op_mixw", "opw_mix"],
        "reads": [{"id": "op", "op": "+", "opw": "mix",
                   "lines": ["print({v} + 9000000000)"], "want": ["9000000003"]},
                  {"id": "call", "op": "+", "opw": "mix",
                   "lines": ["print(addAw({v}, 9000000000))"], "want": ["9000000003"]}],
    },
    {
        # THE SAME-WIDTH CONTROL: the identical operator shape and reads, but the field is
        # `f64` so `self.y * k` is `f64 * f64` — no widening in the body. A disagreement this
        # record shares is about operator dispatch, not about the mixed width, which is what
        # makes a hit on the two records above falsifiable (`widen_same`'s job for `+`).
        "id": "op_samew", "weight": 2, "decls": [("Sw", "new { y: f64 }")],
        "named": "Sw", "inline": "Sw", "no_inline": True,
        "fns": ['function "*"(self: Sw, k: f64): f64 { return self.y * k }',
                "function mulSw(self: Sw, k: f64): f64 { return self.y * k }",
                "function altSw(): Sw {", "  const r: Sw = { y: 9.0 }", "  return r",
                "}"],
        "expr": None, "mk": ["const r: {T} = { y: 3.0 }", "return r"],
        "alt": "altSw()", "alt_infers": True,
        "features": ["struct", "operator", "op_samew", "opw_same"],
        "reads": [{"id": "op", "op": "*", "opw": "same",
                   "lines": ["print({v} * 2.5)"], "want": ["7.5"]},
                  {"id": "call", "op": "*", "opw": "same",
                   "lines": ["print(mulSw({v}, 2.5))"], "want": ["7.5"]}],
    },
    {
        # INIT_vs_ASSIGN x UNION-NARROWING. `i32 | Rec` has a SCALAR arm (a boxed i32) and a
        # STRUCT arm (a boxed ref) — genuinely different reps. The value is the Rec; `alt` is
        # the scalar `5`, so the axis's `assign` face is `let v: Mix = 5` then `v = mkval()` —
        # a reassignment ACROSS the rep boundary. The narrow-and-read then surfaces a wrong
        # stored rep as a wrong VALUE, not just a wrong type. `mix_same` below reassigns the
        # SAME arm and is the control that separates a cross-rep defect from an assignment bug.
        "id": "mix_cross", "weight": 2,
        "decls": [("Rec", "{ n: i32 }"), ("Mix", "i32 | Rec")],
        "named": "Mix", "inline": "i32 | { n: i32 }", "expr": None,
        "mk": ["return { n: 3 }"], "alt": "5",
        "features": ["union", "struct", "scalar", "xrep_cross"],
        "reads": [
            {"id": "is_rec", "narrow": "is", "named_only": True, "xrep": "cross",
             "lines": ["if {v} is Rec { print({v}.n) } else { print(0) }"],
             "want": ["3"]},
            {"id": "match_rec", "narrow": "match", "named_only": True, "xrep": "cross",
             "lines": ["match {v} {", "  Rec{n} => print(n)", "  i32 => print(0)", "}"],
             "want": ["3"]},
        ],
    },
    {
        # The REVERSE crossing: the value is the SCALAR arm and `alt` is the struct, so the
        # `assign` face seeds a ref (`let v: Mix = { n: 9 }`) and reassigns a scalar. A wrong
        # stored rep here reads the ref's bits as an integer.
        "id": "mix_cross_rev", "weight": 2,
        "decls": [("Rec", "{ n: i32 }"), ("Mix", "i32 | Rec")],
        "named": "Mix", "inline": "i32 | { n: i32 }", "expr": None,
        "mk": ["return 5"], "alt": "{ n: 9 }",
        "features": ["union", "struct", "scalar", "xrep_cross"],
        "reads": [
            {"id": "is_i32", "narrow": "is", "xrep": "cross",
             "lines": ["if {v} is i32 { print({v}) } else { print(0) }"],
             "want": ["5"]},
            {"id": "match_i32", "narrow": "match", "named_only": True, "xrep": "cross",
             "lines": ["match {v} {", "  i32 => print({v})", "  Rec => print(0)", "}"],
             "want": ["5"]},
        ],
    },
    {
        # THE SAME-ARM CONTROL: identical `Mix` and reads, but `alt` is another Rec, so the
        # `assign` face reassigns STRUCT over STRUCT — no rep boundary crossed. A disagreement
        # this record shares is a plain assignment/narrowing bug, not a cross-rep one, which is
        # what makes a hit on the two records above readable.
        "id": "mix_same", "weight": 2,
        "decls": [("Rec", "{ n: i32 }"), ("Mix", "i32 | Rec")],
        "named": "Mix", "inline": "i32 | { n: i32 }", "expr": None,
        "mk": ["return { n: 3 }"], "alt": "{ n: 9 }",
        "features": ["union", "struct", "scalar", "xrep_same"],
        "reads": [
            {"id": "is_rec", "narrow": "is", "named_only": True, "xrep": "same",
             "lines": ["if {v} is Rec { print({v}.n) } else { print(0) }"],
             "want": ["3"]},
            {"id": "match_rec", "narrow": "match", "named_only": True, "xrep": "same",
             "lines": ["match {v} {", "  Rec{n} => print(n)", "  i32 => print(0)", "}"],
             "want": ["3"]},
        ],
    },
]

# ---------------------------------------------------------------------------
# POSITIONS — every syntactic place the value can be DELIVERED before it is read.
# `producer` is the expression the read consumes; the fused/bound axis decides
# whether it is bound to a name first. `wraps` means the read goes INSIDE the
# lines (an un-annotated parameter is a hole, which is the inferred face here).
# ---------------------------------------------------------------------------

POSITIONS = [
    {"id": "binding", "weight": 4, "wraps": False, "annotatable": True},
    {"id": "argument", "weight": 4, "wraps": True, "annotatable": True},
    {"id": "return", "weight": 4, "wraps": False, "annotatable": True},
    {"id": "assignment", "weight": 2, "wraps": False, "annotatable": True},
    {"id": "struct_field", "weight": 3, "wraps": False, "annotatable": True},
    {"id": "list_element", "weight": 3, "wraps": False, "annotatable": True},
    {"id": "map_value", "weight": 2, "wraps": False, "annotatable": True,
     "no_nullable": True},
    {"id": "global_init", "weight": 2, "wraps": True, "annotatable": True,
     "fixed_scope": "module"},
    {"id": "closure_capture", "weight": 3, "wraps": False, "annotatable": True},
]

SCOPES = [
    {"id": "module", "weight": 3},
    {"id": "function", "weight": 4},
    {"id": "fn_block", "weight": 2},
    {"id": "module_block", "weight": 2},
    # A one-iteration `while` is the shape the first external consumer of the language
    # wrote (`while i < n { len = xs[i] }`), so it is tutorial-weighted, not exotic.
    {"id": "fn_while", "weight": 3},
    {"id": "module_while", "weight": 2},
]

# ---------------------------------------------------------------------------
# SOURCES — where the delivered value COMES FROM. A literal, a call, a field read,
# an index read, a map read and a `??` are all ordinary, and they are not
# interchangeable at the emitter: the consumer's crash needed an INDEX read
# specifically (`len = xs[0] + 0` and the module-scope twin both run).
# `needs_alt` sources build a `T | null` on the way and coalesce back.
# ---------------------------------------------------------------------------

SOURCES = [
    {"id": "literal", "weight": 6},
    {"id": "call", "weight": 4},
    {"id": "index", "weight": 4},
    {"id": "field", "weight": 3},
    {"id": "map_read", "weight": 2, "needs_alt": True},
    {"id": "coalesce", "weight": 2, "needs_alt": True, "no_nullable": True},
]

# A plausible UNRELATED neighbour. Each of these vetoed something in a filed row:
# an `xs.push` anywhere (D1401), a `self`-function never called (D1430), an unused
# higher-order declaration interning the wrong arrow (D1100).
SCENERY = [
    {"id": "push", "lines": ["const bag = [1]", "bag.push(2)"]},
    {"id": "self_fn", "lines": ["function tally(self: i32[]): i32 { return self.length }"]},
    {"id": "hof", "lines": ["const apply = (f: (i32) => i32) => f(1)"]},
    {"id": "unused_type", "lines": ["type Note = { q: i32 }"]},
    {"id": "unused_import", "lines": ['import { toString } from "std:fmt"'],
     "is_import": True},
]

# ---------------------------------------------------------------------------
# THE SECOND HOLE of a two-parameter generic. `pass<T>` binds ONE hole, so a defect that
# needs two holes bound to DIFFERENT reps in one instance is out of frame however many
# values the table holds — #2854's lesson, where a grid that never bound its hole at all
# graded 46 of 46 green beside a check-clean invalid wasm. Each entry is the SECOND
# argument, and the delivered value is the first; the rep classes are the ones that
# disagree at the emitter (scalar / string / ref / list / nullable / f64).
# ---------------------------------------------------------------------------

SECOND_PIN = [
    {"id": "i32", "weight": 3, "expr": "1", "decls": []},
    {"id": "string", "weight": 3, "expr": '"s"', "decls": []},
    {"id": "f64", "weight": 2, "expr": "1.5", "decls": []},
    {"id": "boolean", "weight": 2, "expr": "true", "decls": []},
    {"id": "list", "weight": 2, "expr": "[1]", "decls": []},
    {"id": "struct", "weight": 2, "expr": "{ q: 1 }", "decls": []},
    # A NULLABLE second hole, which is the pairing the single-parameter pin can never make:
    # one instance whose two holes are a bare rep and a niche.
    {"id": "nullable", "weight": 2, "expr": "nulOf()",
     "decls": ["function nulOf(): i32 | null { return 2 }"]},
    # The CONTROL of the set: both holes bound to the SAME rep, spelled with the value's own
    # `alt`. A defect that needs the two to DIFFER agrees here, so an all-differing table
    # could not tell "two holes disagree" from "two holes at all". `expr` is filled at render.
    {"id": "same", "weight": 3, "expr": None, "decls": []},
]

# ---------------------------------------------------------------------------
# AXES — the unit of generation is a PAIR, and this is what the pair varies.
# Order is expected yield. `pins` forces another axis's face so the pair differs
# in exactly one thing; `needs` names what a plan must offer for the axis to apply.
# ---------------------------------------------------------------------------

AXES = [
    {"id": "named_vs_inline", "weight": 6, "faces": ["named", "inline"],
     "needs": "decls"},
    {"id": "annotated_vs_inferred", "weight": 5,
     "faces": ["annotated", "inferred"], "pins": {"fusion": "bound"}},
    {"id": "narrowing", "weight": 4, "faces": ["*"], "needs": "narrow_group"},
    {"id": "fusion", "weight": 3, "faces": ["fused", "bound"], "needs": "fusible"},
    # `generic2` is the TWO-parameter pin: `pass2<A, B>(a: A, b: B): A`, whose second hole
    # is bound to a rep from `SECOND_PIN` while the first carries the delivered value. A
    # one-parameter pin cannot express two holes disagreeing inside one instance.
    {"id": "pinning", "weight": 3,
     "faces": ["direct", "generic", "hole", "generic2"], "needs": "pinnable"},
    {"id": "scope", "weight": 3, "faces": ["module", "function", "fn_block",
                                           "module_block"], "needs": "free_scope"},
    {"id": "scenery", "weight": 3, "faces": ["bare", "neighbour"]},
    # THE OPERATOR SPELLING against the DIRECT CALL of a function with the same body. Its
    # faces are read ids, like `narrowing`'s, because what differs is the one line that
    # consumes the value. Grouping is by the OPERATOR, not by the expected output, so `[]`
    # and `[]=` stay two groups on one record even though several reads print the same
    # number — the mistake `_narrow_group`'s `want` key would have made here.
    {"id": "operator_vs_call", "weight": 4, "faces": ["*"], "needs": "op_group"},
    # INITIALISE vs DECLARE-THEN-ASSIGN. The `let` is seeded with a LITERAL, which pins
    # its rep, and the assignment is where a differently-repped source disagrees with
    # that pin — `let len = 0` then `len = xs[0]` crashes the compiler where
    # `const len = xs[0]` runs. Pinned to `bound`: an assignment IS a bound destination.
    {"id": "init_vs_assign", "weight": 5, "faces": ["init", "assign"],
     "needs": "assignable", "pins": {"fusion": "bound"}},
    # ONE FILE vs TWO MODULES. A `generator` axis is not a face flipped on a plan drawn
    # from the tables above — it has its own grammar (`modules.py`), because module scope
    # has two storage classes and every module's top level is merged into ONE start
    # function, which no single-file plan can express. D1593 / D1595 / D1596.
    {"id": "modules_split", "weight": 5, "faces": ["single", "split"],
     "generator": "modules"},
    # ONE std import vs TWO in the same module. Also a `generator` axis, and for the same
    # reason: what it varies is the IMPORT LIST, which no plan drawn above has. D1514 is
    # the shape — `std:fs` 18 ms alone, `std:array` 40 ms alone, both together 5,006 ms —
    # and a one-import benchmark cannot see it. `imports.py`.
    {"id": "imports_pair", "weight": 4, "faces": ["alone", "together"],
     "generator": "imports"},
]

AXIS_IDS = [a["id"] for a in AXES]
