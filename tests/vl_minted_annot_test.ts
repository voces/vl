// A REWRITE-MINTED ANNOTATION IS READ AT THE INSTANCE'S BINDINGS (D14080).
//
// `() => x` and `(): U | null => x` handed to `len<T>(f: () => T | null)` at `U = null` both
// print `0`, so no `@log` fixture can tell them apart. What differs is the binding of `T`: before
// the fix the un-annotated face bound `T = null` and the annotated one `T = i32`, which is two
// `len` instances for one program. This suite counts them in the name section. A control that
// MUST build two instances (`U = null` and `U = string`) keeps a counter that stopped seeing
// instances from passing.
import { assertSeed, seedExports } from "./support/sharedInstance.ts";

// The function names (subsection 1) of a module's `name` custom section.
const namesOf = (bytes: Uint8Array): string[] => {
  let p = 8;
  const leb = (): number => {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[p++];
      v += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if ((b & 0x80) === 0) return v;
    }
  };
  const str = (): string => {
    const n = leb();
    const s = new TextDecoder().decode(bytes.subarray(p, p + n));
    p += n;
    return s;
  };
  const out: string[] = [];
  while (p < bytes.length) {
    const id = bytes[p++];
    const end = leb() + p;
    if (id === 0 && str() === "name") {
      while (p < end) {
        const sub = bytes[p++];
        const subEnd = leb() + p;
        if (sub === 1) {
          const count = leb();
          for (let i = 0; i < count; i++) {
            leb();
            out.push(str());
          }
        }
        p = subEnd;
      }
    }
    p = end;
  }
  return out;
};

const lenInstances = (src: string): string[] => {
  const e = seedExports();
  e.modReset();
  e.setEmitNames(1);
  e.srcReset();
  for (const ch of src) e.srcPush(ch.codePointAt(0)!);
  const rc = e.compileSrc();
  if (rc !== 0) throw new Error(`compile rc ${rc}, want 0`);
  const bytes = new Uint8Array(e.rbyteLen());
  for (let i = 0; i < bytes.length; i++) bytes[i] = e.rbyteAt(i);
  return namesOf(bytes).filter((n) => /^len(\$\d+)?$/.test(n));
};

const LEN = `function len<T>(f: () => T | null) {
  const t = f()
  if t == null { 0 } else { 1 }
}
function outer<U>(x: U) { print(len(() => x)) }
function outerAnn<U>(x: U) { print(len((): U | null => x)) }
`;

Deno.test({
  name: "minted annotation: both faces at U = null bind one len instance",
  ignore: !assertSeed(),
  fn: () => {
    const got = lenInstances(LEN + "outer(null)\nouterAnn(null)\n");
    if (got.length !== 1) {
      throw new Error(`want 1 len instance, got ${got.length}: ${got.join(", ")}`);
    }
  },
});

Deno.test({
  name: "minted annotation: control, U = null and U = string are two len instances",
  ignore: !assertSeed(),
  fn: () => {
    const got = lenInstances(LEN + "outer(null)\nouter(\"s\")\n");
    if (got.length !== 2) {
      throw new Error(`want 2 len instances, got ${got.length}: ${got.join(", ")}`);
    }
  },
});
