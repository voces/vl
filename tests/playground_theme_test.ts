// Unit tests for the tri-state theme toggle pure logic (playground/src/main.ts).
//
// `main.ts` imports Monaco (not runnable in Deno), so the pure function
// `nextThemeState` is reproduced verbatim here for testing. It must stay in
// sync with the copy in main.ts; the logic is small and stable.
//
// Run with:
//   deno test -A --no-check tests/playground_theme_test.ts

type Mode = "light" | "dark";

/**
 * Pure decision function for a toggle click (mirrors main.ts export).
 * Given the current effective mode and the current OS mode, returns what the
 * new state should be: an explicit override to store, or null to go AUTO.
 */
const nextThemeState = (
  current: Mode,
  system: Mode,
): { override: Mode | null; mode: Mode } => {
  const next: Mode = current === "dark" ? "light" : "dark";
  if (next === system) {
    return { override: null, mode: system };
  }
  return { override: next, mode: next };
};

// Hand-rolled asserts (repo convention — no std import map).
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

// ---------------------------------------------------------------------------
// Scenario 1: OS=dark, user is in AUTO (showing dark).
//   Click once → next=light, which ≠ system(dark) → pin "light" override.
Deno.test("auto(OS=dark): click once pins light", () => {
  assertEquals(
    nextThemeState("dark", "dark"),
    { override: "light", mode: "light" },
    "auto OS=dark, click once",
  );
});

// Scenario 2: OS=dark, user has "light" pinned (showing light).
//   Click again → next=dark, which === system(dark) → clear override (back to AUTO).
Deno.test("pinned-light(OS=dark): click reverts to auto(dark)", () => {
  assertEquals(
    nextThemeState("light", "dark"),
    { override: null, mode: "dark" },
    "pinned light, OS=dark, click → auto",
  );
});

// Scenario 3: OS=light, user is in AUTO (showing light).
//   Click → next=dark, which ≠ system(light) → pin "dark".
Deno.test("auto(OS=light): click once pins dark", () => {
  assertEquals(
    nextThemeState("light", "light"),
    { override: "dark", mode: "dark" },
    "auto OS=light, click once",
  );
});

// Scenario 4: OS=light, user has "dark" pinned (showing dark).
//   Click → next=light, which === system(light) → clear override (back to AUTO).
Deno.test("pinned-dark(OS=light): click reverts to auto(light)", () => {
  assertEquals(
    nextThemeState("dark", "light"),
    { override: null, mode: "light" },
    "pinned dark, OS=light, click → auto",
  );
});
