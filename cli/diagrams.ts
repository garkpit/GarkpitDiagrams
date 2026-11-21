#!/usr/bin/env bun
// diagrams: render, preview, check, gallery and PDF for Excalidraw scenes. Help comes from
// cli/commands.ts, the same table the README's command reference is generated from.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { writeFileAtomic } from '../src/atomic.ts';
import { type CheckResult, checkScene, RULES } from '../src/check.ts';
import { screenshot } from '../src/chrome.ts';
import { renderDoc } from '../src/doc.ts';
import { LoadError, type Loaded, loadScenes } from '../src/load.ts';
import { galleryPage, type Rendered, renderOne } from '../src/output.ts';
import { renderSvg, svgSize } from '../src/svg.ts';
import { type Command, COMMANDS, type Flag, GLOBAL_FLAGS, INPUT_HELP } from './commands.ts';

// Scenes modules anywhere can `import { flow } from '@garkpit/diagrams'`: the CLI resolves it to this
// copy of the library, so a doc folder needs no node_modules of its own.
const SELF = resolve(import.meta.dir, '../src/index.ts');
Bun.plugin({
  name: 'garkpit-diagrams-self',
  setup(build) {
    // Bun's runtime plugins cannot resolve a bare package name, so rewrite the specifier as each
    // TypeScript file outside node_modules loads.
    build.onLoad({ filter: /^(?!.*\/node_modules\/).*\.m?ts$/ }, async ({ path }) => {
      const text = await Bun.file(path).text();
      const contents = text.includes('@garkpit/diagrams') ? text.replace(/(from\s*|import\s*\(\s*)(['"])@garkpit\/diagrams\2/g, `$1$2${SELF}$2`) : text;
      return { contents, loader: 'ts' };
    });
  }
});

// ---------- output ----------

const colourOn = process.stdout.isTTY && !process.env.NO_COLOR && !process.argv.includes('--no-color');
const paint = (code: number) => (s: string) => (colourOn ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { bold: paint(1), dim: paint(2), red: paint(31), green: paint(32), yellow: paint(33), cyan: paint(36) };
const out = (s = '') => process.stdout.write(`${s}\n`);
const err = (s: string) => process.stderr.write(`${s}\n`);

class UsageError extends Error {}

// ---------- parsing ----------

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

function closest(word: string, options: string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = distance(word, o);
    if (d < bestD) [best, bestD] = [o, d];
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

interface Parsed {
  positional: string[];
  flags: Map<string, string[]>;
}

function parse(cmd: Command, argv: string[]): Parsed {
  const known = [...cmd.flags, ...GLOBAL_FLAGS];
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith('-') || a === '-') {
      positional.push(a);
      continue;
    }
    const [rawName, inline] = a.startsWith('--') ? (a.slice(2).split(/=(.*)/s) as [string, string?]) : [a.slice(1), undefined];
    const f: Flag | undefined = a.startsWith('--') ? known.find((k) => k.name === rawName) : known.find((k) => k.short === rawName);
    if (!f) {
      const guess = closest(rawName, known.map((k) => k.name));
      throw new UsageError(`unknown flag ${a} for \`diagrams ${cmd.name}\`${guess ? `; did you mean --${guess}?` : ''}\n  see: diagrams help ${cmd.name}`);
    }
    let v = 'true';
    if (f.value) {
      v = inline ?? argv[++i] ?? '';
      if (!v || (v.startsWith('-') && inline === undefined)) throw new UsageError(`--${f.name} needs a value ${f.value}\n  see: diagrams help ${cmd.name}`);
    }
    flags.set(f.name, [...(flags.get(f.name) ?? []), v]);
  }
  return { positional, flags };
}

const one = (p: Parsed, n: string) => p.flags.get(n)?.at(-1);
const has = (p: Parsed, n: string) => p.flags.has(n);

// ---------- help ----------

function usageLine(cmd: Command) {
  const opt = cmd.flags.length ? ' [flags]' : '';
  return `diagrams ${cmd.name}${cmd.args ? ` ${cmd.args}` : ''}${opt}`;
}

function flagLine(f: Flag) {
  return `${f.short ? `-${f.short}, ` : '    '}--${f.name}${f.value ? ` ${f.value}` : ''}`;
}

function printFlags(flags: Flag[]) {
  const w = Math.max(...flags.map((f) => flagLine(f).length));
  for (const f of flags) out(`  ${c.cyan(flagLine(f).padEnd(w))}  ${f.desc}`);
}

function helpAll() {
  out(`${c.bold('diagrams')} ${c.dim(pkg.version)}  Excalidraw diagrams from a TypeScript DSL: render, check, preview, gallery, PDF.`);
  out();
  out(c.bold('Usage'));
  out('  diagrams <command> [args] [flags]');
  out();
  out(c.bold('Commands'));
  const w = Math.max(...COMMANDS.map((x) => x.name.length));
  for (const x of COMMANDS) out(`  ${c.cyan(x.name.padEnd(w))}  ${x.summary}`);
  out();
  out(c.bold('Global flags'));
  printFlags(GLOBAL_FLAGS);
  out();
  out(c.bold('Inputs'));
  out(`  ${INPUT_HELP}`);
  out();
  out(c.bold('Examples'));
  for (const e of ['diagrams render docs/concepts/evals --preview /tmp/previews', 'diagrams check drawing.excalidraw', 'diagrams help render']) out(`  ${e}`);
}

function helpOne(cmd: Command) {
  out(`${c.bold('Usage')}  ${usageLine(cmd)}`);
  out();
  out(cmd.summary);
  out(c.dim(cmd.detail));
  if (cmd.args.includes('input')) {
    out();
    out(c.dim(INPUT_HELP));
  }
  if (cmd.flags.length) {
    out();
    out(c.bold('Flags'));
    printFlags([...cmd.flags, ...GLOBAL_FLAGS.filter((g) => g.name === 'help')]);
  }
  out();
  out(c.bold('Examples'));
  for (const e of cmd.examples) out(`  ${e}`);
}

// ---------- shared ----------

async function inputs(p: Parsed, cmd: Command): Promise<Loaded[]> {
  if (p.positional.length === 0) throw new UsageError(`\`diagrams ${cmd.name}\` needs at least one input\n  usage: ${usageLine(cmd)}`);
  const all = (await Promise.all(p.positional.map(loadScenes))).flat();
  const only = p.flags.get('only');
  if (!only) return all;
  const missing = only.filter((n) => !all.some((x) => x.name === n));
  if (missing.length) {
    const names = all.map((x) => x.name);
    throw new UsageError(missing.map((m) => `no scene named "${m}"${closest(m, names) ? `; did you mean "${closest(m, names)}"?` : ''}`).join('\n') + `\n  scenes: ${names.join(', ')}`);
  }
  return all.filter((x) => only.includes(x.name));
}

function printCheck(r: CheckResult, quiet = false) {
  const shown = r.findings.filter((f) => f.severity !== 'info');
  const info = r.findings.length - shown.length;
  if (quiet && shown.length === 0) return;
  const head = r.ok ? (r.warnings ? c.yellow('warn') : c.green(' ok ')) : c.red('FAIL');
  out(`${head}  ${c.bold(r.name)}${c.dim(`  ${r.elements} elements${info ? `, ${info} info` : ''}`)}`);
  for (const f of shown) {
    const tag = f.severity === 'error' ? c.red('error') : c.yellow('warn ');
    out(`      ${tag} ${c.cyan(f.rule)} ${f.message}${f.at ? c.dim(` @${f.at[0]},${f.at[1]}`) : ''}`);
  }
}

function summary(results: CheckResult[]) {
  const failed = results.filter((r) => !r.ok).length;
  const errors = results.reduce((t, r) => t + r.errors, 0);
  const warns = results.reduce((t, r) => t + r.warnings, 0);
  out();
  out(failed ? c.red(`${failed} of ${results.length} scenes fail the fit check (${errors} errors, ${warns} warnings)`) : c.green(`all ${results.length} scenes pass the fit check${warns ? ` (${warns} warnings)` : ''}`));
}

// ---------- commands ----------

async function cmdRender(p: Parsed, cmd: Command): Promise<number> {
  const items = await inputs(p, cmd);
  const outDir = one(p, 'out');
  const preview = one(p, 'preview');
  const scale = Number(one(p, 'scale') ?? 1);
  if (!(scale > 0)) throw new UsageError('--scale must be a positive number');
  const done: Rendered[] = [];
  for (const it of items) {
    const r = await renderOne(it, { outDir: outDir && resolve(outDir), previewDir: preview && resolve(preview), scale, source: one(p, 'source') });
    done.push(r);
    if (!has(p, 'json')) {
      printCheck(r.check);
      out(c.dim(`      ${r.width}×${r.height}  ${r.svg}${r.png ? `  ${r.png}` : ''}`));
    }
  }
  const failed = done.some((r) => !r.check.ok);
  if (has(p, 'json')) out(JSON.stringify({ ok: !failed, scenes: done }, null, 2));
  else summary(done.map((r) => r.check));
  return failed && !has(p, 'allow-errors') ? 1 : 0;
}

async function cmdPreview(p: Parsed, cmd: Command): Promise<number> {
  const items = await inputs(p, cmd);
  const dir = resolve(one(p, 'out') ?? join(tmpdir(), 'garkpit-diagrams', 'previews'));
  const scale = Number(one(p, 'scale') ?? 1);
  if (!(scale > 0)) throw new UsageError('--scale must be a positive number');
  mkdirSync(dir, { recursive: true });
  const rows: Array<{ name: string; png: string; width: number; height: number }> = [];
  for (const it of items) {
    const svgText = await renderSvg(it.scene);
    const svg = join(dir, `${it.name}.svg`);
    await writeFileAtomic(svg, svgText);
    const { w, h } = svgSize(svgText);
    const png = join(dir, `${it.name}.png`);
    await screenshot(svg, png, w, h, scale);
    rows.push({ name: it.name, png, width: w, height: h });
    if (!has(p, 'json')) out(`${c.green('png')}  ${c.bold(it.name)}  ${c.dim(`${w}×${h}`)}  ${png}`);
  }
  if (has(p, 'json')) out(JSON.stringify({ dir, previews: rows }, null, 2));
  return 0;
}

async function cmdCheck(p: Parsed, cmd: Command): Promise<number> {
  const items = await inputs(p, cmd);
  const results = items.map((it) => checkScene(it.scene, it.name));
  const strict = has(p, 'strict');
  const bad = results.filter((r) => !r.ok || (strict && r.warnings > 0));
  if (has(p, 'json')) out(JSON.stringify({ ok: bad.length === 0, strict, results }, null, 2));
  else {
    for (const r of results) printCheck(r, has(p, 'quiet'));
    summary(results);
  }
  return bad.length ? 1 : 0;
}

async function cmdGallery(p: Parsed, cmd: Command): Promise<number> {
  const items = await inputs(p, cmd);
  const o = one(p, 'out');
  if (!o) throw new UsageError(`\`diagrams gallery\` needs --out <dir>\n  example: ${cmd.examples[0]}`);
  const dir = resolve(o);
  const done: Rendered[] = [];
  for (const it of items) done.push(await renderOne(it, { outDir: join(dir, 'images') }));
  const title = one(p, 'title') ?? `${basename(dirname(resolve(p.positional[0]!)))} diagrams`;
  const page = join(dir, 'index.html');
  await writeFileAtomic(page, await galleryPage(done, dir, { title }));
  if (has(p, 'json')) out(JSON.stringify({ page, scenes: done }, null, 2));
  else {
    for (const r of done) printCheck(r.check, true);
    summary(done.map((r) => r.check));
    out(`${c.green('wrote')} ${page}`);
  }
  if (has(p, 'open')) Bun.spawn(['open', page]);
  return 0;
}

async function cmdPdf(p: Parsed, cmd: Command): Promise<number> {
  const doc = p.positional[0];
  if (!doc || p.positional.length > 1) throw new UsageError(`\`diagrams pdf\` takes exactly one Markdown file\n  usage: ${usageLine(cmd)}`);
  if (!doc.endsWith('.md')) throw new UsageError(`${doc} is not a .md file`);
  if (!(await Bun.file(doc).exists())) throw new UsageError(`no such file: ${doc}`);
  const r = await renderDoc(doc, { outDir: one(p, 'out'), orientation: has(p, 'portrait') ? 'portrait' : 'landscape', htmlOnly: has(p, 'html-only') });
  if (has(p, 'json')) out(JSON.stringify(r, null, 2));
  else {
    out(`${c.green('html')} ${r.html}`);
    if (r.pdf) out(`${c.green('pdf ')} ${r.pdf.path}  ${c.dim(`${(r.pdf.bytes / 1024).toFixed(0)} KB, ${(r.pdf.wallTimeMs / 1000).toFixed(1)} s`)}`);
    for (const m of r.missing) err(`${c.yellow('missing image')} ${m} (render the diagrams first)`);
  }
  return r.missing.length ? 1 : 0;
}

async function cmdList(p: Parsed, cmd: Command): Promise<number> {
  const items = await inputs(p, cmd);
  const rows = items.map((it) => {
    const b = it.scene.bounds();
    return { name: it.name, width: Math.round(b.w), height: Math.round(b.h), elements: it.scene.elements.length, source: it.source };
  });
  if (has(p, 'json')) out(JSON.stringify(rows, null, 2));
  else {
    const w = Math.max(...rows.map((r) => r.name.length));
    for (const r of rows) out(`${c.bold(r.name.padEnd(w))}  ${c.dim(`${String(r.width).padStart(5)}×${String(r.height).padEnd(5)} ${String(r.elements).padStart(4)} elements`)}`);
  }
  return 0;
}

function cmdRules(p: Parsed): number {
  if (has(p, 'json')) out(JSON.stringify(RULES, null, 2));
  else {
    const w = Math.max(...RULES.map((r) => r.rule.length));
    for (const r of RULES) {
      const sev = r.severity === 'error' ? c.red('error') : r.severity === 'warn' ? c.yellow('warn ') : c.dim('info ');
      out(`${sev}  ${c.cyan(r.rule.padEnd(w))}  ${r.what}`);
    }
  }
  return 0;
}

// ---------- main ----------

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    helpAll();
    return 0;
  }
  const [name, ...rest] = argv;
  if (name === '--version' || name === '-V' || name === 'version') {
    out(pkg.version);
    return 0;
  }
  if (name === '--help' || name === '-h') {
    helpAll();
    return 0;
  }
  const cmd = COMMANDS.find((x) => x.name === name);
  if (!cmd) {
    const guess = closest(name!, COMMANDS.map((x) => x.name));
    throw new UsageError(`unknown command "${name}"${guess ? `; did you mean \`diagrams ${guess}\`?` : ''}\n  see: diagrams help`);
  }
  if (cmd.name === 'help') {
    const target = rest.find((a) => !a.startsWith('-'));
    if (!target) helpAll();
    else {
      const t = COMMANDS.find((x) => x.name === target);
      if (!t) {
        const guess = closest(target, COMMANDS.map((x) => x.name));
        throw new UsageError(`no command "${target}"${guess ? `; did you mean \`${guess}\`?` : ''}`);
      }
      helpOne(t);
    }
    return 0;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    helpOne(cmd);
    return 0;
  }
  const p = parse(cmd, rest);
  switch (cmd.name) {
    case 'render':
      return cmdRender(p, cmd);
    case 'preview':
      return cmdPreview(p, cmd);
    case 'check':
      return cmdCheck(p, cmd);
    case 'gallery':
      return cmdGallery(p, cmd);
    case 'pdf':
      return cmdPdf(p, cmd);
    case 'list':
      return cmdList(p, cmd);
    case 'rules':
      return cmdRules(p);
  }
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError || e instanceof LoadError) {
    err(`${c.red('error:')} ${e.message}`);
    process.exitCode = 2;
  } else {
    err(`${c.red('error:')} ${(e as Error).message}`);
    if (process.env.DEBUG) err(String((e as Error).stack));
    process.exitCode = 3;
  }
}
