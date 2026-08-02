function main() {
  const n = 200_000_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = (i & 1023) + 1;
    sum = (sum + ((i / d) | 0) + (i % d)) | 0;
  }
  console.log(sum);
}
main();
