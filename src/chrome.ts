// Headless Chrome for PNG previews and PDFs. CHROME_BIN overrides the macOS default.
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileAtomic } from './atomic.ts';

export const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function chromePath(): string {
  const p = process.env.CHROME_BIN || DEFAULT_CHROME;
  if (!existsSync(p)) throw new Error(`Chrome not found at ${p}. Install Google Chrome or set CHROME_BIN to a Chrome/Chromium binary.`);
  return p;
}

/** Screenshot a file (SVG or HTML) to a PNG at the given CSS-pixel size. */
export async function screenshot(file: string, png: string, w: number, h: number, scale = 1, timeoutMs = 30_000): Promise<void> {
  const profile = await mkdtemp(join(tmpdir(), 'garkpit-diagrams-'));
  try {
    const proc = Bun.spawn(
      [
        chromePath(),
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        `--force-device-scale-factor=${scale}`,
        `--window-size=${w},${h}`,
        `--screenshot=${png}`,
        pathToFileURL(file).href
      ],
      { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' }
    );
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    const code = await proc.exited;
    clearTimeout(timer);
    if (code !== 0 || !existsSync(png)) {
      const err = (await new Response(proc.stderr).text()).trim().split('\n').slice(-2).join(' | ');
      throw new Error(`Chrome could not screenshot ${file} (exit ${code ?? 'killed'})${err ? `: ${err}` : ''}`);
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

export interface PdfResult {
  path: string;
  bytes: number;
  wallTimeMs: number;
}

/** Print an HTML page to a PDF with headless Chrome (page size and margins come from the page's @page CSS). */
export async function printPdf(html: string, pdf: string, timeoutMs = 120_000): Promise<PdfResult> {
  const t0 = Date.now();
  const work = await mkdtemp(join(tmpdir(), 'garkpit-diagrams-pdf-'));
  try {
    const page = join(work, 'page.html');
    const tmpPdf = join(work, 'page.pdf');
    await Bun.write(page, html);
    const proc = Bun.spawn(
      [
        chromePath(),
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${join(work, 'profile')}`,
        '--no-pdf-header-footer',
        `--print-to-pdf=${tmpPdf}`,
        pathToFileURL(page).href
      ],
      { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' }
    );
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    const code = await proc.exited;
    clearTimeout(timer);
    if (code !== 0 || !existsSync(tmpPdf)) {
      const err = (await new Response(proc.stderr).text()).trim().split('\n').slice(-2).join(' | ');
      throw new Error(`Chrome could not print ${pdf} (exit ${code ?? `killed after ${timeoutMs} ms`})${err ? `: ${err}` : ''}`);
    }
    const bytes = new Uint8Array(await Bun.file(tmpPdf).arrayBuffer());
    if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error(`Chrome wrote something that is not a PDF for ${pdf}`);
    await writeFileAtomic(pdf, bytes);
    return { path: pdf, bytes: bytes.length, wallTimeMs: Date.now() - t0 };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
