<!-- inventory-split: source docs/internals/silent-class-inventory-2.md -->

# Silent-class inventory #2 — one file per row

The coverage gaps of inventory #1, measured. Its rows split into their OWN directory rather
than joining `docs/internals/inventory/`, because **the two inventories number
independently and D1..D14 exist in both**: one flat directory would silently overwrite
fourteen rows with fourteen others. `tests/vl_inventory_rows_test.ts` has checked row-id
uniqueness per document, not across both, for the same reason.

Filing rules are the ones in [`../inventory/README.md`](../inventory/README.md); the
template is [`../inventory/TEMPLATE.md`](../inventory/TEMPLATE.md). This file's rows differ
in one respect the grader already handles: they write the program directly under the status
line with no `Repro:` lead-in.

    python3 scripts/check-filed-witnesses.py --strict docs/internals/inventory-2
    python3 scripts/inventory/ls.py docs/internals/inventory-2 --status open
