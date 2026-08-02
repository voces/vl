// binsearch — QUERIES binary searches over a sorted Array of N elements (hand-written).
const N = 4_000_000;
const QUERIES = 6_000_000;

function bsearch(a, n, key) {
  let lo = 0;
  let hi = n - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = a[mid];
    if (v < key) {
      lo = mid + 1;
    } else {
      if (v > key) {
        hi = mid - 1;
      } else {
        found = mid;
        lo = hi + 1;
      }
    }
  }
  return found;
}

function run(n, queries) {
  const a = [];
  for (let i = 0; i < n; i++) {
    a.push(i * 3);
  }
  let seed = 987654321;
  let hits = 0;
  let idxSum = 0;
  for (let q = 0; q < queries; q++) {
    seed = (seed * 48271) % 2147483647;
    const key = seed % (3 * n);
    const idx = bsearch(a, n, key);
    if (idx >= 0) {
      hits += 1;
      idxSum += idx;
    }
  }
  console.log(hits);
  return idxSum;
}

console.log(run(N, QUERIES));
