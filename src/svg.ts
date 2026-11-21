// Scenes to standalone SVG, headlessly: Excalidraw's own exportToSvg under happy-dom, with canvas
// text measurement answered by the real Excalifont metrics and the font embedded in the result.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { fontFaceCss, measure } from './font.ts';
import type { Scene } from './scene.ts';

type Any = Record<string, unknown>;
type ExportToSvg = (a: Any) => Promise<SVGElement>;

let ready: Promise<{ exportToSvg: ExportToSvg }> | null = null;

function bootDom() {
  GlobalRegistrator.register({ url: 'http://127.0.0.1/' });
  const g = globalThis as Any;
  class FontFaceShim {
    family: string;
    constructor(f: string) {
      this.family = f;
    }
    load() {
      return Promise.resolve(this);
    }
  }
  for (const [k, v] of [
    ['top', g.window],
    ['devicePixelRatio', 1],
    ['FontFace', FontFaceShim]
  ] as [string, unknown][]) {
    try {
      g[k] = v;
    } catch {
      Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
    }
  }
  const doc = g.document as Any;
  if (!doc.fonts) doc.fonts = { add() {}, load: async () => [], check: () => true, ready: Promise.resolve() };
  const proto = (g.HTMLCanvasElement as { prototype: Any }).prototype;
  const orig = proto.getContext as (t: string) => unknown;
  const noop = () => {};
  proto.getContext = function (this: unknown, t: string) {
    const c = orig?.call(this, t);
    if (c) return c;
    let font = '16px x';
    return {
      get font() {
        return font;
      },
      set font(f: string) {
        font = f;
      },
      measureText: (str: string) => {
        const px = parseFloat(font) || 16;
        return { width: measure(str, px), actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
      },
      ...Object.fromEntries(
        ['save', 'restore', 'scale', 'translate', 'fillRect', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'drawImage', 'setTransform', 'putImageData'].map(
          (k) => [k, noop]
        )
      ),
      getImageData: () => ({ data: [] }),
      createPattern: () => null,
      canvas: this
    };
  };
}

export interface SvgOptions {
  /** Padding round the drawing in px. Default 24. */
  padding?: number;
  /** Embed the Excalifont @font-face (default true). Pages that carry the font once can turn it off. */
  embedFont?: boolean;
}

/** Render a scene to a standalone SVG string with the font embedded. */
export async function renderSvg(scene: Scene, opts: SvgOptions = {}): Promise<string> {
  if (!ready) {
    bootDom();
    ready = import('@excalidraw/excalidraw') as unknown as Promise<{ exportToSvg: ExportToSvg }>;
  }
  const { exportToSvg } = await ready;
  const svg = await exportToSvg({
    elements: scene.elements,
    appState: { exportWithDarkMode: false, exportBackground: true, viewBackgroundColor: '#ffffff', exportEmbedScene: false },
    files: null,
    exportPadding: opts.padding ?? 24,
    skipInliningFonts: true
  });
  const raw = new XMLSerializer().serializeToString(svg as unknown as Node);
  if (opts.embedFont === false) return raw;
  return raw.replace(/(<svg[^>]*>)/, `$1<style>${await fontFaceCss()}</style>`);
}

/** The width and height an SVG string declares. */
export function svgSize(svg: string): { w: number; h: number } {
  return {
    w: Math.ceil(Number(svg.match(/<svg[^>]*?\swidth="([\d.]+)"/)?.[1] ?? 0)),
    h: Math.ceil(Number(svg.match(/<svg[^>]*?\sheight="([\d.]+)"/)?.[1] ?? 0))
  };
}
