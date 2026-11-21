// The GitHub Pages site: a landing page, the gallery, the full demonstration (HTML and A4 PDF) and the
// README as a reference page, built locally into site/ and, with --push, committed to the gh-pages
// branch and pushed. No workflow file: GitHub serves the branch as it is.
//   bun run pages [--out <dir>] [--push [--remote <name>]] [--open]
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { titles } from '../gallery/scenes.ts';
import { docHtml } from '../src/doc.ts';
import { fontFaceCss } from '../src/font.ts';

const HELP = `Usage  bun run pages [flags]

Build the GitHub Pages site into site/: a landing page with every diagram kind, the gallery
(editable .excalidraw and .svg for each), the full demonstration as HTML and A4 PDF, and the
README as a reference page. Public wording only: no local paths or internal consumers.

Flags
  -o, --out <dir>  Output folder. Default: site.
      --push       Commit the site to the gh-pages branch and push it to the public repo.
      --remote <name>  Remote to push to with --push. Default: public.
      --open       Open the landing page when done.
  -h, --help       Show help.

Examples
  bun run pages                 # build site/ and look at it
  bun run pages --open
  bun run pages --push          # publish: GitHub serves the gh-pages branch

bun run publish runs this after publishing the code, stamped with the public commit.`;

const repo = resolve(import.meta.dir, '..');
const args = process.argv.slice(2);
let out = join(repo, 'site');
let push = false;
let open = false;
let remote = 'public';
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '-h' || a === '--help' || a === 'help') {
    console.log(HELP);
    process.exit(0);
  } else if (a === '-o' || a === '--out') {
    const v = args[++i];
    if (!v) {
      console.error('error: --out needs a folder.\n  example: bun run pages --out /tmp/site');
      process.exit(2);
    }
    out = resolve(v);
  } else if (a === '--push') push = true;
  else if (a === '--remote') {
    const v = args[++i];
    if (!v) {
      console.error('error: --remote needs a remote name.\n  example: bun run pages --push --remote public');
      process.exit(2);
    }
    remote = v;
  }
  else if (a === '--open') open = true;
  else {
    const near = ['--out', '--push', '--remote', '--open', '--help'].find((f) => f.startsWith(a.slice(0, 4)));
    console.error(`error: unknown flag ${a}.${near ? ` Did you mean ${near}?` : ''}\n  see: bun run pages --help`);
    process.exit(2);
  }
}

const git = (...a: string[]) => {
  const p = Bun.spawnSync(['git', '-C', repo, ...a], { stderr: 'pipe' });
  return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
};
const run = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { cwd: repo, stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) process.exit(p.exitCode ?? 1);
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 1. Gallery and demonstration, public wording.
rmSync(out, { recursive: true, force: true });
const gallery = join(out, 'gallery');
mkdirSync(gallery, { recursive: true });
run([process.execPath, 'scripts/demo.ts', '--out', gallery]);
rmSync(join(gallery, 'GarkpitDiagrams-Demonstration.md'), { force: true });

// 2. The README as a reference page; every inner page gets a way back to the landing page.
const back = (href: string) =>
  `<style>@media print{.home{display:none}}</style><a class="home" href="${href}" style="position:fixed;top:12px;right:16px;z-index:9;font:13px -apple-system,sans-serif;color:#1e1e1e;background:#fff;border:1px solid #ced4da;border-radius:99px;padding:5px 12px;text-decoration:none;box-shadow:0 1px 3px rgba(0,0,0,.15)">\u2190 GarkpitDiagrams</a>`;
const withBack = (html: string, href: string) => html.replace('<body>', `<body>${back(href)}`);
const ref = await docHtml(join(repo, 'README.md'), 'portrait');
writeFileSync(join(out, 'reference.html'), withBack(ref.page.replace(/<title>[^<]*<\/title>/, '<title>GarkpitDiagrams reference</title>'), './'));
for (const f of ['index.html', 'GarkpitDiagrams-Demonstration.html']) {
  const p = join(gallery, f);
  writeFileSync(p, withBack(await Bun.file(p).text(), '../'));
}

// 3. Landing page: what it is, where to go, and every diagram kind as a thumbnail.
// SOURCE_SHA: bun run publish stamps the public commit; otherwise the working one.
const sha = process.env.SOURCE_SHA || git('rev-parse', '--short', 'HEAD').out;
const date = new Date().toISOString().slice(0, 10);
const thumbs: string[] = [];
for (const [name, title] of Object.entries(titles)) {
  const file = join(gallery, 'images', `${name}.svg`);
  if (!existsSync(file)) {
    console.error(`error: ${file} is missing; the gallery did not render ${name}. Fix: bun run gallery, then look at its fit-check output.`);
    process.exit(1);
  }
  const svg = (await Bun.file(file).text()).replace(/<style>@font-face[\s\S]*?<\/style>/, '').replace(/<svg([^>]*?)\swidth="[^"]+"\sheight="[^"]+"/, '<svg$1');
  thumbs.push(`<a class="thumb" href="gallery/#${esc(name)}"><div class="art">${svg}</div><span>${esc(title)}</span></a>`);
}
const css = `${await fontFaceCss()}
:root { --bg:#f1f3f5; --card:#fff; --ink:#1e1e1e; --muted:#5c636a; --line:#dee2e6; --accent:#1971c2; --code:#e9ecef; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg:#16181b; --card:#22252a; --ink:#e9ecef; --muted:#adb5bd; --line:#343a40; --accent:#74c0fc; --code:#2b2f35; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 -apple-system, "Helvetica Neue", sans-serif; }
.wrap { padding:48px 40px 72px; }
h1, h2, .go b, .thumb span { font-family:Excalifont, sans-serif; font-weight:400; }
h1 { font-size:64px; line-height:1; margin:0 0 12px; }
.lede { font-size:20px; color:var(--muted); max-width:80ch; margin:0 0 32px; }
.go { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:40px; }
.go a { display:block; background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:18px 20px; color:inherit; text-decoration:none; transition:border-color .15s, transform .15s; }
.go a:hover { border-color:var(--accent); transform:translateY(-2px); }
.go b { display:block; font-size:26px; margin-bottom:4px; color:var(--accent); }
.go span { color:var(--muted); font-size:14px; }
.facts { display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px 40px; margin-bottom:44px; }
.facts p { margin:0; color:var(--muted); } .facts b { color:var(--ink); }
pre { background:var(--code); border-radius:10px; padding:14px 16px; overflow:auto; font:13.5px/1.5 Menlo, monospace; margin:0 0 44px; }
h2 { font-size:34px; margin:0 0 16px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:20px; }
.thumb { display:flex; flex-direction:column; background:var(--card); border:1.5px solid var(--line); border-radius:14px; overflow:hidden; color:inherit; text-decoration:none; transition:border-color .15s, transform .15s; }
.thumb:hover { border-color:var(--accent); transform:translateY(-2px); }
.art { background:#fff; height:240px; display:flex; align-items:center; justify-content:center; padding:14px; }
.art svg { max-width:100%; max-height:100%; width:auto; height:auto; }
.thumb span { padding:10px 16px 12px; font-size:21px; }
footer { margin-top:48px; color:var(--muted); font-size:13px; }
footer a, .facts a { color:inherit; }`;
const page = `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>GarkpitDiagrams</title><meta name="description" content="Editable Excalidraw diagrams from a TypeScript DSL, with a fit check and SVG, PNG and PDF output.">
<style>${css}</style><body><div class="wrap">
<h1>GarkpitDiagrams</h1>
<p class="lede">Excalidraw diagrams from a small TypeScript DSL. Describe nodes and edges; the library lays them out, measures every label in the real Excalifont, fit-checks the result and writes editable <code>.excalidraw</code> files, SVG, PNG previews and A4 PDFs.</p>
<nav class="go">
<a href="gallery/"><b>Gallery</b><span>All ${thumbs.length} diagram kinds with their fit-check results, each downloadable as .excalidraw and .svg</span></a>
<a href="gallery/GarkpitDiagrams-Demonstration.html"><b>Demonstration</b><span>The full walkthrough: intro, fit-check rules, one page per kind, build notes</span></a>
<a href="gallery/GarkpitDiagrams-Demonstration.pdf"><b>Demonstration PDF</b><span>The same walkthrough as an A4 landscape PDF</span></a>
<a href="reference.html"><b>Reference</b><span>The README: quick start, the DSL, every CLI command and fit-check rule</span></a>
</nav>
<div class="facts">
<p><b>Real font metrics.</b> Labels are measured with Excalifont's glyph advances (fontkit), so shapes grow to fit their text instead of guessing a character width.</p>
<p><b>A fit check on every render.</b> Text inside its shape, arrows routed round nodes, nothing overlapping or straddling a lane, file integrity, legibility once printed.</p>
<p><b>Editable output.</b> Every drawing is a valid Excalidraw v2 file that opens and edits in excalidraw.com; SVGs carry the font, so they look the same everywhere.</p>
</div>
<pre>diagrams render scenes.ts --out images      # .excalidraw + .svg, fit-checked
diagrams preview scenes.ts --out previews   # PNG previews to look at
diagrams check drawing.excalidraw           # fit-check any file, drawn by anything
diagrams pdf doc.md                         # Markdown with diagrams to an A4 PDF</pre>
<h2>Every kind</h2>
<div class="grid">${thumbs.join('\n')}</div>
<footer>Built from <code>${esc(sha)}</code> on ${date}. Excalifont © Excalidraw, used under the SIL Open Font License 1.1.</footer>
</div></body></html>`;
writeFileSync(join(out, 'index.html'), page);
writeFileSync(join(out, '.nojekyll'), '');
console.log(`site built: ${join(out, 'index.html')}`);
if (open) Bun.spawnSync(['open', join(out, 'index.html')]);

// 4. --push: one commit on gh-pages whose tree is exactly site/, without touching the working branch.
if (push) {
  const index = join(repo, '.git', 'pages-index');
  rmSync(index, { force: true });
  // Public commits carry the handle, not a personal name.
  const env = { ...process.env, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'garkpit', GIT_AUTHOR_EMAIL: 'garkpit@users.noreply.github.com', GIT_COMMITTER_NAME: 'garkpit', GIT_COMMITTER_EMAIL: 'garkpit@users.noreply.github.com' };
  const g = (...a: string[]) => {
    const p = Bun.spawnSync(['git', '-C', repo, `--work-tree=${out}`, ...a], { env, stderr: 'pipe' });
    if (p.exitCode !== 0) {
      console.error(`error: git ${a.join(' ')} failed:\n${p.stderr.toString().trim()}`);
      process.exit(1);
    }
    return p.stdout.toString().trim();
  };
  g('add', '-A', '.');
  const tree = g('write-tree');
  rmSync(index, { force: true });
  if (!git('remote', 'get-url', remote).ok) {
    console.error(`error: no "${remote}" remote.\n  fix: git remote add ${remote} https://github.com/garkpit/GarkpitDiagrams.git`);
    process.exit(1);
  }
  git('fetch', '-q', remote, 'gh-pages');
  const parent = git('rev-parse', '--verify', '-q', `refs/remotes/${remote}/gh-pages`).out;
  if (parent && git('rev-parse', `${parent}^{tree}`).out === tree) {
    console.log('gh-pages already holds this site; nothing to push.');
    process.exit(0);
  }
  const commit = g('commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `pages: site from ${sha}`);
  git('update-ref', 'refs/heads/gh-pages', commit);
  const p = Bun.spawnSync(['git', '-C', repo, 'push', remote, 'gh-pages'], { stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) {
    console.error(`error: push failed. The commit is on the local gh-pages branch; fix access and run: git push ${remote} gh-pages`);
    process.exit(1);
  }
  console.log(`pushed gh-pages ${commit.slice(0, 7)} (site from ${sha})`);
}
