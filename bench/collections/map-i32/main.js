// i32-keyed map. Same skeleton as ../map-string with the key type changed.
//
// Idiomatic JS: a plain `Map` with number keys (V8 keys these on the SMI value).
function main() {
  const n = 200_000;
  const r = 100;
  const total = 2 * n;

  const probe = [];
  for (let i = 0; i < n; i++) {
    probe.push(i * 7 + 3);
  }
  for (let i = 0; i < n; i++) {
    probe.push(i * 7 + 4);
  }

  const m = new Map();
  for (let i = 0; i < n; i++) {
    m.set(i * 7 + 3, i * 3 + 1);
  }

  let hits = 0;
  let misses = 0;
  for (let pass = 0; pass < r; pass++) {
    for (let i = 0; i < total; i++) {
      const v = m.get(probe[i]) ?? -1;
      if (v === -1) {
        misses += 1;
      } else {
        hits += v;
      }
    }
  }

  let iter = 0;
  for (const v of m.values()) {
    iter += v;
  }

  console.log(m.size);
  console.log(hits);
  console.log(misses);
  console.log(iter);
}
main();
