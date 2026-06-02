import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VariableResolverService } from '../../core/variable-resolver/variable-resolver.service';
import { SettingsService } from '../settings/settings.service';

import { CreatePathDto, UpdatePathDto } from './dto/path.dto';
import { PathEntity } from './path.entity';

@Injectable()
export class PathsService {
  constructor(
    @InjectRepository(PathEntity)
    private readonly pathRepo: Repository<PathEntity>,
    private readonly settings: SettingsService,
    private readonly variables: VariableResolverService,
  ) {}

  private normalizePublicPath(input: string): string {
    const s = String(input ?? '').trim();
    if (!s) return '/';
    const withLeading = s.startsWith('/') ? s : `/${s}`;
    const noTrailing = withLeading.replace(/\/+$/, '');
    return noTrailing || '/';
  }

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private compilePublicPathTemplate(template: string): null | { regex: RegExp; names: string[]; score: number } {
    const normalized = this.normalizePublicPath(template);
    const matches = Array.from(normalized.matchAll(/\{([A-Z0-9_]+)\}/g));
    if (matches.length === 0) return null;

    const names: string[] = [];
    let pattern = '^';
    let last = 0;
    for (const m of matches) {
      const full = m[0];
      const name = m[1];
      const idx = m.index ?? 0;
      pattern += this.escapeRegex(normalized.slice(last, idx));
      pattern += '([^/]+)';
      names.push(name);
      last = idx + full.length;
    }
    pattern += this.escapeRegex(normalized.slice(last));
    pattern += '$';

    const segments = normalized.split('/').filter(Boolean);
    const staticSegments = segments.filter((s) => !s.includes('{')).length;
    const score = staticSegments * 10000 + normalized.length - names.length * 10;

    return { regex: new RegExp(pattern), names, score };
  }

  private safeDecodeURIComponent(input: string): string {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  }

  async findBestMatchByApiAndRequestPath(
    apiId: string,
    requestPublicPath: string,
    method: string,
  ): Promise<null | { path: PathEntity; bindings: Record<string, string> }> {
    const requestPath = this.normalizePublicPath(requestPublicPath);
    const candidates = await this.pathRepo.find({
      where: { apiId, method: method as any, enabled: true },
      order: { createdAt: 'DESC' },
    });

    let best: null | { path: PathEntity; bindings: Record<string, string>; score: number } = null;
    for (const p of candidates) {
      const compiled = this.compilePublicPathTemplate(p.publicPath);
      if (!compiled) continue;

      const m = compiled.regex.exec(requestPath);
      if (!m) continue;

      const bindings: Record<string, string> = {};
      for (let i = 0; i < compiled.names.length; i++) {
        const name = compiled.names[i];
        const value = m[i + 1] ?? '';
        bindings[name] = this.safeDecodeURIComponent(String(value));
      }

      if (!best || compiled.score > best.score) {
        best = { path: p, bindings, score: compiled.score };
      }
    }

    if (!best) return null;
    return { path: best.path, bindings: best.bindings };
  }

  private assertNoVariablesWhenPublic(params: {
    requireClientAuth: boolean;
    targetUrlTemplate: string;
    addHeaders: Record<string, string>;
    addQuery: Record<string, string>;
  }) {
    if (params.requireClientAuth) return;
    const used = new Set<string>();
    for (const v of this.variables.detectVariables(params.targetUrlTemplate)) used.add(v);
    for (const v of this.variables.detectVariablesInRecord(params.addHeaders)) used.add(v);
    for (const v of this.variables.detectVariablesInRecord(params.addQuery)) used.add(v);
    if (used.size === 0) return;
    throw new BadRequestException(
      `Rotas sem API-KEY não podem usar variáveis. Remova: ${Array.from(used).sort().join(', ')}`,
    );
  }

  async list(params?: { apiId?: string }) {
    const where: { apiId?: string } = {};
    if (params?.apiId) where.apiId = params.apiId;
    return this.pathRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async get(id: string) {
    const path = await this.pathRepo.findOne({ where: { id } });
    if (!path) throw new NotFoundException('Path não encontrado');
    return path;
  }

  async findByApiAndPublicPath(apiId: string, publicPath: string, method: string) {
    return this.pathRepo.findOne({
      where: { apiId, publicPath, method: method as any, enabled: true },
    });
  }

  async create(dto: CreatePathDto) {
    const cfg = await this.settings.getSettings();
    const addHeaders = dto.addHeaders ?? {};
    const addQuery = dto.addQuery ?? {};
    const requireClientAuth = dto.requireClientAuth ?? true;
    this.assertNoVariablesWhenPublic({
      requireClientAuth,
      targetUrlTemplate: dto.targetUrlTemplate,
      addHeaders,
      addQuery,
    });
    const path = this.pathRepo.create({
      ...dto,
      enabled: dto.enabled ?? true,
      requireClientAuth,
      addHeaders,
      addQuery,
      forwardClientQuery: dto.forwardClientQuery ?? cfg.defaultForwardClientQuery,
    });
    try {
      return await this.pathRepo.save(path);
    } catch (e: any) {
      if (String(e?.code ?? '') === '23505') {
        throw new BadRequestException(
          'Já existe uma rota com este Path e Method para este Serviço. Ajuste o Path/Method para salvar.',
        );
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePathDto) {
    const path = await this.get(id);
    Object.assign(path, dto);
    if (dto.addHeaders) path.addHeaders = dto.addHeaders;
    if (dto.addQuery) path.addQuery = dto.addQuery;
    const requireClientAuth = path.requireClientAuth ?? true;
    this.assertNoVariablesWhenPublic({
      requireClientAuth,
      targetUrlTemplate: path.targetUrlTemplate,
      addHeaders: path.addHeaders ?? {},
      addQuery: path.addQuery ?? {},
    });
    try {
      return await this.pathRepo.save(path);
    } catch (e: any) {
      if (String(e?.code ?? '') === '23505') {
        throw new BadRequestException(
          'Já existe uma rota com este Path e Method para este Serviço. Ajuste o Path/Method para salvar.',
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    const path = await this.get(id);
    await this.pathRepo.remove(path);
    return { ok: true };
  }
}
