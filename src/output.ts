// Write a scene's files: .excalidraw (editable), .svg (font embedded), optional PNG preview; and a
// gallery page that shows every scene with its fit-check result.
import { mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { type CheckResult, checkScene } from './check.ts';
import { screenshot } from './chrome.ts';
import { fontFaceCss } from './font.ts';
import type { Loaded } from './load.ts';
import { renderSvg, svgSize } from './svg.ts';

export interface Rendered {
  name: string;
  excalidraw?: string;
  svg: string;
  png?: string;
  width: number;
  height: number;
  check: CheckResult;
  note?: string;
}

export interface RenderOptions {
  outDir?: string;
  /** Folder for PNG previews; omitted = no PNGs. */
  previewDir?: string;
  /** Device pixel ratio of previews. Default 1. */
  scale?: number;
  /** `source` field written into .excalidraw files. */
  source?: string;
  /** Skip writing the .excalidraw (e.g. when the input already is one). */
  noExcalidraw?: boolean;
}

export async function renderOne(item: Loaded, opts: RenderOptions = {}): Promise<Rendered> {
  const out = opts.outDir ?? item.home;
  mkdirSync(out, { recursive: true });
  const check = checkScene(item.scene, item.name);
  let excalidraw: string | undefined;
  if (!opts.noExcalidraw && !item.source.endsWith('.excalidraw')) {
    excalidraw = join(out, `${item.name}.excalidraw`);
    await writeFileAtomic(excalidraw, item.scene.file(opts.source));
  }
  const svgText = await renderSvg(item.scene);
  const svg = join(out, `${item.name}.svg`);
  await writeFileAtomic(svg, svgText);
  const { w, h } = svgSize(svgText);
  let png: string | undefined;
  if (opts.previewDir) {
    mkdirSync(opts.previewDir, { recursive: true });
    png = join(opts.previewDir, `${item.name}.png`);
    await screenshot(svg, png, w, h, opts.scale ?? 1);
  }
  return { name: item.name, excalidraw, svg, png, width: w, height: h, check, note: item.note };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface GalleryOptions {
  title: string;
  /** Short notes per scene name, shown under its heading (e.g. what worked, what did not). */
  notes?: Record<string, string>;
}

/** A single self-contained HTML page with every rendered scene and its check result. */
export async function galleryPage(items: Rendered[], dir: string, opts: GalleryOptions): Promise<string> {
  const cards: string[] = [];
  for (const r of items) {
    const svg = (await Bun.file(r.svg).text()).replace(/<style>@font-face[\s\S]*?<\/style>/, '').replace(/<svg([^>]*?)\swidth="[^"]+"\sheight="[^"]+"/, '<svg$1');
    const badge = r.check.ok
      ? `<span class="badge ok">fit check passed${r.check.warnings ? `, ${r.check.warnings} warning${r.check.warnings > 1 ? 's' : ''}` : ''}</span>`
      : `<span class="badge bad">${r.check.errors} fit error${r.check.errors > 1 ? 's' : ''}</span>`;
    const findings = r.check.findings.filter((f) => f.severity !== 'info');
    const list = findings.length ? `<ul class="findings">${findings.map((f) => `<li class="${f.severity}"><b>${f.rule}</b> ${esc(f.message)}</li>`).join('')}</ul>` : '';
    const noteText = opts.notes?.[r.name] ?? r.note;
    const note = noteText ? `<p class="note">${esc(noteText)}</p>` : '';
    const links = [r.excalidraw && `<a href="${esc(relative(dir, r.excalidraw))}">.excalidraw</a>`, `<a href="${esc(relative(dir, r.svg))}">.svg</a>`].filter(Boolean).join(' · ');
    cards.push(
      `<section class="card" id="${esc(r.name)}"><header><h2>${esc(r.name)}</h2>${badge}<span class="meta">${r.width}×${r.height} px · ${links}</span></header>${note}${list}<div class="svg" style="max-width:${r.width}px">${svg}</div></section>`
    );
  }
  const toc = items.map((r) => `<a href="#${esc(r.name)}" class="${r.check.ok ? '' : 'bad'}">${esc(r.name)}</a>`).join('');
  const css = `${await fontFaceCss()}
:root { --bg:#f1f3f5; --card:#fff; --ink:#1e1e1e; --muted:#5c636a; --line:#dee2e6; --ok:#2b8a3e; --bad:#c92a2a; --warn:#e67700; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg:#16181b; --card:#22252a; --ink:#e9ecef; --muted:#adb5bd; --line:#343a40; --ok:#69db7c; --bad:#ff8787; --warn:#ffc078; } }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system, "Helvetica Neue", sans-serif; }
.top { position:sticky; top:0; z-index:1; background:var(--card); border-bottom:1px solid var(--line); padding:12px 24px; }
.top h1 { font-family:Excalifont, sans-serif; font-weight:400; font-size:28px; margin:0 0 6px; }
nav { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:13px; }
nav a { color:var(--muted); text-decoration:none; } nav a.bad { color:var(--bad); } nav a:hover { color:var(--ink); }
main { padding:20px 24px 60px; display:grid; gap:24px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 20px; }
.card header { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
.card h2 { font-family:Excalifont, sans-serif; font-weight:400; font-size:22px; margin:0; }
.meta { color:var(--muted); font-size:13px; } .meta a { color:inherit; }
.badge { font-size:12px; padding:2px 8px; border-radius:99px; border:1px solid currentColor; }
.badge.ok { color:var(--ok); } .badge.bad { color:var(--bad); }
.note { color:var(--muted); margin:6px 0 0; max-width:110ch; }
.findings { font-size:13px; margin:8px 0 0; padding-left:18px; } .findings .error { color:var(--bad); } .findings .warn { color:var(--warn); }
.svg { margin-top:12px; background:#fff; border-radius:8px; } .svg svg { width:100%; height:auto; display:block; }`;
  const ok = items.filter((r) => r.check.ok).length;
  return `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(opts.title)}</title><style>${css}</style><body><div class="top"><h1>${esc(opts.title)}</h1><nav><span>${ok}/${items.length} pass the fit check</span>${toc}</nav></div><main>${cards.join('\n')}</main></body></html>`;
}
