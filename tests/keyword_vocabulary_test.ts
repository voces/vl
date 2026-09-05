// THE KEYWORD VOCABULARY'S DRIFT GUARD — five independently maintained lists,
// one language.
//
//   1. `compiler/lexer.vl` `keywordKind`          THE AUTHORITY (hard keywords)
//   2. `compiler/parser.vl` contextual guards     THE AUTHORITY (soft keywords)
//   3. `compiler/driver.vl` `lexClassOf`          the LSP's semantic-token class
//   4. `lsp/src/typeFeatures.ts`                  VL_HARD_KEYWORDS / VL_SOFT_KEYWORDS
//                                                 → completion, signature help, and
//                                                   rename's new-name validation
//   5. `lsp/syntaxes/vital.tmLanguage.json`       the VS Code TextMate grammar
//   6. `playground/src/main.ts`                   the playground's Monarch table
//
// WHAT DRIFT COST, measured before this test existed
// (`docs/internals/ladder-audit-2026-09.md` §3.2 A3 — filed "Guard: NONE"):
//
//   • `match` was missing from THREE of the lists (`driver.vl` contained the
//     string "MATCH" zero times). `VL_HARD_KEYWORDS` feeds `invalidNewNameReason`,
//     so THE LSP ACCEPTED RENAMING A BINDING TO `match` and wrote a file that does
//     not parse — measured: `const foo = 1` renamed to `match` yields five parse
//     errors. `match` was also never offered in completion and never painted.
//   • The Monarch table carried `fn` and `elseif`, neither of which is VL syntax
//     at ALL (`parser.vl`: "there is no fused `elseif` keyword").
//
// THE SOURCE OF TRUTH IS THE PARSER, AND IT WAS WORTH RUNNING RATHER THAN READING.
// The audit filed the TextMate grammar as "over-claims `new`". It does not: `new`
// is a real CONTEXTUAL keyword (`type Id = new i32`, the nominal newtype), just
// not a reserved one — `const new = 1` runs and prints `1`, measured, so `new`
// belongs in the SOFT set and not the hard one. The same probe found `flat`
// (`flat type R = { … }`), which no list had at all. Both are derived below rather
// than typed in, which is the point: the parser gained them and every list was
// silently wrong until something read the parser.
//
// WHAT THIS TEST DOES: it DERIVES both sets from the compiler's own source and
// requires every other list to match. Adding a keyword to `lexer.vl` therefore
// reddens this test until all four consumers follow, and inventing one that the
// parser does not know reddens it too. Both extractions carry a floor that fails
// LOUDLY if the pattern they read goes stale, so an extraction that quietly finds
// nothing can never pass as "no drift".
//
// PURE — no seed, no binary. It runs in the `ci` job.

import { ROOT } from "./support/tree.ts";

import { VL_HARD_KEYWORDS, VL_SOFT_KEYWORDS } from "../lsp/src/typeFeatures.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const read = (rel: string): string => Deno.readTextFileSync(`${ROOT}/${rel}`);

const LEXER = "compiler/lexer.vl";
const PARSER = "compiler/parser.vl";
const DRIVER = "compiler/driver.vl";
const TYPE_FEATURES = "lsp/src/typeFeatures.ts";
const TMLANGUAGE = "lsp/syntaxes/vital.tmLanguage.json";
const MONARCH = "playground/src/main.ts";

const set = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
const eq = (a: readonly string[], b: readonly string[]): boolean =>
  set(a).join(",") === set(b).join(",");
const diff = (a: readonly string[], b: readonly string[]): string[] =>
  set(a).filter((x) => !b.includes(x));

/** The text of `header`'s declaration, up to the next top-level `function`. */
const declText = (src: string, header: string, rel: string): string => {
  const at = src.indexOf(header);
  assert(at >= 0, `${rel}: could not find \`${header}\` — this guard's extraction is stale`);
  const rest = src.slice(at + header.length);
  const next = rest.search(/\n(export function |function )/);
  return rest.slice(0, next < 0 ? rest.length : next);
};

// ── the authority: hard keywords, derived from `keywordKind` ──────────────────
//
// `keywordKind` maps a spelling to a `TokKind`; its non-`IDENT` returns ARE the
// hard vocabulary, and every one of them is its spelling uppercased. That
// convention is what makes the derivation possible, so it is ENFORCED rather than
// assumed: each derived spelling must be evidenced in the same function body —
// a `text == "spelling"` compare for the long ones, and the second-character test
// the first-character bucket uses for the two-letter ones (`if`, `is`).

const lexerBody = declText(read(LEXER), "function keywordKind(", LEXER);

const HARD: readonly string[] = (() => {
  const kinds = set(
    [...lexerBody.matchAll(/return "([A-Z_]+)"/g)].map((m) => m[1]),
  ).filter((k) => k !== "IDENT");
  assert(
    kinds.length >= 10,
    `${LEXER}: derived only ${kinds.length} keyword kinds from \`keywordKind\` — ` +
      `this guard's extraction is stale, not the lexer (it reads \`return "KIND"\`)`,
  );
  const spellings = kinds.map((k) => k.toLowerCase());
  assert(
    new Set(spellings).size === kinds.length,
    `${LEXER}: two keyword kinds lowercase to the same spelling — the ` +
      `"TokKind is the spelling uppercased" convention this derivation rests on ` +
      `has broken; give the guard an explicit kind→spelling map`,
  );
  for (const s of spellings) {
    const evidenced = s.length > 2
      ? lexerBody.includes(`text == "${s}"`)
      : lexerBody.includes(`text[1] == '${s[1]}'`);
    assert(
      evidenced,
      `${LEXER}: \`keywordKind\` returns a kind whose spelling would be ` +
        `"${s}", but the body never tests for that spelling. Either the kind is ` +
        `not its spelling uppercased (this derivation then needs an explicit ` +
        `map) or the arm is dead.`,
    );
  }
  return spellings;
})();

// ── the authority: soft keywords, derived from the parser's text guards ───────
//
// A soft keyword is lexed as an IDENT and given meaning by the parser comparing
// its TEXT at one position. Two documented adjustments, and they are the only
// hand-entered facts in this file:
//
//   EXCLUDED `then` — REMOVED from the language on 2026-08-31 (DECISIONS.md). Its
//     surviving parser site is a targeted refusal ("`then` was removed — wrap the
//     branch in braces"), not syntax, so it is not a keyword any surface should
//     paint, offer, or refuse as a name.
//   ADDED `from` — the import path clause. The parser never text-tests it (it
//     "rides as an IDENT" while `parseImport` scans to the path STRING), so no
//     guard can find it; it is syntax all the same.
//
// `_` (the match wildcard) is excluded by the identifier pattern below and stays
// excluded on purpose: it is a PATTERN, not a name a surface would paint.
const SOFT_EXCLUDED: readonly string[] = ["then"];
const SOFT_ADDED: readonly string[] = ["from"];

const SOFT: readonly string[] = (() => {
  const parser = read(PARSER);
  const found = set(
    [...parser.matchAll(/\.text == "([a-z][a-z0-9_]*)"/g)].map((m) => m[1]),
  );
  assert(
    found.length >= 4,
    `${PARSER}: derived only ${found.length} contextual keywords — this guard's ` +
      `extraction is stale, not the parser (it reads \`.text == "word"\`)`,
  );
  for (const x of SOFT_EXCLUDED) {
    assert(
      found.includes(x),
      `${PARSER}: "${x}" is on this guard's EXCLUDED list but the parser no longer ` +
        `mentions it — drop it from SOFT_EXCLUDED rather than leaving a dead exception`,
    );
  }
  const derived = found.filter((x) => !SOFT_EXCLUDED.includes(x) && !HARD.includes(x));
  return set([...derived, ...SOFT_ADDED]);
})();

const ALL = set([...HARD, ...SOFT]);

// ── 1. the LSP's two lists ────────────────────────────────────────────────────

Deno.test("keywords: VL_HARD_KEYWORDS is exactly the lexer's reserved set", () => {
  assert(
    eq(VL_HARD_KEYWORDS, HARD),
    `${TYPE_FEATURES} VL_HARD_KEYWORDS disagrees with ${LEXER} \`keywordKind\`:\n` +
      `  missing from the list: [${diff(HARD, VL_HARD_KEYWORDS)}]\n` +
      `  claimed but not reserved: [${diff(VL_HARD_KEYWORDS, HARD)}]\n` +
      `This list feeds \`invalidNewNameReason\` (rename), \`keywordCompletions\` and ` +
      `signature help. A missing entry means the LSP ACCEPTS renaming a binding to ` +
      `a keyword and writes a file that does not parse — which is exactly what ` +
      `\`match\` did. A claimed-but-not-reserved entry refuses a legal name.`,
  );
});

Deno.test("keywords: VL_SOFT_KEYWORDS is exactly the parser's contextual set", () => {
  assert(
    eq(VL_SOFT_KEYWORDS, SOFT),
    `${TYPE_FEATURES} VL_SOFT_KEYWORDS disagrees with ${PARSER}'s text guards:\n` +
      `  missing from the list: [${diff(SOFT, VL_SOFT_KEYWORDS)}]\n` +
      `  claimed but not contextual: [${diff(VL_SOFT_KEYWORDS, SOFT)}]\n` +
      `(derived = the parser's \`.text == "word"\` guards, minus [${SOFT_EXCLUDED}], ` +
      `plus [${SOFT_ADDED}] — see this file's header for why each adjustment exists)`,
  );
});

Deno.test("keywords: the two sets are disjoint, and hard means reserved", () => {
  const both = HARD.filter((k) => SOFT.includes(k));
  assert(
    both.length === 0,
    `[${both}] are derived as BOTH hard and soft. A word the lexer reserves can ` +
      `never reach a parser text guard as an IDENT, so one of the two derivations ` +
      `is reading the wrong thing.`,
  );
});

// ── 2. the semantic-token class (`driver.vl` `lexClassOf`) ────────────────────

Deno.test("keywords: lexClassOf classifies every hard keyword the lexer mints", () => {
  const body = declText(read(DRIVER), "function lexClassOf(", DRIVER);
  const classified = set([...body.matchAll(/kind == "([A-Z_]+)"/g)].map((m) => m[1]));
  assert(
    classified.length >= 10,
    `${DRIVER}: derived only ${classified.length} kinds from \`lexClassOf\` — this ` +
      `guard's extraction is stale, not the driver (it reads \`kind == "KIND"\`)`,
  );
  const missing = HARD.map((s) => s.toUpperCase()).filter((k) => !classified.includes(k));
  assert(
    missing.length === 0,
    `${DRIVER} \`lexClassOf\` gives no class to [${missing}] — the editor paints ` +
      `those keywords as NOTHING AT ALL (measured: \`match\` produced no token). ` +
      `Add each to the keyword group (class 0) or, for a literal, the boolean/null ` +
      `group (class 3).`,
  );
});

// ── 3. the two grammars ───────────────────────────────────────────────────────
//
// Both must match EXACTLY the union of the two sets. Soft keywords are painted
// because each is real syntax where it appears; a same-spelled identifier is
// re-coloured by the semantic-token provider, which keys off the lexer's actual
// token kind, so the over-paint costs nothing in an editor with the server
// attached. What a partial rule would cost is this guard: "some softs, chosen by
// nobody in particular" is the state the audit found, and it is unfalsifiable.

/** Words a TextMate `match` regex pins: `\b(a|b|c)\b`, `\bx\b`, `\bas\?`. */
const tmWords = (pattern: string): string[] => {
  const out: string[] = [];
  for (const m of pattern.matchAll(/\\b\(?([a-z|]+)\)?\\?[b?]/g)) {
    for (const w of m[1].split("|")) if (w) out.push(w);
  }
  return out;
};

Deno.test("keywords: the TextMate grammar paints exactly the hard + soft vocabulary", () => {
  const grammar = JSON.parse(read(TMLANGUAGE));
  const words: string[] = [];
  for (const group of ["keywords", "constants"]) {
    const entry = grammar.repository?.[group];
    assert(
      entry !== undefined,
      `${TMLANGUAGE}: no \`repository.${group}\` — this guard's extraction is stale`,
    );
    for (const p of entry.patterns ?? []) if (p.match) words.push(...tmWords(p.match));
  }
  assert(
    words.length >= 10,
    `${TMLANGUAGE}: extracted only ${words.length} words — the extraction is stale, ` +
      `not the grammar (it reads \`\\b(a|b|c)\\b\` matches)`,
  );
  assert(
    eq(words, ALL),
    `${TMLANGUAGE} disagrees with the compiler's vocabulary:\n` +
      `  not painted: [${diff(ALL, words)}]\n` +
      `  painted but not a keyword: [${diff(words, ALL)}]\n` +
      `(hard from ${LEXER}, soft from ${PARSER}; both derived, see this file's header)`,
  );
});

Deno.test("keywords: the playground's Monarch table is exactly the hard + soft vocabulary", () => {
  const src = read(MONARCH);
  const m = src.match(/keywords:\s*\[([^\]]*)\]/);
  assert(
    m !== null,
    `${MONARCH}: could not find the Monarch \`keywords: [ … ]\` array — this ` +
      `guard's extraction is stale`,
  );
  const words = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert(
    words.length >= 10,
    `${MONARCH}: extracted only ${words.length} keywords — the extraction is stale`,
  );
  assert(
    eq(words, ALL),
    `${MONARCH}'s Monarch \`keywords\` disagrees with the compiler's vocabulary:\n` +
      `  missing: [${diff(ALL, words)}]\n` +
      `  invented (not VL syntax at any position): [${diff(words, ALL)}]\n` +
      `This table used to carry \`fn\` and \`elseif\`, and to lack \`match\`.`,
  );
});

// ── 4. the consequence the drift had, pinned as a fact ────────────────────────

Deno.test("keywords: rename refuses every hard and soft keyword as a new name", async () => {
  const { invalidNewNameReason } = await import("../lsp/src/rename.ts");
  for (const kw of HARD) {
    const why = invalidNewNameReason(kw);
    assert(
      why !== undefined && why.includes("reserved"),
      `rename would accept "${kw}" as a new binding name, and the result does not ` +
        `parse. Got: ${JSON.stringify(why)}`,
    );
  }
  for (const kw of SOFT) {
    const why = invalidNewNameReason(kw);
    assert(
      why !== undefined && why.includes("contextual"),
      `rename would accept the contextual keyword "${kw}" as a new binding name. ` +
        `Got: ${JSON.stringify(why)}`,
    );
  }
  // The floor: a plain identifier still passes, so a validator that refused
  // EVERYTHING could not satisfy the loop above.
  assert(
    invalidNewNameReason("matcher") === undefined &&
      invalidNewNameReason("newValue") === undefined,
    "a plain identifier must still be an acceptable new name",
  );
});
