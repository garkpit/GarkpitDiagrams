// Find the scenes a command should work on: a scenes module (.ts exporting `scenes`), a folder
// holding diagrams.ts or scenes.ts, or .excalidraw files drawn by anything.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { Scene } from './scene.ts';

export interface Loaded {
  name: string;
  scene: Scene;
  /** Where it came from: the module or the .excalidraw file. */
  source: string;
  /** Folder outputs go to by default (next to the source, in images/). */
  home: string;
  /** The module's `notes[name]`, if it exports notes (shown in galleries). */
  note?: string;
}

const MODULE_NAMES = ['diagrams.ts', 'scenes.ts'];

export class LoadError extends Error {}

/** Resolve one input path to its scenes. */
export async function loadScenes(input: string): Promise<Loaded[]> {
  const path = resolve(input);
  if (!existsSync(path)) throw new LoadError(`no such file or folder: ${input}`);
  if (statSync(path).isDirectory()) {
    const mod = MODULE_NAMES.map((n) => join(path, n)).find(existsSync);
    if (mod) return loadModule(mod, path);
    const files = readdirSync(path).filter((f) => f.endsWith('.excalidraw'));
    if (files.length === 0) throw new LoadError(`${input} holds no diagrams.ts, scenes.ts or .excalidraw files`);
    return Promise.all(files.sort().map((f) => loadFile(join(path, f))));
  }
  if (path.endsWith('.excalidraw')) return [await loadFile(path)];
  if (/\.(ts|js|mjs)$/.test(path)) return loadModule(path, dirname(path));
  throw new LoadError(`${input}: expected a scenes module (.ts), a folder, or an .excalidraw file`);
}

async function loadModule(path: string, home: string): Promise<Loaded[]> {
  const mod = (await import(path)) as {
    scenes?: Record<string, Scene | (() => Scene)>;
    default?: Record<string, Scene | (() => Scene)>;
    notes?: Record<string, string>;
  };
  const scenes = mod.scenes ?? mod.default;
  if (!scenes || typeof scenes !== 'object') throw new LoadError(`${path} must export \`scenes\`: Record<string, Scene> (or a default export of the same)`);
  return Object.entries(scenes).map(([name, s]) => {
    const scene = typeof s === 'function' ? s() : s;
    if (!(scene instanceof Scene) && !Array.isArray((scene as Scene)?.elements)) throw new LoadError(`${path}: scenes.${name} is not a Scene`);
    return { name, scene, source: path, home: join(home, 'images'), note: mod.notes?.[name] };
  });
}

async function loadFile(path: string): Promise<Loaded> {
  let json: { type?: string; elements?: unknown[] };
  try {
    json = JSON.parse(await Bun.file(path).text());
  } catch (e) {
    throw new LoadError(`${path} is not valid JSON: ${(e as Error).message}`);
  }
  if (json.type !== 'excalidraw' || !Array.isArray(json.elements)) throw new LoadError(`${path} is not an Excalidraw file (type "excalidraw" with an elements array)`);
  return { name: basename(path, '.excalidraw'), scene: Scene.fromFile(json), source: path, home: dirname(path) };
}
