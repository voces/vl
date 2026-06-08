// Last-session persistence for the playground ("remember what we did last").
//
// There is exactly ONE remembered session in `localStorage` — no named projects,
// no list. On every (debounced) edit `main.ts` records the LIVE buffer contents
// plus which built-in sample they were based on; on load it restores them so a
// refresh or a return to the page brings back the in-progress edits.
//
// Switching to a different built-in sample loads it FRESH from `samples.ts`
// (discarding the current edits) and that fresh sample becomes the new last
// session — see `main.ts`'s `loadSample`.
//
// Pure / DOM-free apart from `localStorage` (present in the page and in Deno), so
// the round-trip is unit-checkable from `verify.ts`.

/** A single file's name + its current (possibly-modified) source. */
export type SessionFile = { name: string; source: string };

/**
 * The "what we did last" record: the LIVE buffer contents at the time of the
 * last edit, plus the index of the built-in sample they were based on (so the
 * selector can re-highlight it). `files` is the source of truth for what to show.
 */
export type LastSession = {
  sampleIndex: number;
  files: SessionFile[];
};

const LAST_KEY = "vl-last-session";

const cloneFiles = (files: SessionFile[]): SessionFile[] =>
  files.map((f) => ({ name: f.name, source: f.source }));

/** Record the currently-open sample + its live (possibly-modified) buffers. */
export const saveLastSession = (session: LastSession): void => {
  try {
    localStorage.setItem(
      LAST_KEY,
      JSON.stringify({
        sampleIndex: session.sampleIndex,
        files: cloneFiles(session.files),
      }),
    );
  } catch {
    // Quota exceeded / storage disabled — persistence is best-effort.
  }
};

/** The last session, or null if none / malformed. */
export const loadLastSession = (): LastSession | null => {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (raw === null) return null;
    const s = JSON.parse(raw) as LastSession;
    if (
      !s || typeof s.sampleIndex !== "number" ||
      !Array.isArray(s.files) || s.files.length === 0
    ) {
      return null;
    }
    for (const f of s.files) {
      if (typeof f?.name !== "string" || typeof f?.source !== "string") {
        return null;
      }
    }
    return { sampleIndex: s.sampleIndex, files: cloneFiles(s.files) };
  } catch {
    return null;
  }
};

export const clearLastSession = (): void => {
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    // best-effort
  }
};
