// Write a file so a reader never sees half of it: write a temp file beside it, then rename over.
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export async function writeFileAtomic(path: string, data: string | Uint8Array, mode = 0o644): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${Date.now().toString(36)}.tmp`);
  try {
    await writeFile(tmp, data, { mode, flag: 'wx' });
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
