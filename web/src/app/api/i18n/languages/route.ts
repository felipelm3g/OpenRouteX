import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

type LanguageInfo = { code: string; label: string };

export async function GET() {
  const externalDir = String(process.env.ORX_I18N_DIR ?? '/data/i18n').trim();
  const bundledDir = join(process.cwd(), 'public', 'i18n');
  const externalFiles = await (async () => {
    if (!externalDir) return [] as string[];
    try {
      return await readdir(externalDir);
    } catch {
      return [] as string[];
    }
  })();
  const bundledFiles = await (async () => {
    try {
      return await readdir(bundledDir);
    } catch {
      return [] as string[];
    }
  })();
  const files = Array.from(new Set([...bundledFiles, ...externalFiles]));

  const langs: LanguageInfo[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const code = f.slice(0, -'.json'.length);
    let label = code;
    try {
      let raw = '';
      if (externalDir) {
        try {
          raw = await readFile(join(externalDir, f), 'utf8');
        } catch {
          raw = '';
        }
      }
      if (!raw) raw = await readFile(join(bundledDir, f), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const meta = (parsed as Record<string, unknown>).__meta;
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
          const l = (meta as Record<string, unknown>).label;
          if (typeof l === 'string' && l.trim()) label = l.trim();
        }
      }
    } catch {}
    langs.push({ code, label });
  }

  langs.sort((a, b) => a.code.localeCompare(b.code));
  return Response.json(langs, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
