// Excalifont metrics. Text is measured with the real glyph advances (fontkit), never a guessed
// average character width, so a label that fits here fits in excalidraw.com, the SVG and the PDF.
import * as fontkit from 'fontkit';

export const FONT_EXCALIFONT = 5;
export const LINE_HEIGHT = 1.25;

const FONT_DIR = (() => {
  const entry = Bun.resolveSync('@excalidraw/excalidraw', import.meta.dir);
  return entry.replace(/index\.js$/, 'fonts/Excalifont/');
})();

/** Excalifont ships as unicode-range subsets; these two cover Latin, Latin-1 and Latin Extended-A. */
const SUBSETS: Array<[string, string]> = [
  ['a88b72a24fb54c9f94e3b5fdaa7481c9', 'U+20-7e,U+a0-ff,U+2013-2014,U+2018-201e,U+2022,U+2026,U+20ac,U+2212'],
  ['be310b9bcd4f1a43f571c46df7809174', 'U+100-17e']
];

interface Font {
  unitsPerEm: number;
  layout(s: string): { advanceWidth: number };
}

const subsetPath = (hash: string) => `${FONT_DIR}Excalifont-Regular-${hash}.woff2`;

async function loadFont(hash: string): Promise<Font> {
  const file = Bun.file(subsetPath(hash));
  if (!(await file.exists())) {
    throw new Error(`Excalifont subset missing at ${subsetPath(hash)}. The @excalidraw/excalidraw font layout changed; update SUBSETS in src/font.ts.`);
  }
  return fontkit.create(Buffer.from(await file.arrayBuffer())) as unknown as Font;
}

const mainFont = await loadFont(SUBSETS[0]![0]);

/** Width in px of one line of Excalifont text at `size` px. */
export function measure(text: string, size: number): number {
  return (mainFont.layout(text).advanceWidth / mainFont.unitsPerEm) * size;
}

/** Word-wrap to lines no wider than `maxPx`. A single word wider than that keeps its own line (the fit check reports it). */
export function wrapPx(text: string, maxPx: number, size: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, size) > maxPx) {
        out.push(line);
        line = word;
      } else line = candidate;
    }
    out.push(line);
  }
  return out;
}

export const textHeight = (lines: number, size: number) => lines * size * LINE_HEIGHT;

/** Width of the widest line of already-wrapped text. */
export const blockWidth = (text: string, size: number) => Math.max(0, ...text.split('\n').map((l) => measure(l, size)));

let fontCss: string | null = null;

/** The @font-face rules for Excalifont, as base64 data URIs. */
export async function fontFaceCss(): Promise<string> {
  if (fontCss) return fontCss;
  const rules: string[] = [];
  for (const [hash, range] of SUBSETS) {
    const b64 = Buffer.from(await Bun.file(subsetPath(hash)).arrayBuffer()).toString('base64');
    rules.push(`@font-face{font-family:Excalifont;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range}}`);
  }
  fontCss = rules.join('\n');
  return fontCss;
}
