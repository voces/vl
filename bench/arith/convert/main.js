function main() {
  const n = 400_000_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const f = i & 65535;
    const k = (f * 1.5 + 0.25) | 0;
    sum += k;
  }
  console.log(sum);
}
main();
