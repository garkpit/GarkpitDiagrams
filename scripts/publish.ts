// Publish the public copy: HEAD minus the paths .publicignore excludes, scanned for secrets and for
// private words, committed on top of the public repo's main and pushed; then the Pages site is
// rebuilt and pushed to the same repo. The working branch and the private repo are never touched.
//   bun run publish [--dry-run] [-m <message>] [--no-pages]
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HELP = `Usage  bun run publish [flags]

Publish the public copy of this repo to the "public" remote (github.com/garkpit/GarkpitDiagrams):
committed HEAD minus the paths listed under [exclude] in .publicignore, checked by gitleaks and
for the words under [deny], added as one new commit on the public main, then pushed. The Pages
site is rebuilt and pushed to the public gh-pages branch, stamped with the public commit.

Flags
  -n, --dry-run        Build and scan the public tree, list what would change, push nothing.
  -m, --message <msg>  Commit message on the public main. Default: "Update from <private sha>".
      --no-pages       Publish the code only; leave the site as it is.
  -h, --help           Show help.

Examples
  bun run publish --dry-run
  bun run publish -m "Timeline layout: detail text size"
  bun run publish --no-pages`;

const repo = resolve(import.meta.dir, '..');
const REMOTE = 'public';
// Public commits carry the handle, not a personal name.
const PUBLIC_IDENTITY = { GIT_AUTHOR_NAME: 'garkpit', GIT_AUTHOR_EMAIL: 'garkpit@users.noreply.github.com', GIT_COMMITTER_NAME: 'garkpit', GIT_COMMITTER_EMAIL: 'garkpit@users.noreply.github.com' };
const args = process.argv.slice(2);
let dry = false;
let pages = true;
let message = '';
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '-h' || a === '--help' || a === 'help') {
    console.log(HELP);
    process.exit(0);
  } else if (a === '-n' || a === '--dry-run') dry = true;
  else if (a === '--no-pages') pages = false;
  else if (a === '-m' || a === '--message') {
    const v = args[++i];
    if (!v) fail('--message needs text.\n  example: bun run publish -m "Timeline layout: detail text size"', 2);
    message = v;
  } else {
    const near = ['--dry-run', '--message', '--no-pages', '--help'].find((f) => f.startsWith(a.slice(0, 4)));
    fail(`unknown flag ${a}.${near ? ` Did you mean ${near}?` : ''}\n  see: bun run publish --help`, 2);
  }
}

function fail(msg: string, code = 1): never {
  console.error(`error: ${msg}`);
  process.exit(code);
}
const git = (a: string[], env?: Record<string, string>) => {
  const p = Bun.spawnSync(['git', '-C', repo, ...a], { env: { ...process.env, ...env }, stderr: 'pipe' });
  return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
};
const must = (a: string[], env?: Record<string, string>) => {
  const r = git(a, env);
  if (!r.ok) fail(`git ${a.join(' ')} failed:\n${r.err}`);
  return r.out;
};

// .publicignore: "[exclude]" pathspecs (git glob syntax) and "[deny]" words (case-insensitive). The file itself never ships.
const rules = { exclude: ['.publicignore'], deny: [] as string[] };
let section: keyof typeof rules | '' = '';
for (const raw of (await Bun.file(join(repo, '.publicignore')).text()).split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^\[(exclude|deny)\]$/);
  if (m) section = m[1] as keyof typeof rules;
  else if (section) rules[section].push(line);
  else fail(`.publicignore: "${line}" is outside a [exclude] or [deny] section.`);
}

if (!git(['remote', 'get-url', REMOTE]).ok) fail(`no "${REMOTE}" remote.\n  fix: git remote add ${REMOTE} https://github.com/garkpit/GarkpitDiagrams.git`);
if (must(['status', '--porcelain', '--untracked-files=no'])) fail('uncommitted changes; the public copy is built from committed HEAD.\n  fix: commit first, then re-run.');
const head = must(['rev-parse', '--short', 'HEAD']);

// 1. The public tree: HEAD with the excluded paths taken out of a throwaway index.
const index = join(repo, '.git', 'publish-index');
rmSync(index, { force: true });
const env = { GIT_INDEX_FILE: index };
must(['read-tree', 'HEAD'], env);
must(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...rules.exclude.map((p) => `:(glob)${p}`)], env);
const tree = must(['write-tree'], env);
rmSync(index, { force: true });

// 2. Scan exactly that tree: gitleaks for secrets, then the deny words.
const scan = mkdtempSync(join(tmpdir(), 'garkpit-publish-'));
try {
  const archive = Bun.spawnSync(['sh', '-c', `git -C "${repo}" archive ${tree} | tar -x -C "${scan}"`], { stderr: 'pipe' });
  if (archive.exitCode !== 0) fail(`could not unpack the public tree: ${archive.stderr.toString().trim()}`);
  const leaks = Bun.spawnSync(['gitleaks', 'dir', scan, '--no-banner', '--redact', '--exit-code', '3'], { stdout: 'pipe', stderr: 'pipe' });
  if (leaks.exitCode === 3) fail(`gitleaks found secrets in the public tree:\n${leaks.stderr.toString().trim()}`);
  if (leaks.exitCode !== 0) fail(`gitleaks did not run cleanly (exit ${leaks.exitCode}). Is it installed? brew install gitleaks\n${leaks.stderr.toString().trim()}`);
  const hits: string[] = [];
  for (const word of rules.deny) {
    const rg = Bun.spawnSync(['rg', '-n', '-i', '-F', '--no-heading', '-o', word, scan], { stdout: 'pipe' });
    for (const l of rg.stdout.toString().trim().split('\n').filter(Boolean)) hits.push(l.replace(`${scan}/`, ''));
  }
  if (hits.length) fail(`private words in the public tree (fix the file, or add it to [exclude] in .publicignore):\n  ${hits.slice(0, 20).join('\n  ')}${hits.length > 20 ? `\n  … and ${hits.length - 20} more` : ''}`);
} finally {
  rmSync(scan, { recursive: true, force: true });
}

// 3. One commit on top of the public main (or the first one).
git(['fetch', '-q', REMOTE]);
const parent = git(['rev-parse', '--verify', '-q', `refs/remotes/${REMOTE}/main`]).out;
// The public history is its own line. If it shares commits with this branch, the remote is the private repo.
if (parent && git(['merge-base', parent, 'HEAD']).ok) fail(`${REMOTE}/main shares history with HEAD, so "${REMOTE}" points at the private repo. Nothing pushed.\n  fix: git remote set-url ${REMOTE} https://github.com/garkpit/GarkpitDiagrams.git`);
const files = must(['ls-tree', '-r', '--name-only', tree]).split('\n').length;
const changed = parent ? must(['diff', '--stat', parent, tree]) : `${files} files (first publish)`;
let publicSha = parent ? must(['rev-parse', '--short', parent]) : '';

if (parent && must(['rev-parse', `${parent}^{tree}`]) === tree) {
  console.log(`public main already matches HEAD ${head} (${files} files); no code to push.`);
} else if (dry) {
  console.log(`dry run: would publish ${files} files from ${head}. Scans clean.\n${changed}`);
  process.exit(0);
} else {
  const msg = message || `Update from ${head}`;
  const commit = must(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', msg], PUBLIC_IDENTITY);
  const push = Bun.spawnSync(['git', '-C', repo, 'push', REMOTE, `${commit}:refs/heads/main`], { stdout: 'inherit', stderr: 'inherit' });
  if (push.exitCode !== 0) fail(`push to ${REMOTE} failed; nothing changed there. Check access (gh auth status) and re-run.`);
  git(['fetch', '-q', REMOTE]);
  publicSha = commit.slice(0, 7);
  console.log(`published ${publicSha} to ${REMOTE}/main (${files} files, from ${head})\n${changed}`);
}
if (dry) {
  console.log('dry run: scans clean; nothing to publish.');
  process.exit(0);
}

// 4. The site, stamped with the public commit.
if (pages) {
  const p = Bun.spawnSync([process.execPath, 'scripts/pages.ts', '--push', '--remote', REMOTE], { cwd: repo, env: { ...process.env, SOURCE_SHA: publicSha }, stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) fail('the code is published but the site push failed; re-run: bun run pages --push', p.exitCode ?? 1);
}
