// String-keyed map. See main.vl for the shape.
//
// Idiomatic JS: a plain `Map` with string keys.
function main() {
  const n = 100_000;
  const r = 150;
  const total = 2 * n;

  const insKeys = [];
  for (let i = 0; i < n; i++) {
    insKeys.push("key" + i);
  }
  // Distinct objects, equal content for the first n.
  const probe = [];
  for (let i = 0; i < total; i++) {
    probe.push("key" + i);
  }

  const m = new Map();
  for (let i = 0; i < n; i++) {
    m.set(insKeys[i], i * 3 + 1);
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
