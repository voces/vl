// Tests in ONE file whose bodies run a few at a time. `deno test --parallel` gives one worker
// per FILE and runs that file's tests back to back, so a file of independent `vl build -O3`
// rows took the sum of its rows while the shard's other cores sat idle once its smaller files
// were done. `concurrentTests()` returns a drop-in for `Deno.test`: every test keeps its name,
// its body and its assertions; a body starts ahead of its turn, at most `width` in flight and at
// most `2 * width` past the test being run, so a `--filter` run starts only a handful of bodies
// it will not report. A body's failure is reported by its own test and by no other.
//
// The sanitizers are off because a test's window now holds the async ops of the bodies
// running beside it, which they would report as that test's leak.

type Body = () => Promise<void>;
type Def = { name: string; ignore?: boolean; fn: Body };

export const concurrentTests = (
  width = Math.max(2, Math.min(4, navigator.hardwareConcurrency ?? 2)),
) => {
  const bodies: Body[] = [];
  const promises: (Promise<void> | undefined)[] = [];
  let inFlight = 0;
  let next = 0;
  let frontier = -1;

  const start = (j: number): Promise<void> => {
    const had = promises[j];
    if (had) return had;
    const p = bodies[j]();
    promises[j] = p;
    inFlight++;
    // A handled branch, so a body that fails before its test awaits it is not an unhandled
    // rejection; the test awaiting `p` still receives the error.
    p.catch(() => {}).finally(() => {
      inFlight--;
      pump();
    });
    return p;
  };

  const pump = () => {
    while (inFlight < width && next < bodies.length && next <= frontier) {
      start(next++);
    }
  };

  // The awaited body starts at once even when the window is full, so the test being run never
  // queues behind one it does not need; the bodies it skipped (a filter) never start.
  const run = (i: number): Promise<void> => {
    frontier = Math.max(frontier, i + 2 * width);
    next = Math.max(next, i + 1);
    const p = start(i);
    pump();
    return p;
  };

  return (def: Def) => {
    const i = bodies.length;
    bodies.push(def.fn);
    Deno.test({
      name: def.name,
      ignore: def.ignore,
      sanitizeOps: false,
      sanitizeResources: false,
      fn: () => run(i),
    });
  };
};
