function main() {
  const n = 1_000_000_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum = (sum + (i & 65535)) | 0;
  }
  console.log(sum);
}
main();
