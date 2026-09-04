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

VALUES = [
    {
        "id": "i32", "weight": 4, "decls": [], "named": "i32", "inline": "i32",
        "expr": "7", "alt": "0", "alt_infers": True, "features": ["scalar"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["7"]}],
    },
    {
        "id": "f64", "weight": 2, "decls": [], "named": "f64", "inline": "f64",
        "expr": "2.5", "alt": "0.0", "alt_infers": True, "features": ["scalar", "f64"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["2.5"]},
                  {"id": "arith", "lines": ["print({v} * 2.0)"], "want": ["5"]}],
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
        "id": "i64", "weight": 1, "decls": [], "named": "i64", "inline": "i64",
        "expr": "9000000000", "alt": "0", "features": ["scalar", "i64"],
        "reads": [{"id": "bare", "lines": ["print({v})"], "want": ["9000000000"]}],
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
        "reads": [
            {"id": "shared", "lines": ["print({v}.kind)"], "want": ["2"]},
            {"id": "is_narrow", "narrow": "is", "named_only": True,
             "lines": ["if {v} is Box { print({v}.w) } else { print(0) }"],
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
                   "want": ["1"]}],
    },
    {
        "id": "nullable_ref", "weight": 4,
        "decls": [REC_DECL, ("MaybeRec", "Rec | null")],
        "named": "MaybeRec", "inline": REC_INLINE + " | null",
        "expr": None, "mk": ["return " + REC_EXPR], "alt": "null",
        "features": ["nullable", "struct"],
        "reads": [
            {"id": "nullcheck", "narrow": "ne_null",
             "lines": ["if {v} != null { print({v}.n) } else { print(0) }"],
             "want": ["3"]},
            {"id": "isnull", "narrow": "is_null",
             "lines": ["if {v} is null { print(0) } else { print({v}.n) }"],
             "want": ["3"]},
            {"id": "coalesce",
             "lines": ["print(({v} ?? " + REC_ALT + ").n)"], "want": ["3"]},
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
                  {"id": "as_q", "lines": ["print({v} as? i32 ?? -1)"], "want": ["3"]},
                  {"id": "bare", "lines": ["print({v})"], "want": ["3"]}],
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
    {"id": "pinning", "weight": 3, "faces": ["direct", "generic", "hole"],
     "needs": "pinnable"},
    {"id": "scope", "weight": 3, "faces": ["module", "function", "fn_block",
                                           "module_block"], "needs": "free_scope"},
    {"id": "scenery", "weight": 3, "faces": ["bare", "neighbour"]},
    # INITIALISE vs DECLARE-THEN-ASSIGN. The `let` is seeded with a LITERAL, which pins
    # its rep, and the assignment is where a differently-repped source disagrees with
    # that pin — `let len = 0` then `len = xs[0]` crashes the compiler where
    # `const len = xs[0]` runs. Pinned to `bound`: an assignment IS a bound destination.
    {"id": "init_vs_assign", "weight": 5, "faces": ["init", "assign"],
     "needs": "assignable", "pins": {"fusion": "bound"}},
]

AXIS_IDS = [a["id"] for a in AXES]
