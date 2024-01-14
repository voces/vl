import { assertEquals } from "https://deno.land/std@0.207.0/assert/mod.ts";
import { run } from "../index.ts";

Deno.test("object and accessing via proeprty and index expr", () => {
  assertEquals(
    run(`
      let foo = {bar: "baz"}
      foo.bar + foo["bar"]
    `),
    "bazbaz",
  );
});

Deno.test("array and accessing via index expr", () => {
  assertEquals(
    run(`
      let foo = [7]
      foo[0]
    `),
    7,
  );
});

Deno.test("prefix", () => {
  assertEquals(run(`!true`), false);
  assertEquals(run(`not false`), true);
  assertEquals(
    run(`
      let foo = 4
      [++foo, foo]
    `),
    [5, 5],
  );
});
