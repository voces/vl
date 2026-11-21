// A fixture, not a test: an expect-failure case whose child dies by a signal. Run without the
// signal guard it passes, which is the hole; tests/ci_signal_guard_test.ts runs it both ways.
Deno.test("an expect-failure case whose child is SIGKILLed", async () => {
  const r = await new Deno.Command("bash", { args: ["-c", "kill -9 $$"] }).output();
  if (r.code === 0) throw new Error("want a failure");
});

Deno.test("the same through a shell, which reports the kill as exit 137", () => {
  const r = new Deno.Command("bash", { args: ["-c", "bash -c 'kill -9 $$'; exit $?"] }).outputSync();
  if (r.code === 0) throw new Error("want a failure");
});

Deno.test("a plain failure is still a failure the case may expect", async () => {
  const r = await new Deno.Command("bash", { args: ["-c", "exit 1"] }).output();
  if (r.code === 0) throw new Error("want a failure");
});
