import type { APIRoute } from 'astro';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

const SCREENSHOTS_DIR = join(homedir(), 'syntra/docs/design/screenshots');

export const GET: APIRoute = async () => {
  const latest = await latestManifest();
  if (!latest) {
    return Response.json({ run: null, timestamp: null, screenshots: [] }, {
      headers: { 'cache-control': 'no-store' },
    });
  }

  return Response.json(latest, {
    headers: { 'cache-control': 'no-store' },
  });
};

async function latestManifest() {
  const entries = await readdir(SCREENSHOTS_DIR, { withFileTypes: true }).catch(() => []);
  const runs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  for (const run of runs) {
    try {
      const manifest = JSON.parse(await readFile(join(SCREENSHOTS_DIR, run, 'manifest.json'), 'utf8'));
      return {
        ...manifest,
        screenshots: Array.isArray(manifest.screenshots)
          ? manifest.screenshots.map((item: { key: string; url: string; file: string }) => ({
              ...item,
              imageUrl: `/api/design-image/${encodeURIComponent(run)}/${encodeURIComponent(item.file)}`,
            }))
          : [],
      };
    } catch {
      // Try the next newest run.
    }
  }

  return null;
}
