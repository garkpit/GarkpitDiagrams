// Write a synced export of this library into another folder, with a SOURCE.md naming the commit.
//   bun scripts/export.ts <dest> [--note "<what the consumer changed>"]
// Exports committed HEAD only (git archive), so commit first. Removes the previous export's
// src/ and cli/ (and any old vendor/) so deleted files go; anything else in <dest> (the consumer's own files) stays.
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('usage: bun scripts/export.ts <dest> [--note <text>]\n\nWrites a synced export (src, cli, package.json, bun.lock, tsconfig.json, README.md) plus SOURCE.md.\n\nexample: bun scripts/export.ts ../my-app/tools/diagrams');
  process.exit(args.length === 0 ? 2 : 0);
}
const repo = resolve(import.meta.dir, '..');
const dest = resolve(args[0]!);
const noteAt = args.indexOf('--note');
const note = noteAt >= 0 ? args[noteAt + 1] : undefined;
const git = (...a: string[]) => {
  const p = Bun.spawnSync(['git', '-C', repo, ...a]);
  if (p.exitCode !== 0) throw new Error(`git ${a.join(' ')}: ${p.stderr.toString()}`);
  return p.stdout;
};
if (git('status', '--porcelain', 'src', 'cli', 'package.json', 'bun.lock').toString().trim()) {
  console.error('error: uncommitted changes in src/cli/package files; the export takes committed HEAD.\n  fix: commit first, then re-run.');
  process.exit(1);
}
const sha = git('rev-parse', 'HEAD').toString().trim();
const subject = git('log', '-1', '--format=%s').toString().trim();
const files = ['src', 'cli', 'package.json', 'bun.lock', 'tsconfig.json', 'README.md'];
mkdirSync(dest, { recursive: true });
for (const d of ['src', 'cli', 'vendor']) rmSync(`${dest}/${d}`, { recursive: true, force: true });
const tar = Bun.spawnSync(['tar', '-x', '-C', dest], { stdin: git('archive', sha, ...files) });
if (tar.exitCode !== 0) throw new Error(`tar: ${tar.stderr.toString()}`);
const today = new Date().toISOString().slice(0, 10);
await Bun.write(
  `${dest}/SOURCE.md`,
  `# SOURCE: synced export of @garkpit/diagrams

This directory is a **synced export**, not original code. Do not edit \`src/\` or \`cli/\`;
change them in GarkpitDiagrams and re-export.

| Field | Value |
|-------|-------|
| Origin repo | github.com/garkpit/GarkpitDiagrams |
| Origin commit | \`${sha}\` ("${subject}") |
| Exported on | ${today} |
| Exported with | \`bun scripts/export.ts <this folder>\` in the origin repo |
| Local changes | ${note ?? 'None.'} |

## Refresh

In the origin repo, commit, then \`bun scripts/export.ts <this folder>\`. Then \`bun install\` here.
`
);
console.log(`exported ${sha.slice(0, 8)} to ${dest}`);
