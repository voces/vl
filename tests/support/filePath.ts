// The filesystem path a `file:` URL names, for the files Deno type-checks:
// a `node:url` import needs `@types/node`, which ci-native never installs.
// A Windows drive path keeps forward slashes, which every Windows API accepts.
export function filePath(url: URL | string): string {
  const path = decodeURIComponent(new URL(url).pathname);
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

/** `p` in the spelling the native host prints it: on Windows the host turns
 * every `\` in a path argument into `/`, so a test comparing a path against host
 * output compares this spelling. The identity off Windows. */
export const slashed = (p: string): string =>
  Deno.build.os === "windows" ? p.replaceAll("\\", "/") : p;

/** `Deno.makeTempDir`, spelled as the host prints it (see `slashed`). */
export const makeTempDir = async (
  options?: Deno.MakeTempOptions,
): Promise<string> => slashed(await Deno.makeTempDir(options));
