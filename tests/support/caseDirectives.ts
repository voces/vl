// The corpus's `// @directive` contract, as data: what each `tests/cases/**` file
// declares, which cases the oracle deliberately skips, and the one derived fact
// another test needs — whether the oracle itself already proves a case's module
// valid. Side-effect free (no seed load), so a test can import it without paying
// the oracle's instantiate. `casesWasmOracle.ts` is the adjudicator and documents
// what each directive asserts; this file only parses them.

// Cases where the wasm oracle's result legitimately differs from what the
// TS-worded directives pin. REJECT-verdict parity holds for every entry except
// where the reason says otherwise (the parked soundness xfails). Each entry
// skips its case; the trailing tripwire test fails on a stale entry. Burning
// this list down is the message/span-parity work that also gates the deno
// CHECK-tier deletion (ROADMAP F-tiers).
export const EXPECTED_DIVERGENCES: Record<string, string> = {
  // The `unreachable: exhaustive is-chain` @info is TYPE-AWARE (A-exhaust): TS
  // derives it from the checker. The native lint pass is parse-only and the wasm
  // driver's diagnostic stream is error-only, so this info is TS-only until the
  // checker exposes warning/info diagnostics to the oracle (a later slice).
  "lint/exhaustive-is-chain-dead-else.vl":
    "type-aware `unreachable: exhaustive is-chain` @info — not produced by the parse-only native lint / error-only diag stream",
  "soundness/literal-is-union-param-dispatch.vl":
    "type-aware `unreachable: exhaustive is-chain` @info — TS-only (see lint/exhaustive-is-chain-dead-else)",
  "types/struct-union-same-shape.vl":
    "type-aware `unreachable: exhaustive is-chain` @info — TS-only (see lint/exhaustive-is-chain-dead-else)",
  "lint/generic-intersection-no-warn.vl":
    "wasm CHECKER gap: a generic intersection `T & S` reports `unknown type 'T&S'` where the TS checker accepts it (not a lint divergence)",
  "soundness/README.vl":
    "a prose line parses as @run; the wasm emitter rejects a statement-less program (TS emits an empty module)",
};

export type Directives = {
  mode: "check" | "run";
  errors: string[];
  errorsAt: { line: number; col: number; text: string }[];
  /** `@emit-error TEXT`: the FULL compile must fail at the EMIT stage (rc 3)
   * with a diagnostic containing TEXT — pins the emitter's fail-loudly rejects
   * (a shape the checker accepts but the emitter has no rep for), which the
   * checker-tier `@error` cannot express. */
  emitErrors: string[];
  warnings: string[];
  infos: string[];
  hints: string[];
  logs: string[];
  trap: string[];
  noInstantiate: string[];
  unknown: string[];
  skip: string | null;
};

export const parseDirectives = (src: string): Directives => {
  const d: Directives = {
    mode: "check",
    errors: [],
    errorsAt: [],
    emitErrors: [],
    warnings: [],
    infos: [],
    hints: [],
    logs: [],
    trap: [],
    noInstantiate: [],
    unknown: [],
    skip: null,
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("//")) continue;
    const m = line.slice(2).trim().match(/^@(\S+)\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    switch (key) {
      case "run":
        d.mode = "run";
        break;
      case "check":
        d.mode = "check";
        break;
      case "error":
        d.errors.push(rest);
        break;
      case "emit-error":
        d.emitErrors.push(rest);
        break;
      case "warning":
        d.warnings.push(rest);
        break;
      case "info":
        d.infos.push(rest);
        break;
      case "hint":
        d.hints.push(rest);
        break;
      case "error-at": {
        const at = rest.match(/^(\d+):(\d+)\s+(\S.*)$/);
        if (!at) {
          throw new Error(
            `malformed @error-at: expected \`<line>:<col> <text>\` (both 0-based), ` +
              `got \`@error-at ${rest}\``,
          );
        }
        d.errorsAt.push({
          line: Number(at[1]),
          col: Number(at[2]),
          text: at[3],
        });
        break;
      }
      case "log":
        d.logs.push(rest);
        break;
      case "trap":
        d.mode = "run";
        d.trap.push(rest);
        break;
      case "no-instantiate":
        d.mode = "run";
        d.noInstantiate.push(rest);
        break;
      case "skip":
        d.skip = rest || "no reason given";
        break;
      default:
        d.unknown.push(key);
        break;
    }
  }
  return d;
};

/**
 * True when the oracle ITSELF settles whether `name`'s emitted module is valid: it
 * either instantiates that module under V8 (a run-mode case, which a module the
 * engine refuses turns red) or asserts the compile fails before any module exists
 * (a check- or emit-stage reject). Skipped, divergent and `@no-instantiate` cases
 * are false, as is a check-mode case that type-checks clean — the oracle never
 * emits it. `vl check --codegen`'s corpus sweep reads only the false ones.
 */
export const oracleSettlesValidity = (name: string, d: Directives): boolean => {
  if (d.skip !== null || name in EXPECTED_DIVERGENCES || d.unknown.length > 0) {
    return false;
  }
  if (d.mode === "run") return d.noInstantiate.length === 0;
  return d.errors.length + d.errorsAt.length + d.emitErrors.length > 0;
};
