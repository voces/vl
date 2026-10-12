// The filesystem path a `file:` URL names, for the files Deno type-checks:
// a `node:url` import needs `@types/node`, which ci-native never installs.
// A Windows drive path keeps forward slashes, which every Windows API accepts.
export function filePath(url: URL | string): string {
  const path = decodeURIComponent(new URL(url).pathname);
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}
