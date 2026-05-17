import { BadRequestException, Injectable } from '@nestjs/common';

const VARIABLE_PATTERN = /\{([A-Z0-9_]+)\}/g;

@Injectable()
export class VariableResolverService {
  detectVariables(input: string): string[] {
    const found = new Set<string>();
    for (const match of input.matchAll(VARIABLE_PATTERN)) {
      const name = match[1];
      if (name) found.add(name);
    }
    return Array.from(found).sort();
  }

  detectVariablesInRecord(record: Record<string, string>): string[] {
    const found = new Set<string>();
    for (const value of Object.values(record)) {
      for (const v of this.detectVariables(value)) found.add(v);
    }
    return Array.from(found).sort();
  }

  resolveTemplate(
    template: string,
    bindings: Record<string, string>,
  ): { value: string; variablesUsed: string[] } {
    const variablesUsed = new Set<string>();
    const value = template.replace(VARIABLE_PATTERN, (full, varName: string) => {
      variablesUsed.add(varName);
      const resolved = bindings[varName];
      if (resolved === undefined) {
        throw new BadRequestException(
          `Variável ${full} não definida para esta API Key`,
        );
      }
      return resolved;
    });
    return { value, variablesUsed: Array.from(variablesUsed).sort() };
  }

  resolveRecordTemplates(
    record: Record<string, string>,
    bindings: Record<string, string>,
  ): { value: Record<string, string>; variablesUsed: string[] } {
    const out: Record<string, string> = {};
    const variablesUsed = new Set<string>();

    for (const [k, v] of Object.entries(record)) {
      const resolved = this.resolveTemplate(v, bindings);
      out[k] = resolved.value;
      for (const used of resolved.variablesUsed) variablesUsed.add(used);
    }

    return { value: out, variablesUsed: Array.from(variablesUsed).sort() };
  }
}

