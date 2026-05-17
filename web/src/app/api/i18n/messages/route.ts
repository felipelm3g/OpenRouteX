import { readFile } from 'fs/promises';
import { join } from 'path';

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = String(url.searchParams.get('lang') ?? '').trim();
  if (!lang) {
    return Response.json(
      { error: 'bad_request', message: 'lang is required' },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    );
  }

  const externalDir = String(process.env.ORX_I18N_DIR ?? '/data/i18n').trim();
  const bundledDir = join(process.cwd(), 'public', 'i18n');
  const fileName = `${lang}.json`;

  const tryRead = async (baseDir: string) => {
    const raw = await readFile(join(baseDir, fileName), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k === '__meta') continue;
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  };

  try {
    if (externalDir) {
      const msg = await tryRead(externalDir);
      return Response.json(msg, { headers: { 'cache-control': 'no-store' } });
    }
  } catch {}

  try {
    const msg = await tryRead(bundledDir);
    return Response.json(msg, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json(
      { error: 'not_found', message: 'language not found' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
}
