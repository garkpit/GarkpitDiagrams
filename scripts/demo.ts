// The full demonstration: every gallery scene rendered and fit-checked, then one A4 PDF with an intro,
// the fit-check rules, one page per diagram kind and the build notes at the back.
//   bun run demo [--out <dir>] [--open]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { notes, titles } from '../gallery/scenes.ts';
import { RULES } from '../src/check.ts';

const HELP = `Usage  bun run demo [flags]

Render every gallery scene (fit-checked), then write GarkpitDiagrams-Demonstration.md, .html and .pdf:
an intro, the fit-check rules, one page per diagram kind and the build notes at the back.

Flags
  -o, --out <dir>  Output folder. Default: gallery/out.
      --open       Open the PDF when done.
  -h, --help       Show help.

Examples
  bun run demo
  bun run demo --out /tmp/demo --open
  bun run demo --out site/gallery`;

const repo = resolve(import.meta.dir, '..');
const args = process.argv.slice(2);
let out = join(repo, 'gallery', 'out');
let open = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '-h' || a === '--help' || a === 'help') {
    console.log(HELP);
    process.exit(0);
  } else if (a === '-o' || a === '--out') {
    const v = args[++i];
    if (!v) {
      console.error('error: --out needs a folder.\n  example: bun run demo --out /tmp/demo');
      process.exit(2);
    }
    out = resolve(v);
  } else if (a === '--open') open = true;
  else {
    const near = ['--out', '--open', '--help'].find((f) => f.startsWith(a.slice(0, 4)));
    console.error(`error: unknown flag ${a}.${near ? ` Did you mean ${near}?` : ''}\n  see: bun run demo --help`);
    process.exit(2);
  }
}

const run = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { cwd: repo, stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) process.exit(p.exitCode ?? 1);
};

mkdirSync(out, { recursive: true });
run([process.execPath, 'cli/diagrams.ts', 'gallery', 'gallery/scenes.ts', '--out', out, '--title', 'GarkpitDiagrams gallery']);

const title = (name: string) => titles[name] ?? name;
// SOURCE_SHA: the publish script stamps the public commit instead of the working one.
const sha = process.env.SOURCE_SHA || Bun.spawnSync(['git', '-C', repo, 'rev-parse', '--short', 'HEAD']).stdout.toString().trim();

const md: string[] = [
  '# GarkpitDiagrams: the full demonstration',
  '',
  `\`@garkpit/diagrams\` at \`${sha}\`, rendered ${new Date().toISOString().slice(0, 10)}. Every drawing that follows was laid out from a TypeScript spec, measured in the real Excalifont, fit-checked, and saved as an editable \`.excalidraw\` file that opens in excalidraw.com.`,
  '',
  'One page per diagram kind; the notes written while building each one (what works, what is still short) are at the back.',
  '',
  '**How to get one.** Use the `diagrams` CLI:',
  '',
  '```',
  'diagrams render scenes.ts --out images      # .excalidraw + .svg, fit-checked',
  'diagrams preview scenes.ts --out /tmp/p     # PNG previews to look at',
  'diagrams check drawing.excalidraw           # fit-check any file, drawn by anything',
  'diagrams pdf doc.md                         # Markdown with diagrams to an A4 PDF (this document)',
  'diagrams gallery scenes.ts --out out        # one HTML page of every scene',
  '```',
  '',
  '**The fit check.** Every render runs these rules; errors fail the build.',
  '',
  '| Rule | Severity | What it catches |',
  '|---|---|---|',
  ...RULES.map((r) => `| \`${r.rule}\` | ${r.severity} | ${r.what.replace(/\|/g, '\\|')} |`),
  ''
];
// Diagram pages carry no caption: a tall drawing fills the page and any text under it spills onto a page of its own.
for (const name of Object.keys(notes)) md.push(`## ${title(name)}`, '', `![${title(name)}](images/${name}.svg)`, '');
md.push('## Build notes', '', 'The note written beside each drawing while building it.', '');
for (const [name, note] of Object.entries(notes)) md.push(`**${title(name)}.** ${note}`, '');
md.push(
  '## Where it lives',
  '',
  ...['- Source: github.com/garkpit/GarkpitDiagrams. Rebuild this document with `bun run demo`.', '- Every drawing here also ships as an editable `.excalidraw` file on the gallery page.'],
  ''
);
const doc = join(out, 'GarkpitDiagrams-Demonstration.md');
writeFileSync(doc, md.join('\n'));
run([process.execPath, 'cli/diagrams.ts', 'pdf', doc, '--out', out]);
const pdf = join(out, 'GarkpitDiagrams-Demonstration.pdf');
if (open) Bun.spawnSync(['open', pdf]);
