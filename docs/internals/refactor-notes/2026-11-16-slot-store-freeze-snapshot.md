# Slot store: answering mono's slot questions as of the freeze is refuted (lane SLOT, 2026-11-16)

Row [D16768](../inventory/D16768.md); witness [D16898](../inventory/D16898.md). With the classes
frozen when mono begins (#8838), the question was whether a class reader asked during mono reads only
what stood at the freeze. It does not, and making it do so loses a program that runs.

## The probe

On branch `slot-bprime` (probe commits, not for merge). At the freeze it fingerprints each node's
fields the class readers use (a call's callee and arguments, a member's object and property, an
index, a paren, a let's, parameter's or function's annotation, a name's text and declaration) and
each node's type. Every `nodeAt` and `nodeTyIxOf` in the 82 `epl*` readers mono reaches fails the
emit when the node or its type changed since the freeze, and a bound settled lazily during mono is
compared with the one settled at the freeze.

Controls, both on `closures/captured-cell-shared-writer-hole-lambda-alias`: every snapshot entry
corrupted fires (`eplSlotPlace read node 13`); every un-annotated `let` annotated right after the
freeze, as mono's pins do, fires (`L-1=48 -> L48=48`).

## Firings, against the guard compiler

| population | firings |
| --- | --- |
| `tests/cases`, 8,137 programs | 200 |
| distilled cells, 260,818 | 133 |
| capability probes, 263 | 9 (259 run → 250) |
| matrix templates, 154 | 38 templates, 393 cells |

The `tests/cases` firings by kind, the first per program (`emitFail` keeps one):

| kind | reader | programs |
| --- | --- | --- |
| node type mono set | `eplSlotDeliveredTys` | 73 |
| node type mono set | `eplValueSig` | 47 |
| bound settled lazily differs from the bound at the freeze | `eplBoundOf` | 42 |
| annotation mono pinned | `eplFrameKeysOf` 20, `eplSlotPlace` 1 | 21 |
| name mono renamed to an instance | `eplFrameKeysOf` 10, `eplCallbackLamTy` 2 | 12 |
| name `captureBoxRewrite` replaced | `eplSlotDeliveredTys` | 3 |
| member rewritten | `eplSlotPlaceOwn` | 1 |
| call node replaced | `eplHolderCallMember` | 1 |

A firing is a read of changed state, not an answer that changed.

## B′-1: types, annotations and bounds as of the freeze

Branch `slot-bprime-1`: at the freeze every class's bound is settled and each node's type and
annotation recorded; the readers mono asks read those. Against the guard compiler: `tests/cases`
byte-identical, distilled per-cell identical, capability probes identical, and the matrix loses 2
cells, `map_set/unann` and `map_value/unann` of `record-field-map-of-hole-fn-uncalled`: runs → emit
refuses `cannot take the generic function inc0 as a value`. Filed as D16898; its ablation keeps
one part of the snapshot at a time: node types alone refuse, bounds alone refuse, annotations alone
run. The program builds only because a reader sees the type mono pinned on `const v` mid-flight.

B′-1 is parked. A pin table filled before mono (the 2026-11-16 pin-table design) reads the same
facts and is refuted the same way. Deciding pins before mono is slot-store design stage 3.

## B′-2: renames, rewrites and replaced calls

B2COUNT
