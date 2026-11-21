// Markdown documents with diagrams, to HTML and PDF. Images are inlined (SVGs as markup, so the
// hand-drawn font travels with the page and the drawing stays sharp); headless Chrome prints the PDF.
import { marked } from 'marked';
import { basename, dirname, resolve } from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { printPdf, type PdfResult } from './chrome.ts';
import { fontFaceCss } from './font.ts';

export interface DocOptions {
  /** Output folder. Default `<doc dir>/out`. */
  outDir?: string;
  /** Default landscape: reads well on a Mac screen and gives wide swim lanes room. */
  orientation?: 'landscape' | 'portrait';
  /** Skip the PDF and write only the HTML. */
  htmlOnly?: boolean;
  timeoutMs?: number;
}

export interface DocResult {
  html: string;
  pdf?: PdfResult;
  missing: string[];
  title: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Build the HTML page for a Markdown doc. */
export async function docHtml(mdPath: string, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<{ page: string; missing: string[]; title: string }> {
  const root = `${dirname(mdPath)}/`;
  const md = await Bun.file(mdPath).text();
  const missing: string[] = [];
  const maxW = orientation === 'landscape' ? 1600 : 1100;

  async function inlineImage(alt: string, src: string): Promise<string> {
    if (/^https?:/.test(src)) return `<figure class="image"><img src="${esc(src)}" alt="${esc(alt)}"><figcaption>${esc(alt)}</figcaption></figure>`;
    const file = Bun.file(`${root}${src}`);
    if (!(await file.exists())) {
      missing.push(src);
      return `<div class="missing">missing: ${esc(src)}</div>`;
    }
    if (src.endsWith('.svg')) {
      const raw = await file.text();
      const width = Number(raw.match(/<svg[^>]*?\swidth="([\d.]+)"/)?.[1] ?? 0);
      // The page carries the font once; drop each drawing's own copy and its fixed size.
      const svg = raw.replace(/<style>@font-face[\s\S]*?<\/style>/, '').replace(/<svg([^>]*?)\swidth="[^"]+"\sheight="[^"]+"/, '<svg$1');
      const style = width > 0 ? ` style="max-width:${Math.min(width, maxW)}px"` : '';
      return `<figure class="diagram"><div class="svg"${style}>${svg}</div><figcaption>${esc(alt)}</figcaption></figure>`;
    }
    const type = src.endsWith('.png') ? 'png' : src.endsWith('.webp') ? 'webp' : 'jpeg';
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    return `<figure class="image"><img src="data:image/${type};base64,${b64}" alt="${esc(alt)}"><figcaption>${esc(alt)}</figcaption></figure>`;
  }

  const renderer = new marked.Renderer();
  const images: { token: string; html: Promise<string> }[] = [];
  renderer.image = ({ href, text }) => {
    const token = `@@IMG${images.length}@@`;
    images.push({ token, html: inlineImage(text, href) });
    return token;
  };
  let html = await marked.parse(md, { renderer, gfm: true });
  html = html.replace(/<p>((?:@@IMG\d+@@\s*)+)<\/p>/g, '$1');
  for (const { token, html: p } of images) html = html.replace(token, await p);
  // Every H2 (a part or a chapter) starts a new page.
  html = html.replace(/<h2/g, '<h2 class="page"');

  const title = md.match(/^# (.+)$/m)?.[1] ?? basename(mdPath, '.md');
  const page = `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>${await docCss(orientation)}</style><body><main>${html}</main></body></html>`;
  return { page, missing, title };
}

/** Write `<out>/<name>.html` and, unless htmlOnly, `<out>/<name>.pdf`. */
export async function renderDoc(mdPathIn: string, opts: DocOptions = {}): Promise<DocResult> {
  const mdPath = resolve(mdPathIn);
  const name = basename(mdPath, '.md');
  const out = resolve(opts.outDir ?? `${dirname(mdPath)}/out`);
  const { page, missing, title } = await docHtml(mdPath, opts.orientation);
  const html = `${out}/${name}.html`;
  await writeFileAtomic(html, page);
  if (opts.htmlOnly) return { html, missing, title };
  const pdf = await printPdf(page, `${out}/${name}.pdf`, opts.timeoutMs ?? 120_000);
  return { html, pdf, missing, title };
}

async function docCss(orientation: 'landscape' | 'portrait'): Promise<string> {
  const land = orientation === 'landscape';
  return `
${await fontFaceCss()}
@page { size: A4 ${orientation}; margin: 13mm 15mm 14mm; }
html { font: 10.5pt/1.45 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1e1e1e; }
body { margin: 0; }
main > :not(figure):not(table) { max-width: ${land ? '205mm' : '180mm'}; }
h1 { font-family: Excalifont, sans-serif; font-weight: 400; font-size: 34pt; margin: ${land ? '30mm' : '50mm'} 0 3mm; line-height: 1.1; }
h2 { font-family: Excalifont, sans-serif; font-weight: 400; font-size: 22pt; margin: 0 0 4mm; }
h2.page { page-break-before: always; }
h3 { font-family: Excalifont, sans-serif; font-weight: 400; font-size: 15.5pt; margin: 6mm 0 2mm; page-break-after: avoid; }
h4 { font-size: 11pt; margin: 4mm 0 1.5mm; page-break-after: avoid; }
p { margin: 0 0 2.4mm; }
blockquote { margin: 0 0 3mm; padding: 2mm 3.5mm; border: 1.5px solid #1e1e1e; border-radius: 8px; background: #fff9db; box-shadow: 2px 2px 0 #ced4da; }
blockquote p { margin: 0; }
ol, ul { padding-left: 6mm; margin: 0 0 2.4mm; }
li { margin-bottom: 0.8mm; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 1mm 0 4mm; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #ced4da; padding: 1.3mm 1.8mm; text-align: left; vertical-align: top; }
th { background: #f1f3f5; }
code { font-family: Menlo, monospace; font-size: 8.6pt; background: #f1f3f5; padding: 0 0.8mm; border-radius: 3px; overflow-wrap: anywhere; }
pre { background: #f1f3f5; padding: 3mm; border-radius: 6px; font-size: 8.8pt; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
figure { margin: 2mm 0 4mm; page-break-inside: avoid; }
figure .svg { margin: 0 auto; }
figure svg { width: 100%; height: auto; max-height: ${land ? '160mm' : '230mm'}; display: block; }
figure img { max-width: 100%; display: block; margin: 0 auto; }
figcaption { font-family: Excalifont, sans-serif; font-size: 10.5pt; color: #495057; text-align: center; margin-top: 1mm; }
.missing { border: 1px dashed #e03131; color: #e03131; padding: 2mm; margin: 2mm 0; font-size: 9pt; }
hr { border: 0; border-top: 1px solid #dee2e6; margin: 4mm 0; }
@media screen {
  body { background: #e9ecef; }
  main { max-width: ${land ? '1500px' : '1100px'}; margin: 32px auto 64px; padding: 40px 56px 56px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  h1 { margin-top: 0; }
  h2.page { margin-top: 14mm; padding-top: 8mm; border-top: 1px solid #dee2e6; }
}
`;
}
