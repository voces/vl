# Doc comments

`///` is a doc comment. `//` is an ordinary comment. The difference is who reads it: a `///`
block written directly above a declaration is that declaration's documentation, and the editor
shows it on hover wherever the name is used. A `//` comment is for whoever is reading the
source, and no tool renders it anywhere else.

```vl
/// Greets a person by name.
/// The second line is part of the same block.
function greet(who: string): string { return "hi " + who }
```

Hovering `greet` — at its declaration, or at any call — shows both lines above the signature.

## What attaches, and what does not

A block attaches to the declaration on the **next line**. Nothing else does:

```vl
/// Attached: the very next line is the declaration.
const answer = 42

/// NOT attached — a blank line ends the block.

const other = 7

// NOT documentation: two slashes, not three.
function ordinary(n: i32): i32 { return n }

const x = 1 /// NOT documentation: a `///` after code comments that line and documents
            /// nothing.
```

The rule is the one the formatter already uses to decide a comment belongs to what follows it,
so `vl fmt` never moves a doc block away from the declaration it documents.

Every declaration takes one: `function`, `type`, `const` and `let`, at module scope or inside a
block, exported or not. `export` on the declaration changes nothing — put the block above the
whole thing.

## What goes in one

The text after `/// ` is **markdown**, rendered by the editor. One space after the slashes is
consumed, so `/// Greets` reads as `Greets` and further indentation is yours to use — a nested
list or an indented code block survives intact.

Write what a caller needs and cannot read off the signature: what it does, what its arguments
mean, what it returns, and the edge case that will surprise them. The type is already shown
beside your prose; repeating it spends the reader's attention twice.

```vl
/// Splits `s` on every run of whitespace.
///
/// Leading and trailing whitespace produce no empty pieces, so `"  a b "` gives
/// `["a", "b"]` and `""` gives `[]`.
function words(s: string): string[] { … }
```
