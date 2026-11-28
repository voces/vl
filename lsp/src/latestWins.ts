// The per-document check scheduler: an edit arms a debounce, and a burst of edits runs one check
// when typing pauses. A running check is never pre-empted (the checker is synchronous wasm); an
// edit that lands during it runs one more check after it, over the newest text. Whether a finished
// check may publish is the caller's question (`isCurrent`), asked of the document's version.

/** How long a document must go without an edit before its check starts. */
export const CHECK_DEBOUNCE_MS = 75;

/** The timer pair the scheduler arms; a test passes a manual clock. */
export type Timers = {
  set: (f: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
};

const realTimers: Timers = {
  set: (f, ms) => setTimeout(f, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type LatestWins = {
  /** Arms (or re-arms) the debounce for `key`. */
  schedule: (key: string) => void;
  /** Drops a pending debounce for `key`, as when its document closes. */
  cancel: (key: string) => void;
};

/** A scheduler that runs `run(key)` once per pause in `key`'s edits, never two at once. */
export const latestWins = (
  run: (key: string) => Promise<void>,
  delayMs: number = CHECK_DEBOUNCE_MS,
  timers: Timers = realTimers,
): LatestWins => {
  const armed = new Map<string, unknown>();
  const running = new Map<string, Promise<void>>();
  const owed = new Set<string>();

  const start = (key: string): Promise<void> => {
    const busy = running.get(key);
    if (busy !== undefined) {
      owed.add(key);
      return busy;
    }
    const p = (async () => {
      try {
        await run(key);
      } finally {
        running.delete(key);
      }
      if (owed.delete(key)) await start(key);
    })();
    running.set(key, p);
    return p;
  };

  return {
    schedule: (key) => {
      const h = armed.get(key);
      if (h !== undefined) timers.clear(h);
      armed.set(
        key,
        timers.set(() => {
          armed.delete(key);
          void start(key);
        }, delayMs),
      );
    },
    cancel: (key) => {
      const h = armed.get(key);
      if (h !== undefined) timers.clear(h);
      armed.delete(key);
      owed.delete(key);
    },
  };
};

/** Whether a check of version `checked` may publish while the document is at `now`. */
export const isCurrent = (checked: number, now: number | undefined): boolean =>
  now !== undefined && checked === now;
