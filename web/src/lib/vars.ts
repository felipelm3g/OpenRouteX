export function detectVariables(input: string): string[] {
  const re = /\{([A-Z0-9_]+)\}/g;
  const out = new Set<string>();
  for (const m of input.matchAll(re)) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out).sort();
}

export function detectVariablesInRecord(record: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const v of Object.values(record)) {
    for (const name of detectVariables(v)) out.add(name);
  }
  return Array.from(out).sort();
}

