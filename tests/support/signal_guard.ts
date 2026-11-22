// Preloaded into every `deno test` run (`--preload tests/support/signal_guard.ts`). A child
// that died by a signal, or exited 128 or more (a shell's report of one), is no reading: the
// kernel's OOM killer, earlyoom or a timeout's KILL stopped it. A test that takes any non-zero
// exit as its expected failure would read that death as a pass, so every `Deno.Command` result
// a test reads throws a harness error instead. A spawned child's own `status` is left alone.

const Orig = Deno.Command;

function guard(cmd: string, s: Deno.CommandStatus): void {
  if (s.signal !== null || s.code >= 128) {
    const how = s.signal !== null ? `was killed by ${s.signal}` : `exited ${s.code}`;
    throw new Error(
      `harness error: \`${cmd}\` ${how} (128 and up is a death by signal, not a result). ` +
        "No test outcome is a reading here; rerun with less load.",
    );
  }
}

class Guarded extends Orig {
  #cmd: string;
  constructor(cmd: string | URL, opts?: Deno.CommandOptions) {
    super(cmd, opts);
    this.#cmd = [String(cmd), ...(opts?.args ?? []).map(String)].join(" ").slice(0, 200);
  }
  override async output(): Promise<Deno.CommandOutput> {
    const o = await super.output();
    guard(this.#cmd, o);
    return o;
  }
  override outputSync(): Deno.CommandOutput {
    const o = super.outputSync();
    guard(this.#cmd, o);
    return o;
  }
  override spawn(): Deno.ChildProcess {
    const c = super.spawn();
    const out = c.output.bind(c);
    const cmd = this.#cmd;
    c.output = async () => {
      const o = await out();
      guard(cmd, o);
      return o;
    };
    return c;
  }
}

Object.defineProperty(Deno, "Command", { value: Guarded, configurable: true, writable: true });
