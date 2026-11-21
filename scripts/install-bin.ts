// Writes ~/.local/bin/diagrams, a small wrapper that runs this checkout's CLI with Bun.
// Usage: bun run install:bin [--dir <bin dir>] [--dry-run]

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write("Usage: bun run install:bin [--dir <bin dir>] [--dry-run]\n\nWrites <dir>/diagrams (default ~/.local/bin/diagrams) pointing at this checkout.\n\nExample: bun run install:bin --dry-run\n");
  process.exit(0);
}
const dirAt = args.indexOf("--dir");
const binDir = dirAt >= 0 && args[dirAt + 1] ? resolve(args[dirAt + 1] as string) : join(homedir(), ".local", "bin");
const cli = resolve(import.meta.dir, "..", "cli", "diagrams.ts");
const target = join(binDir, "diagrams");

const wrapper = `#!/bin/sh
# diagrams wrapper, written by \`bun run install:bin\`. Source: ${cli}
for bun in "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /usr/local/bin/bun; do
  if [ -x "$bun" ]; then exec "$bun" '${cli.replaceAll("'", "'\\''")}' "$@"; fi
done
if command -v bun >/dev/null 2>&1; then exec bun '${cli.replaceAll("'", "'\\''")}' "$@"; fi
printf '%s\\n' 'diagrams: Bun not found; install it from https://bun.sh' >&2
exit 127
`;

if (args.includes("--dry-run")) {
  process.stdout.write(`Would write ${target}:\n\n${wrapper}`);
  process.exit(0);
}
const existing = await readFile(target, "utf8").catch(() => undefined);
if (existing !== undefined && !existing.includes("written by `bun run install:bin`")) {
  process.stderr.write(`error: ${target} exists and was not written by @garkpit/diagrams; refusing to overwrite.\n  fix: move it aside, or pass --dir <other bin dir>.\n`);
  process.exit(1);
}
await mkdir(binDir, { recursive: true });
await writeFile(target, wrapper);
await chmod(target, 0o755);
process.stdout.write(`${existing === undefined ? "installed" : "updated"} ${target} -> ${cli}\n`);
