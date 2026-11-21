import { expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from './atomic.ts';

test('writeFileAtomic creates folders, replaces the file whole and leaves no temp file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-test-'));
  try {
    const file = join(dir, 'a', 'b', 'out.svg');
    await writeFileAtomic(file, 'first');
    await writeFileAtomic(file, new TextEncoder().encode('second'));
    expect(readFileSync(file, 'utf8')).toBe('second');
    expect(statSync(file).mode & 0o777).toBe(0o644);
    expect(readdirSync(join(dir, 'a', 'b'))).toEqual(['out.svg']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
