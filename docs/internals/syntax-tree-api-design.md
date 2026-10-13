# Syntax-tree API — one surface for lint rules, fixes, codemods and agents

**Status:** design, not built. **Owner ruling (2026-09-27):** repo-local lint rules are
written in VL over a syntax-tree API. They are not text scanners, and they are not
config-enabled packs. This supersedes the recommendation of
[`lint-rule-scope.md` §Repo-local rules](lint-rule-scope.md#repo-local-rules), which
proposed option (c). In the owner's words: *"if it's worth doing it's worth doing
correctly, and b would enable autofix etc"*. And: *"I forsee a commonish API for programic
refactors, similar to jscodeshift. Though I'd also want it to be native for LLMs to use."*

One API serves four uses:

1. lint rules, including repo-local rules declared in a repo config;
2. autofixes attached to diagnostics;
3. programmatic refactors and codemods;
4. LLM agents that write a rule or codemod, run it, and read the result.

## Recommendations at a glance

| # | question | recommendation |
| --- | --- | --- |
| 1 | tree model | A **surface view** over the compiler's arena. Nodes are opaque `Syntax` handles with surface kinds and full `[start, end)` byte spans. They sit over a lossless **token layer** that holds every token and comment, with whitespace recoverable from the retained source. Edits are byte-exact outside their range. Handles are chosen over public recursive structs for stability and privacy; VL could express the structs (§1(d)). No green tree yet. |
| 2 | stability | The node set is **additive-only**. A kind or slot name is never removed or given a new meaning. One grammar file is the source of truth, and a snapshot ratchet fails any removal. The API ships under an explicitly unstable name until the migration proves it. Only then does it become `std:syntax` (§2). |
| 3 | query | **Layered.** The primary layer is patterns written in plain VL with `$X` / `$$$XS` metavariables; `$` cannot start a VL identifier, so these never collide. Logic uses a typed VL cursor API. There is **no** selector string language and **no** YAML. |
| 4 | edit model | Edits travel as **text edits over spans**. Structural helpers (`replace`, `remove`, `insertBefore`, `wrap`) lower to text edits. Replacement code is a **VL template** with metavariables. Fixes carry a safety level: `"safe"`, `"unsafe"` or `"suggestion"`. Fixes are applied to a fixed point, overlapping fixes are dropped, and a fix that does not converge is an error. |
| 5 | types | The MVP is syntax only. Phase 4 adds a small semantic query set: `typeOf` as a canonical spelling, `declOf`, `refsOf`, and a `kindOf` classification. Types are exposed as rendered strings, not as a type object model. |
| 6 | running and declaring rules | A root **`vl.json`** declares rules. The CLI is `vl check`, `vl fix` and `vl codemod`, and **both write commands print a diff unless given `-w`**, as `vl fmt` does. Rules run **linked against the compiler's own instance** (one parse, types free) inside a sandbox with no fs, env or process access and a fuel budget. |
| 7 | LLM surface | A one-line `vl codemod -p '…' -r '…'`. `--json` writes JSONL with stable ordering. `vl syntax dump --at L:C` shows the tree an agent is matching against. A pattern that matches nothing prints how it parsed. `--explain <code>` documents a rule. Rule tests are inline fixtures. |
| 8 | migration | First `compiler-no-interpolation` as a proof. Then the four comment rules, `std-comment-audience`, `arena-scan`, kind-ladder and sentinel-index. Each move is one PR, graded by its ratchet reading the same count before and after, and each deletes both the `lint.vl` walk and the Python twin. |
| 9 | phasing | P0 view and dump (1–2 wk). P1 patterns and codemod (2–3 wk). P2 rule modules and `vl.json` (2–3 wk). P3 LSP (≈2 wk). P4 semantic queries and multi-file (2–3 wk). An incremental green tree comes only if P3 measures a need for it. |

## Open questions for the owner, in priority order

Each has options and a recommendation. The sections below argue each one in full.

1. **What is the public tree?** (a) A surface view over today's arena, as opaque handles,
   with a lossless token layer beside it. (b) A real lossless green tree that the parser
   emits, as in Roslyn or rust-analyzer. (d) Public recursive node structs, ESTree-style,
   which VL can express. **Recommend (a).** It is weeks, not a parser rewrite, it makes the
   same byte-exact promise, and handles can gain slots where a struct's field set would be
   frozen. (d) is viable if reading comfort outweighs that cost, ideally as a derived
   `toStruct(n)` view. (b) stays open if the LSP later needs incremental reparse. See §1.
2. **Stability policy for a permanent node set.** (a) Ship `std:syntax` now, additive-only.
   (b) Ship it under an explicitly unstable name, promoted to `std:syntax` after the
   migration (P4). (c) Leave it versionless and unstable for good, as rust-analyzer does.
   **Recommend (b).** The std rule "no deprecation story" is exactly why the node set
   should be proven by five real rule families before it gets a permanent name. See §2.
3. **Query surface.** (a) Visitor callbacks only. (b) Add an ESLint-style selector
   language. (c) Add pattern-by-example in plain VL. **Recommend (c) plus the typed cursor
   API, and no (b).** Source-shaped patterns are what LLMs write most reliably, and a
   selector language would be a third syntax to learn. See §3.
4. **The config file.** Its name, its format, and whether it becomes the project file
   later. **Recommend `vl.json` at the repository root.** It is JSON because `std:json`
   exists and VL has no TOML reader. Its only section for now is `lint`, found by walking
   up from the file. See §6.1.
5. **Write behaviour of `vl fix` and `vl codemod`.** (a) Write by default, as `eslint --fix`
   and `ruff --fix` do. (b) Print a diff by default and write with `-w`, as `vl fmt` does.
   **Recommend (b).** It matches VL's own formatter and is the safe default for an agent.
   `vl check --fix` keeps its current meaning. See §6.2.
6. **Type information for rules.** (a) Syntax only, forever. (b) Rendered type strings and
   symbol links. (c) A public type object model. **Recommend (b), in P4.** Type spellings
   are already the checker's user-facing surface, and (c) would freeze the arena's type
   representation. See §5.
7. **Running untrusted repo rules in the editor.** (a) Run them only in a trusted
   workspace. (b) Run them anywhere, because they are sandboxed. **Recommend (b), and still
   honour VS Code's restricted mode.** A rule gets no fs, env or process imports and runs
   under a fuel cap, so "running the repo's code" means computing diagnostics and nothing
   else. See §6.3.
8. **Do the built-in LANGUAGE rules move onto the API?** **Recommend yes, but later (P3+).**
   Their quick-fixes move first: today they are computed in TypeScript by the LSP
   (`lsp/src/codeActions.ts`), keyed on the diagnostic code. Moved, they become fixes
   attached in the compiler, and the CLI and the editor share them. See §8.

---

## Survey

This is the lean version: what each system is for, what it does well, what it does badly,
and what VL should copy. A full evaluation of each system would be a separate piece of work.

| system | does well | does badly | VL copies |
| --- | --- | --- | --- |
| **ESLint** | `context.report({node, message, fix, suggest})`. A fixer object (`replaceText`, `insertTextBefore`, `remove`) that returns text edits. `meta.fixable` and separate `suggest` entries, so an unsafe edit is never applied by `--fix`. Fixes run in up to 10 passes, and overlapping fixes are skipped until the next pass. `RuleTester` takes `valid`/`invalid` fixtures. | ESTree drops tokens and comments, so rules reach for `sourceCode.getTokens*`. Selectors (esquery) are a string mini-language with no type checking. A text fix can produce code that does not parse, and nothing reparses it. | report + fixer returning text edits; fix vs suggestion; the multi-pass conflict loop; fixture-table rule tests |
| **jscodeshift / recast** | A collections API: `find(CallExpression, {callee: {name}})`, then `.replaceWith`. Recast reprints only the nodes you changed and keeps the original text everywhere else. | Builders are verbose (`j.callExpression(j.identifier(…), […])`). Reprinted nodes sometimes lose parentheses or formatting. It has no types. It has a dry run (`-d/--dry` with `--print`), but writing is the default. | print-preserving edits (VL gets them from span splicing); a chainable find/filter over matches |
| **ts-morph** | Full TypeScript type checker access, with navigation and manipulation on one object model. | Every manipulation reparses, so large codemods are slow and memory-hungry. The API surface is enormous. | types-on-demand, but not its size or its mutate-then-reparse model |
| **Babel plugins** | A visitor keyed by node type. `path` carries parent, scope and bindings (`path.scope.getBinding`), plus `replaceWith`, `insertBefore` and `remove`. `template` builds nodes from source text. | The tree is mutable and results depend on plugin order. The generator reprints the whole file, so formatting is lost. | `path`-style parent/scope navigation; building replacement code from **source templates**, not builders |
| **Roslyn** | Immutable red/green trees with full-fidelity trivia. Analyzers register per `SyntaxKind`, per symbol or per operation. `CodeFixProvider` is keyed on a diagnostic id, and FixAll applies it everywhere. A semantic model sits beside the tree. Severity is configured in `.editorconfig`. The API is additive-only across releases. | Heavy boilerplate, and the fix provider is a separate class from the analyzer. The API is very large. Analyzer cost in the IDE is a standing complaint. | an **additive-only public node set**; per-kind registration so the host dispatches cheaply; fix-all |
| **clippy / rustfix** | Four fix levels: `Applicability::MachineApplicable / MaybeIncorrect / HasPlaceholders / Unspecified`. `cargo fix` applies only MachineApplicable. Diagnostics carry their suggestions in JSON. | Clippy is written against rustc internals, which is why it lives in the rust repo; out-of-tree lints need dylint. | **applicability levels**; suggestions inside the JSON diagnostic; the lesson that rules over *internal* APIs must live in-tree |
| **Go `x/tools/go/analysis`** | A tiny contract: `Analyzer{Name, Doc, Run, Requires}` and a `Pass` carrying `TypesInfo`. `Diagnostic{Pos, End, Message, SuggestedFixes}`, where each fix is a list of text edits. Facts flow across packages. One analyzer runs unchanged in `go vet`, in `gopls` and standalone. `gofmt -r 'a[b:len(a)] -> a[b:]'` already does pattern-by-example rewriting. | `go/ast` keeps comments free-floating, so rewrites famously drop or misplace them; `dave/dst` exists only to fix that. | the **small contract** and the "one rule, every driver" principle; `gofmt -r`'s one-liner; the comment warning, since **VL's comments are free-floating today too** (§1) |
| **ast-grep** | Patterns are code (`$A`, `$$$ARGS`). YAML rules compose `inside`, `has`, `not`, `any` and `all`. `fix:` templates. `sg run -p … -r … --json` is a one-liner, `sg test` runs snapshot tests, and there is an LSP. It is agents' default structural tool today. | A pattern must parse on its own, which is ambiguous for fragments (`context` + `selector` is the workaround). It has no types. Relational YAML gets awkward fast. A pattern that silently matches nothing is the usual failure. | **pattern-by-example with `$`/`$$$` metavariables**; the one-line run; the JSON output; fix templates |
| **semgrep** | `$X` plus `...` ellipsis, `pattern-inside` and `pattern-not`, `metavariable-regex`, taint mode, `fix:` and stable JSON. | YAML rules get large. Startup is slow. A generic AST across languages means fixes are textual and sometimes wrong. Cross-file analysis is a paid tier. | ellipsis semantics for `$$$`; negative context (`not inside`) expressed as ordinary code, not YAML |
| **GritQL (Biome plugins)** | A declarative query language: patterns in backticks, `=>` rewrites, `where` clauses. Biome adopted it for plugins, which makes it the nearest precedent for "a repo's own rules in a language the tool owns". | A second language to learn, and one LLMs have seen little of. | rewrite-as-part-of-the-pattern; **but** VL's rules are written in VL itself, which LLMs already write |
| **tree-sitter queries** | S-expression patterns with `@captures` and `#eq?`/`#match?` predicates. Very fast, incremental, over a CST that keeps every token. | Hard to read, predicates are limited, there is no rewrite, and grammar node names break between grammar versions. | nothing on the surface; the lesson that **node names are API and break consumers when renamed** |
| **Comby** | Needs no parser: `:[hole]` over balanced delimiters works in any language. | It matches text, not syntax, so false matches happen. | nothing; VL has a parser |
| **Biome (Rust rules)** | The `Rule` trait: `Query`, `State`, `run`, `diagnostic` and `action`, over a rowan-style lossless CST. `FixKind::Safe/Unsafe`, and config can promote or demote a rule's fix safety. | Rules are Rust compiled into the tool, which is the shape the owner ruled out for VL's repo rules. | per-rule `fix` safety in the rule's metadata. VL **departs** from Biome on configuration: its config can demote safety but never promote it (§4.3) |
| **Ruff** | Fix safety of `safe`, `unsafe` or `display-only`, with `--unsafe-fixes` and per-rule overrides. It iterates fixes to a fixed point and **reports "failed to converge"** when it cannot. | Rules are Rust in-tree only. | the three safety names; **non-convergence is an error, not a loop** |
| **rust-analyzer** | Rowan green/red trees, and typed AST wrappers **generated from `ungrammar`**. SSR (`$a.foo($b) ==>> bar($a, $b)`) is a source-shaped pattern that resolves paths with type information. | The syntax crates are explicitly unstable, with no semver. | **one grammar file generating the typed accessors**; SSR's evidence that patterns in source can be type-aware |
| **LibCST (Python)** | A concrete tree that holds whitespace nodes, declarative matchers, and a codemod runner. | Whitespace-as-nodes makes hand-built trees tedious. | confirmation that a lossless tree plus matchers plus a codemod runner is the right package |

**The common shape.** Every durable system settles on the same five things. There is a
lossless or span-exact tree. A rule reports a diagnostic, and fixes attach to it as **text
edits**. Fixes carry a safety level. A driver applies fixes to a fixed point. And the same
rule runs unchanged in the CLI and in the editor. The systems differ mainly in how queries
are written, and there the pattern-by-example camp (ast-grep, semgrep, `gofmt -r`,
rust-analyzer SSR) is the one agents actually use.

---

## §1 Tree model

**What the compiler has today.** The compiler holds a flat `Node[]` arena of struct
variants, one per kind, discriminated with `is`. Children are `i32` indices, with `-1`
meaning none (`compiler/ast.vl`). Five properties of that arena decide the design:

* **Spans are partial.** A node has `pos`, the char offset of its first token, and
  `nodeToks[i]`, its *last* token. `nodeEndOf` joins the two into an end offset. There is
  no start-token table.
* **The arena is partly desugared.** `a += b` is a `BinExpr` carrying a `binCompound`
  marker. A backtick template is the `+` chain it desugared to, with `binTpl` set. `a?: T`
  sets `parOpt`. These markers already exist because `vl fmt` needs the surface back.
* **Types are strings.** An annotation is a synthetic name, and the formatter recovers type
  syntax verbatim from spans. A separate type-syntax stack (`tsMk` / `setAnnTs`) exists for
  annotations.
* **Comments are a side list.** `LexResult.comments` gives each comment's text, offset and
  a `trailing` flag. No comment is attached to a node. This is `go/ast`'s problem exactly.
* **Whitespace is not stored,** but the source text is. Every gap between two token spans
  is recoverable.

**Options.**

* **(a) A surface view over the arena, plus a token layer (recommended).** The public tree
  is a table the compiler builds after parsing:

  * `Syntax`: an opaque handle to a view row. The row holds a surface kind, a start token,
    an end token and named child slots.
  * `Token`: every lexed token with its `[start, end)` byte span, plus comments as trivia
    tokens.

  The view **re-sugars** nodes using the markers the formatter already reads, so a
  template is a `Template` node and not a `+` chain. Byte-exact round trip holds by
  construction: `text(node)` is `source[start(node), end(node))`, and whitespace is simply
  the gap between two tokens. A comment is **attached** to a node by one rule, which the
  view and the formatter share: a leading comment belongs to the next node on the lines
  below it, and a trailing comment to the node on its own line. `remove(node)` therefore
  takes the node's own comments with it and never orphans a neighbour's.

* **(b) A lossless green tree emitted by the parser.** This is the Roslyn, rowan and Biome
  model: every token and every piece of trivia is a leaf, trees are immutable and shared,
  and parents are computed on demand in red nodes. It is the strongest model, since it
  gives incremental reparse and a canonical tree. It is also a rewrite of a 4,134-line
  parser and of every consumer of the arena, and today's LSP re-checks the whole module on
  each change anyway. Nothing in the four uses needs it before P3 measures a need.

* **(c) AST plus a reprinter (recast).** Edits mutate nodes and a printer reprints the
  changed ones. VL already owns a structural printer (`format.vl`), but reprinting is
  exactly where recast loses parentheses and comments. Span splicing (a) gets the same
  result with less machinery: the printer formats *inserted* text only.

**How the view relates to the arena.** The view is a *projection*, rebuilt per parse at
O(nodes) cost. Rules never see arena indices, struct field names such as `binLeft`, or the
desugared forms. The arena may therefore change freely: new markers, a different
desugaring, the registry-by-key migration. The only obligation is that the view builder
still produces the same public kinds. The compiler owes the view one new table, a start
token per node, which the parser can stamp beside `nodeToks` at the same site.

**Why not expose the arena itself.** The arena is internal, and it is partly desugared. It
is keyed by `i32` indices that passes rewrite in place (`arenaReplaceNode`,
`arenaSetNode`). Its field names (`binLeft`, `callArgs`) follow a prefix convention that
exists only so that `is` can tell variants apart by shape. None of that should become
permanent API.

* **(d) Public recursive node structs.** VL can express these:
  `type Tree = { value: i32, children: Tree[] }` checks and runs, and `std:json` already
  ships the recursive alias `Json`. The public tree could therefore be a union of kind
  structs with direct children, such as `If = { cond: Expr, then: Block, els: Stmt | null, span: Span }`,
  that a rule reads as `n is If` and `n.cond`.

  *For:* it is the most natural VL to read. There are no accessor functions or generated
  wrappers, a tree dumps to JSON directly, and it is the ESTree and Babel shape that
  LLMs know best.

  *Against:*
  * **Every field of every kind is frozen.** A struct type is structural, so adding a field
    changes the type that any consumer constructing or annotating it has written. Handles
    can gain slots freely.
  * **The field-name prefix rule is inherited.** Variants must stay distinguishable by
    shape, so the public field names carry the same prefix rule forever.
  * **The whole tree is materialised as a copy on every parse.** Under the linked execution
    of §6.4, that copy is a GC object graph passed between two wasm modules rather than
    `i32` handles.
  * **There are no parent links without mutation.** An immutable struct cannot point up, so
    `parentOf` and `ancestors` still need a side table, and the handle machinery comes
    back anyway.
  * **It invites mutation as the edit model,** which recast shows is where formatting and
    comments are lost.

  A closed union of kinds has one cost that both (a) and (d) share: an exhaustive `match`
  in a consumer breaks when a kind is added. The grammar therefore documents the kind set
  as open, and a consumer `match` must carry a `_` arm.

**Recommendation: (a), with opaque handles over a closed kind set,** chosen for stability
and privacy rather than forced by the language. Generated typed wrappers (§2) recover most
of (d)'s readability, for example `ifCond(n)`. If the owner weighs reading comfort above
the frozen-field cost, (d) is viable. The cheapest way to get it is a **derived** struct
tree that a function builds on demand from the handle view (`toStruct(n)`), versioned with
the grammar, rather than making structs the primary representation.

```vl
import { Syntax, kindOf, slot, slots, text, tokensOf, commentsOf, parentOf } from "std:syntax"

// Every `if` whose condition is a literal `true`/`false`.
function constantIf(n: Syntax): boolean {
  if kindOf(n) != "If" { return false }
  const c = slot(n, "cond")          // Syntax | null
  c != null && kindOf(c) == "Bool"
}
```

`kindOf` returns a **literal union** (`SyntaxKind = "If" | "While" | "Call" | …`), not a
string. A misspelt kind is then a check error in the rule, not a rule that silently
matches nothing. Slot names are a literal union per kind too, and generated typed wrappers
(§2) make them methods: `ifCond(n)`.

**Recommendation: (a)** (see the (d) discussion above). Keep (b) as a P5 option, taken only if the LSP measures that
full-module rebuilds are too slow.

## §2 Stability and versioning

std is version-locked to the compiler and has no deprecation story (CLAUDE.md). A public
node set is therefore **permanent API**, and parser changes become API questions.

**How others do it.**

* **ESTree** is additive by ECMAScript edition: a new node type or field per feature, and
  essentially nothing is removed.
* **Roslyn** is additive-only: kinds and properties are added, old ones are kept and marked
  obsolete, and a node's shape is never broken.
* **rust-analyzer** generates its typed AST from `ungrammar` and declares the crate
  unstable, with no semver on `ra_ap_syntax`.
* **tree-sitter grammars** rename nodes freely, and queries break. This is the cautionary
  case.

**Policy (recommended).**

1. **One grammar file is the source of truth.** It lists every kind, each kind's named
   slots, and each slot's cardinality (one, optional, or list). The typed wrappers in the
   syntax module are *generated* from it, as rust-analyzer does with ungrammar.
2. **The grammar is additive-only.** A kind or slot is never removed or renamed, and never
   given a new meaning. New syntax gets a new kind or a new optional slot. Syntax the
   language retires keeps its kind, and the parser simply stops producing it (Roslyn's
   rule). Parse recovery produces one kind, `Error`, which holds the tokens it spans.
3. **A snapshot ratchet enforces it.** A committed `syntax-surface` snapshot is compared on
   every PR, the way `export-budget.py` guards std exports. An addition passes and
   rewrites the snapshot. A removal or rename reds.
4. **The name is unstable first, permanent second.** Until P4 the module ships as
   `std:syntax_unstable`, and the docs say it will be deleted. Five rule families migrate
   onto it (§8). The grammar then goes through the `std-api-reviewer` once as a whole,
   and is promoted to `std:syntax`, **after** which rule 2 binds. This is the one place
   the doc asks for an exception to "a std name is close to permanent". The exception is
   a name that is announced as temporary from its first day. That is honest, and a
   pre-release period is exactly when mistakes are cheap.

Because std is version-locked, the syntax module always matches the compiler serving it,
so there is no version negotiation at runtime. Additive-only is what lets a rule written
against compiler *N* compile unchanged on *N+1*.

## §3 Query language

Three layers, each written in VL.

**Layer 1: patterns in plain VL (primary).** A pattern is VL source with metavariables:

| form | matches |
| --- | --- |
| `$X` | exactly one node, bound as `X` |
| `$_` | one node, not bound |
| `$$$XS` | zero or more siblings (arguments, statements, elements, fields), bound as a list |
| `$X` used twice | the two positions must be structurally equal, ignoring trivia |

`$` is not an identifier character in VL (`isIdStart` in `compiler/lexer.vl`), so a
metavariable can never collide with a real name. ast-grep has to rely on `$` being a legal
JavaScript identifier; VL gets a cleaner lexical mode for free. A pattern is parsed with
the real parser, in a pattern mode that admits metavariables. Matching compares view
nodes modulo trivia.

A fragment is ambiguous: `f($X)` could be an expression or an expression statement. It is
tried as an expression first, then as a statement, then as a declaration. `kind:` pins the
choice. A pattern that parses in no context is an error that shows where parsing stopped.

**Layer 2: the typed cursor API, for logic.** This layer covers `parentOf`,
`ancestors`, `slot`, `children`, `tokensOf`, `commentsOf`, `text`, `span`, and `matches`
(which runs a layer-1 pattern at a node and returns its bindings). Whatever a pattern
cannot say is ordinary VL: "inside a function whose name ends in `Strict`", "no
comparison of `$I` earlier in the block".

**Layer 3: a rule is a VL module.** It exports one `rule` value: its code, its default
severity, a docs string with a small example, the kinds or patterns it subscribes to, and
a `check` function. The host dispatches by subscribed kind, like Roslyn's `RegisterSyntax
NodeAction` or a Babel visitor key, so a rule is never called for nodes it does not want.

```vl
import { Rule, Match, Report, fixReplace } from "std:syntax_unstable"

// `m.has(k)` followed by `m[k]` probes the map twice; a nullable read probes once.
export const rule: Rule = {
  code: "map-has-guard-reread",
  severity: "warning",
  docs: "Read once: `const v = m[k]; if v != null { … }`.",
  pattern: "if $M.has($K) { $$$BODY }",
  check: (m: Match, report: Report) => {
    if m.contains("BODY", "$M[$K]") {
      report(m.node, "`" + m.text("M") + "` is probed twice for `" + m.text("K") + "`")
    }
  },
}
```

**What VL does not take.**

* **A selector string language** (esquery, tree-sitter S-expressions). It is a third
  syntax, it is not type-checked, and an LLM writes it less reliably than source code.
* **YAML rule files** (ast-grep, semgrep). Composition (`inside`, `not`, `any`) is plain
  boolean VL in `check`, so there is no second rule language.
* **GritQL.** Biome's choice shows that plugin rules want a declarative query. VL's answer
  is that its patterns *are* its declarative query, and VL is the language the rule
  author, and the LLM, is already writing.

**Why this is LLM-native.** A pattern is a fragment of the code the model is looking at.
Agents today use ast-grep far more than semgrep for exactly this reason, and the failure
they hit is a pattern that parsed differently than intended and matched nothing. §7's
zero-match explanation targets that failure.

## §4 Edit model

**4.1 Edits are text edits over spans.** Every system that ships fixes at scale (ESLint,
rustfix, Go's `SuggestedFix`, Ruff, LSP `WorkspaceEdit`) puts `{start, end, newText}`
on the wire. VL does the same, which makes a fix trivially serialisable to JSON and to the
LSP. Rules do not usually write spans by hand. They call structural helpers that lower to
text edits using the token layer:

| helper | lowers to |
| --- | --- |
| `fixReplace(node, template)` | the node's span becomes the instantiated template |
| `fixRemove(node)` | the node's span plus the node's own separator (a list comma, or the rest of its line when the node is a statement) plus its attached comments |
| `fixInsertBefore(node, template)` / `fixInsertAfter` | inserted at the node's boundary, with a separator and indentation copied from the neighbouring token |
| `fixWrap(node, "($$$) as T")` | the node is replaced by a template containing `$$$`, the node itself |

**Replacement code is a template, not a builder.** `fixReplace(m.node, "$M[$K] ?? 0")`
instantiates the pattern's own bindings, and each binding's **original text**, comments
included, is copied through. Templates avoid jscodeshift's builder verbosity and Babel's
full reprint. The inserted text alone is formatted by `vl fmt`'s printer; the file is
never reformatted.

**4.2 Conflicts and convergence.** The driver collects every fix and sorts by span. It
applies the non-overlapping ones, drops the overlapping ones until the next pass,
**reparses**, and re-runs the rules. It repeats until no fix applies, capped at 10 passes
as ESLint does. **A file still producing fixes at the cap is an error** that names the
rule, which is Ruff's "failed to converge". A fix whose result does not parse is
discarded, and the rule is named. `vl check --fix` already re-verifies that a fixed file
still builds and reverts it if not (`compiler/cli.vl`, the declined-edit `info`); that
verify step becomes the driver's last pass.

**4.3 Safety levels.** Safety is a literal union, not a boolean (std-api-review §2):

| level | meaning | applied by |
| --- | --- | --- |
| `"safe"` | preserves behaviour; machine-applicable | `vl fix`, the editor's fix-all, and `vl check --fix` |
| `"unsafe"` | probably right, but may change behaviour (clippy's `MaybeIncorrect`) | `vl fix --unsafe`, and the editor's per-diagnostic action |
| `"suggestion"` | one of several alternatives, or has placeholders | the editor only, never in batch |

The repo config may **demote** a rule's fixes, never promote them. A rule author's claim
of safety is the ceiling. This is a deliberate departure from Biome and Ruff, whose configs
can do both: a promotion lets a config silently batch-apply an edit its own author called
behaviour-changing.

**4.4 Idempotence** is tested, not hoped for. The rule test harness (§7) runs every
`invalid` fixture's fix twice and requires that the second run produces no edits.

## §5 Type information

Some rules need types: `sentinel-index` wants "this index is an `i32` hole field",
`union-let-no-melt` wants a union type, and a rename codemod wants resolution.

**Options.** (a) Syntax only. (b) A small semantic query set over the checker's results.
(c) A public type object model, like Roslyn's `ITypeSymbol` or ts-morph's `Type`.

**Recommendation: (b), in P4.**

```vl
// Signatures only. The canonical spelling the checker prints, or null if untyped.
export function typeOf(n: Syntax): string | null
// "int" | "float" | "bool" | "string" | "list" | "map" | "struct" | "union" | "function" | …
export function typeKindOf(n: Syntax): TypeKind
// The declaring node, across modules.
export function declOf(ident: Syntax): Syntax | null
// Every reference to it in the files being linted.
export function refsOf(decl: Syntax): Syntax[]
```

**Cost.** If rules are linked against the compiler's instance (§6.4), the checker has
already run, so a query is a table read. The runtime cost is near zero; the design cost is
the API. A type **spelling** is already user-facing: every diagnostic prints one. So
exposing it freezes nothing new, provided the doc says spellings are canonical and may
become more precise. (c) would freeze the arena's type representation, which the
destringify and registry work is still reshaping. It fails the same test that ruled out
exposing arena nodes.

A rule declares `needs: "syntax" | "types"`. A syntax-only rule runs even when the module
does not type-check, which matters in the editor mid-edit. A types rule is skipped, with a
notice, on a module with check errors.

## §6 Where rules run and how they are declared

### 6.1 The repo config

The config is a `vl.json`, found by walking up from the file, which is the way the CLI and
the LSP both already walk up for a checkout root (`lsp/src/vlRoot.ts`). It is JSON because
`std:json` exists and a TOML reader would be new std. It also retires the marker-file
checkout detection and the relative-path residual of `lint-rule-scope.md`: a rule runs
where a `vl.json` says, and nowhere else.

```json
{
  "lint": {
    "rules": [
      { "module": "lint/comment-style.vl",  "paths": ["compiler/"] },
      { "module": "lint/kind-ladder.vl",    "paths": ["compiler/"] },
      { "module": "lint/arena-scan.vl",     "paths": ["compiler/", "std/"] }
    ],
    "severity": { "prefer-interpolation": "off" },
    "fixSafety": { "prefer-const": "suggestion" }
  }
}
```

A rule module may export several rules. `paths` are prefixes relative to the file holding
the `vl.json`.

### 6.2 The CLI

| command | behaviour |
| --- | --- |
| `vl check [paths]` | as today; now includes the repo's rules. `--json` gains a `fixes` array on each finding |
| `vl check --fix` | unchanged meaning: applies safe fixes in place |
| `vl fix [paths] [--unsafe] [-w] [--json]` | the fix driver of §4.2; **prints a unified diff unless `-w`**, like `vl fmt` |
| `vl codemod <mod.vl> [paths] [-w] [--json]` | runs a module exporting `codemod` (a rule with no diagnostic; every match yields edits) |
| `vl codemod -p '<pattern>' -r '<template>' [paths]` | the one-liner, like `sg run -p -r` or `gofmt -r` |
| `vl syntax dump <file> [--at L:C] [--json]` | the view tree: kinds, slot names, spans and attached comments |
| `vl rule test <mod.vl>` | runs the rule's inline fixtures (§7) |
| `vl rule explain <code>` | the rule's docs and example |

### 6.3 The LSP

A repo rule's findings merge into the diagnostics exactly as lint findings do today, and
its fixes become code actions. The `safe` fix is marked preferred, and a `source.fixAll.vl`
action applies all safe fixes. The TypeScript fix logic in `lsp/src/codeActions.ts`
retires as rules carry their own fixes (§8).

**Trust.** A rule module is compiled with **only** the syntax module's imports available:
no `std:fs`, `std:env` or `std:process`, and a module importing them is refused at load.
It then runs under a fuel cap. Running an untrusted repo's rules can therefore compute
diagnostics and nothing else. The extension still disables repo rules in VS Code's
restricted mode, because honouring the editor's own trust switch costs nothing.

**Performance.** The editor already re-checks per change on a debounce. Rule execution
adds a view build, which is O(nodes) and happens once per parse, plus the rules
themselves. Four measures keep that bounded:

* Dispatch is per subscribed kind, so a rule is not called on nodes it does not want.
* Compiled rule wasm is cached by the hash of its source and the compiler's version.
* Each rule has a per-file fuel budget. A rule over budget is skipped for that file, and
  the status bar says so.
* Budgets and the view build are measured in P3 against the self-compile tripwire and
  `plumb-shape-cost.py`. A cost that fails there is what would justify §1(b).

### 6.4 Execution: where rule code runs

* **(E1) Self-contained.** The syntax module bundles the parser, and a rule program parses
  the file itself. It is simple and fully isolated, but the parse is duplicated, and types
  would need the whole checker bundled into every rule.
* **(E2) Linked (recommended).** The compiler instance exports the view as wasm functions
  that take and return handles and strings. The syntax module declares them as host
  imports (`extern-design.md`), and the host links the rule module to the compiler instance
  that just checked the file. There is one parse and one check, and the types come free.

  Version-locking works *for* E2: the syntax module and the compiler that serves it are
  always the same release. The risk is passing strings between two WasmGC modules. Their
  isorecursive type definitions have to canonicalise to the same types, and P2's first
  task is a spike that proves this on wasmtime and on Node. If the spike fails, E1 is the
  fallback, and the API does not change.

## §7 The LLM-native surface

What an agent needs is a loop of write, run, read and adjust. Each step should take one
command and produce output it can parse.

* **One-line invocation:** `vl codemod -p 'if $C { return true } else { return false }' -r 'return $C' compiler/`.
* **Dry-run by default.** Both write commands print a diff and need `-w` to touch a file,
  so an agent inspects before it commits to an edit.
* **Deterministic JSONL** under `--json`, one finding per line, sorted by
  `(path, start, code)`. Its fields are `path`, `code`, `severity`, `message`, `start`,
  `end`, `line`, `col`, `bindings` (a map from metavariable name to text) and `fixes` (each
  with `safety`, `title` and `edits`). A codemod adds a `diff` field per file. The field
  set is additive-only, under the same policy as the grammar.
* **The zero-match explanation.** When a pattern matches nothing, the tool prints how the
  pattern parsed, as a `vl syntax dump` of the pattern, and the nearest partial match's
  location. This is the documented ast-grep failure mode, and the fix is to show the
  agent the tree it actually wrote.
* **`vl syntax dump --at L:C`** shows the kinds and slot names at a point in the file. An
  agent writes a correct pattern by reading the tree it is matching against.
* **Self-describing errors.** A misspelt kind is a check error in the rule, because kinds
  are a literal union. An unknown slot names the kind's slots. A pattern parse error shows
  the parse contexts it tried.
* **`vl rule explain <code>`** prints the rule's `docs` string, which is required to hold
  one bad and one good example.
* **Inline fixtures.** A rule module exports `tests`, a table of `valid` and `invalid`
  cases with the expected message and expected fixed output, in the shape of ESLint's
  `RuleTester`. `vl rule test` runs them, including the idempotence check (§4.4). An agent
  writing a rule writes its tests in the same file, in the same language.
* **The docs' examples are small and real.** Each example is a working rule of 10 to 20
  lines, and the examples are checked by the test suite, not left as prose.

**Compared with how agents use tools today.** Agents reach for `sg run -p … --json` and
`semgrep --config … --json` because the whole loop is one command and the output is
machine-readable. Semgrep costs more for an agent: YAML rules and slow startup. VL keeps
ast-grep's loop and adds three things neither offers. Patterns are type-checked VL. Rules
are the same language as the code. And rules can reach type information in P4.

## §8 Migration of the VL repo's own rules

Today each INTERNAL rule exists twice: a text-scanning walk in `compiler/lint.vl`, and a
Python twin (`comment-budget.py`, `ladder-census.py`, `sentinel-census.py`,
`scan-budget.py`) with a test that keeps them agreeing. `lint-rule-scope.md` observed that
ten of the eleven are *implemented* as line scanners. That describes how they were written
under a front end with coarse spans, not what they need. The comment rules need exactly
the token layer's comments and attachment. Kind-ladder is a chain of `if x is K` over a
closed union, which is structural. Arena-scan is a `for` bounded by a whole-program table
outside a pass, which is structural. So is sentinel-index: an `Index` whose index is a
call or a hole field, with no bound test before it. Each rewrite gets simpler on the tree.

**Order.** Each step is one PR.

1. **`compiler-no-interpolation`** is the proof of the pipeline: a pattern rule on
   `Template`, needing no fix. (Whether it belongs in the build instead is still the open
   question from `lint-rule-scope.md`.)
2. **The four comment rules** exercise the token and comment layer.
   `comment-budget.py --check` must read the same `0 / 0 / 0 / 0` before and after. The
   ratchet then grades `vl check --json` output, as `interp-budget.py` already does, and
   its own walk is deleted.
3. **`std-comment-audience`** is the same shape, gated at zero.
4. **`arena-scan-outside-pass`** is structural and single-file, and must read 87 before
   and after.
5. **The kind-ladder pair** needs **multi-file** access, because the closed sets come from
   `export type` declarations in other modules. So it waits for P4's project API, or reads
   the unions through `declOf`. It must read 363 / 8 before and after, and
   `ladder-census.py` retires.
6. **The sentinel-index pair** needs types and a function-local "compared before" scan. It
   must read 311 / 0 before and after, and `sentinel-census.py` retires.

Every step deletes its walk from `compiler/lint.vl`, which consumers' seeds stop carrying,
and `seed-size.vl --check` records the shrink.

**The LANGUAGE rules** stay built in; they are the language's advice, shipped with it.
They move in two parts. **Their fixes move first (P3):** the TypeScript in
`lsp/src/codeActions.ts` (`prefixWithUnderscoreFix`, remove-import, prefer-const, and the
unused-pure-expression removal) becomes fixes attached in the compiler, so `vl fix` and the
editor apply the same edits. **Their walks move later,** onto the same view API but still
compiled into the compiler. The compiler is then the API's largest client.

## §9 Phasing

Estimates are agent-lane calendar time, including review and gates.

| phase | delivers | estimate |
| --- | --- | --- |
| **P0: the view** | start-token table; the surface view builder with re-sugaring; the token and comment layer with the attachment rule; the grammar file and generated accessors; the `syntax-surface` snapshot ratchet; `vl syntax dump` | 1–2 wk |
| **P1: patterns and codemods** | pattern-mode parse (`$X`, `$$$XS`); the matcher; templates; the fix driver (§4.2: pass loop, conflicts, reparse, convergence error); `vl codemod -p/-r`; `vl fix`; `--json`; the zero-match explanation. **This is the first user value:** jscodeshift-style codemods over syntax, before any rule API | 2–3 wk |
| **P2: rule modules** | the E2 linking spike, then `std:syntax_unstable` through the std review; the `vl.json` reader in the Rust host; the rule dispatcher; `vl rule test` and `vl rule explain`; migration steps 1–3 | 2–3 wk |
| **P3: editor** | the LSP runs repo rules; code actions from attached fixes; `source.fixAll.vl`; restricted-mode handling; fuel budgets and measurement; the LANGUAGE rules' fixes move out of `codeActions.ts` | ≈2 wk |
| **P4: semantics and multi-file** | `typeOf`, `typeKindOf`, `declOf`, `refsOf`; a project API over the files in scope; migration steps 4–6 and retirement of the Python twins; promotion to `std:syntax` | 2–3 wk |
| **P5 (only if measured)** | an incremental green tree, if P3's budgets fail under whole-module rebuilds | — |

Total to a promoted `std:syntax` with the repo's rules migrated: roughly 9–13 weeks of
lane time. The lanes are serial through P2 and can then partly overlap.
