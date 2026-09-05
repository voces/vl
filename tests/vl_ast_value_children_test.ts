// THE ONE AST CHILD WALKER — `nodeValueChildren` is `nodeChildren` minus the
// type-annotation and declaration slots, and this file is the proof that it still is.
//
// WHY IT EXISTS. `compiler/json_walk.vl` used to carry `jwKids`, a second 22-arm ladder
// over the same closed `Node` set, maintained by hand. Two arm tables over one enum means
// a new `Node` variant is two edits and only one of them is anchored to a walker whose
// default is documented — the survey's row 8
// (`docs/internals/code-quality-survey-2026-09/front-end-and-checker.md` §2.2). `jwKids` is
// gone; `nodeValueChildren` (`compiler/ast.vl`) names only the five kinds that carry a
// non-value slot and falls through to `nodeChildren` for the other 32.
//
// WHAT IT ASSERTS, over all `Node` kinds rather than over the kinds a corpus happens to
// contain: the derivation — `nodeValueChildren`'s arm, else `nodeChildren`'s — equals
// `VALUE_CHILDREN` below, slot for slot and in order. `VALUE_CHILDREN` is the deleted
// `jwKids`, transcribed, so a green run is the migration proof; it stays the one place
// that states, per kind, which children are values.
//
// A NEW `Node` VARIANT reddens this file by name: declare its value children in
// `VALUE_CHILDREN`, and give it a `nodeValueChildren` arm only when some child of it is a
// type annotation or a declaration. That is the second edit the survey wanted priced, now
// paid in a test that says what the decision is rather than in a silent second ladder.
//
// The behavioural half of the same claim was run once, at the migration: an instrumented
// compiler comparing `nodeValueChildren` against a verbatim copy of `jwKids` at every arena
// index reported 0 mismatches over 681,587 nodes (2,902 of `tests/cases/**`; the other 70
// are parse-stage rejects with no arena) and over 421,691 nodes of the compiler's own 30
// modules, with a deliberately broken `LetDecl` arm as the control that made it fire.
//
// PURE — reads two `.vl` files as text. No seed, no binary, so it runs in the `ci` job.

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const read = (rel: string): string => Deno.readTextFileSync(`${ROOT}/${rel}`);

// ── the declared axis ──────────────────────────────────────────────────────────────────
//
// The value children of each `Node` kind, in source order. A `*` prefix is a whole
// arena list (`*n.blkStmts` = every element of `blkStmts`); anything else is one slot.
// A kind absent from this table has no value children. Transcribed from `jwKids`.
const VALUE_CHILDREN: Record<string, string[]> = {
  Unary: ["n.unArg"],
  BinExpr: ["n.binLeft", "n.binRight"],
  Call: ["n.callFn", "*n.callArgs"],
  Member: ["n.memObj"],
  OptMember: ["n.omObj"],
  Paren: ["n.parInner"],
  Index: ["n.idxArr", "n.idxIndex"],
  ArrayLit: ["*n.arrElems"],
  ObjLit: ["*n.objFields"],
  FieldInit: ["n.fiValue"],
  IsExpr: ["n.isObj"],
  AsExpr: ["n.asObj"],
  LetDecl: ["n.letInit"],
  IfStmt: ["n.ifCond", "n.ifThen", "n.ifElse"],
  WhileStmt: ["n.whileCond", "n.whileBody"],
  ForRange: ["n.frFrom", "n.frTo", "n.frStep", "n.frBody"],
  ForIn: ["n.fiIter", "n.fiBody"],
  MatchExpr: ["n.matchScrut", "*n.matchBodies"],
  RetStmt: ["n.retArg"],
  Block: ["*n.blkStmts"],
  Program: ["*n.progStmts"],
  FuncDecl: ["n.fnBody"],
};

// ── reading the two ladders out of `compiler/ast.vl` ───────────────────────────────────

// The closed `Node` set, from its own `export type` — so a new variant arrives here
// without an edit and is graded against `VALUE_CHILDREN` on its first run.
const nodeKinds = (src: string): string[] => {
  const at = src.indexOf("export type Node = ");
  assert(at >= 0, "compiler/ast.vl: no `export type Node = ` declaration");
  const end = src.indexOf("\n\n", at);
  assert(end > at, "compiler/ast.vl: `export type Node` has no blank line after it");
  return src.slice(at + "export type Node = ".length, end)
    .split("|").map((s) => s.trim()).filter((s) => s.length > 0);
};

// One function's body, by brace matching from its declaration line.
const bodyOf = (src: string, name: string): string => {
  const at = src.indexOf(`export function ${name}(`);
  assert(at >= 0, `compiler/ast.vl: no \`export function ${name}(\``);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`compiler/ast.vl: \`${name}\` never closes`);
};

// The child slots one arm body names, in order. The four spellings the two ladders use:
// an array literal, a whole arena list returned, a push of one slot, and a push of a
// list's element inside its `while`.
const slotsIn = (body: string): string[] => {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    // A one-line arm hands its closing brace in with the statement.
    const line = raw.trim().replace(/\}+$/, "").trim();
    const lit = line.match(/^const out: i32\[\] = \[(.*)\]$/);
    if (lit) {
      for (const s of lit[1].split(",").map((x) => x.trim())) {
        if (s.length > 0) out.push(s);
      }
      continue;
    }
    const whole = line.match(/^return (n\.\w+)$/);
    if (whole) {
      out.push(`*${whole[1]}`);
      continue;
    }
    const elem = line.match(/^out\.push\((n\.\w+)\[i\]\)$/);
    if (elem) {
      out.push(`*${elem[1]}`);
      continue;
    }
    const one = line.match(/^out\.push\((n\.\w+)\)$/);
    if (one) out.push(one[1]);
  }
  return out;
};

// Every `if n is <Kind> { … }` arm of a ladder body, plus the tail after the last one.
const ladder = (body: string): { arms: Map<string, string[]>; tail: string } => {
  const lines = body.split("\n");
  const arms = new Map<string, string[]>();
  let i = 0;
  let lastArmEnd = 0;
  while (i < lines.length) {
    const head = lines[i].match(/^\s*if n is (\w+) \{(.*)$/);
    if (!head) {
      i++;
      continue;
    }
    let depth = 1;
    const collected: string[] = [head[2]];
    let j = i;
    while (depth > 0 && j < lines.length) {
      if (j > i) collected.push(lines[j]);
      for (const ch of j === i ? head[2] : lines[j]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      j++;
    }
    arms.set(head[1], slotsIn(collected.join("\n")));
    lastArmEnd = j;
    i = j;
  }
  const tail = lines.slice(lastArmEnd).map((l) => l.trim())
    .filter((l) => l.length > 0).join(" ");
  return { arms, tail };
};

const AST = read("compiler/ast.vl");
const KINDS = nodeKinds(AST);
const CHILDREN = ladder(bodyOf(AST, "nodeChildren"));
const VALUES = ladder(bodyOf(AST, "nodeValueChildren"));

const show = (xs: string[]): string => `[${xs.join(", ")}]`;

Deno.test("ast: `nodeValueChildren` delegates its default to `nodeChildren`", () => {
  assert(
    VALUES.tail === "nodeChildren(ix)",
    `nodeValueChildren's default must be \`nodeChildren(ix)\` — the delegation is what ` +
      `makes 32 kinds inherit one arm table; got \`${VALUES.tail}\``,
  );
  assert(
    CHILDREN.arms.size > VALUES.arms.size,
    `nodeValueChildren names ${VALUES.arms.size} kinds and nodeChildren ` +
      `${CHILDREN.arms.size} — the exception ladder must stay smaller than the one it excepts`,
  );
});

Deno.test("ast: `nodeValueChildren` may only DROP slots `nodeChildren` names", () => {
  for (const [kind, slots] of VALUES.arms) {
    assert(
      CHILDREN.arms.has(kind),
      `nodeValueChildren has an arm for \`${kind}\` that nodeChildren does not — ` +
        `it excepts kinds, it does not add them`,
    );
    const parent = CHILDREN.arms.get(kind)!;
    let at = 0;
    for (const s of slots) {
      const found = parent.indexOf(s, at);
      assert(
        found >= 0,
        `nodeValueChildren's \`${kind}\` arm names ${s}, which is not a later slot of ` +
          `nodeChildren's ${show(parent)} — want a subsequence, got ${show(slots)}`,
      );
      at = found + 1;
    }
  }
});

Deno.test("ast: the derived value children equal the declared table, for every Node kind", () => {
  assert(
    KINDS.length >= 37,
    `only ${KINDS.length} Node kinds parsed — the reader is wrong`,
  );
  const wrong: string[] = [];
  for (const kind of KINDS) {
    const derived = VALUES.arms.get(kind) ?? CHILDREN.arms.get(kind) ?? [];
    const want = VALUE_CHILDREN[kind] ?? [];
    if (show(derived) !== show(want)) {
      wrong.push(`  ${kind}: derived ${show(derived)}  declared ${show(want)}`);
    }
  }
  assert(
    wrong.length === 0,
    `${wrong.length} of ${KINDS.length} Node kinds derive value children the table does ` +
      `not declare. Either the walker changed or a new variant needs a row in ` +
      `VALUE_CHILDREN (and a nodeValueChildren arm if any of its children is a type ` +
      `annotation or a declaration):\n${wrong.join("\n")}`,
  );
});

Deno.test("ast: every declared kind is a real Node kind", () => {
  const unknown = Object.keys(VALUE_CHILDREN).filter((k) => !KINDS.includes(k));
  assert(
    unknown.length === 0,
    `VALUE_CHILDREN names ${unknown.join(", ")}, which the \`Node\` union does not`,
  );
});

Deno.test("json_walk: both recursive walks take their children from `nodeValueChildren`", () => {
  const jw = read("compiler/json_walk.vl");
  assert(
    !jw.includes("jwKids"),
    "compiler/json_walk.vl mentions `jwKids` — the second child walker is back",
  );
  const uses = jw.split("const ks = nodeValueChildren(ix)").length - 1;
  assert(
    uses === 2,
    `json_walk.vl reads nodeValueChildren at ${uses} sites; jwSubst and jwArmDisturbs are 2`,
  );
});
