import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApisService } from '../apis/apis.service';
import { PathEntity } from '../paths/path.entity';

import { ApiKeyEntity } from './apikey.entity';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/apikey.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
    @InjectRepository(PathEntity)
    private readonly pathRepo: Repository<PathEntity>,
    private readonly apis: ApisService,
  ) {}

  private normalizeVarName(raw: string): string {
    return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }

  private detectPathVariables(template: string): string[] {
    const normalized = String(template ?? '').trim();
    const matches = Array.from(normalized.matchAll(/\{([^}]+)\}/g));
    const out = new Set<string>();
    for (const m of matches) out.add(this.normalizeVarName(m[1] ?? ''));
    return Array.from(out).filter(Boolean).sort();
  }

  private intersect(a: Set<string>, b: string[]): string[] {
    const out: string[] = [];
    for (const v of b) if (a.has(v)) out.push(v);
    return out;
  }

  private async validateBindingsDontCollideWithApiTemplates(params: {
    allowedApiSlugs: string[];
    variableBindings: Record<string, string>;
  }) {
    const bindingVars = new Set(
      Object.keys(params.variableBindings ?? {})
        .map((k) => this.normalizeVarName(k))
        .filter(Boolean),
    );
    if (bindingVars.size === 0) return;

    const collisions = new Set<string>();
    for (const slug of params.allowedApiSlugs) {
      const api = await this.apis.getBySlug(slug);

      const serviceVars = Object.keys((api as any).variableBindings ?? {}).map((k) => this.normalizeVarName(k));
      for (const v of this.intersect(bindingVars, serviceVars)) collisions.add(v);

      const paths = await this.pathRepo.find({ where: { apiId: api.id } });
      for (const p of paths) {
        for (const v of this.intersect(bindingVars, this.detectPathVariables(p.publicPath))) collisions.add(v);
      }
    }

    if (collisions.size) {
      const list = Array.from(collisions).sort().join(', ');
      throw new BadRequestException(
        `Variáveis da API Key conflitam com variáveis do Serviço/Rotas: ${list}. Renomeie para ficar único.`,
      );
    }
  }

  async hasAny() {
    const total = await this.apiKeyRepo.count();
    return total > 0;
  }

  async list() {
    return this.apiKeyRepo.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string) {
    const apiKey = await this.apiKeyRepo.findOne({ where: { id } });
    if (!apiKey) throw new NotFoundException('API Key não encontrada');
    return apiKey;
  }

  async getByKey(key: string) {
    const normalized = String(key ?? '').trim();
    const apiKey = await this.apiKeyRepo.findOne({ where: { key: normalized } });
    if (!apiKey) throw new NotFoundException('API Key inválida');
    if (apiKey.status !== 'ACTIVE') throw new ForbiddenException('API Key desativada');
    return apiKey;
  }

  async create(dto: CreateApiKeyDto) {
    const allowedApis = (dto.allowedApis ?? [])
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    const uniqueAllowedApis = Array.from(new Set(allowedApis));
    if (uniqueAllowedApis.length === 0) {
      throw new BadRequestException('Selecione ao menos 1 API permitida para esta API Key.');
    }
    await this.validateBindingsDontCollideWithApiTemplates({
      allowedApiSlugs: uniqueAllowedApis,
      variableBindings: dto.variableBindings ?? {},
    });
    const apiKey = this.apiKeyRepo.create({
      ...dto,
      key: dto.key.trim(),
      name: dto.name.trim(),
      status: dto.status ?? 'ACTIVE',
      allowedApis: uniqueAllowedApis,
      variableBindings: dto.variableBindings ?? {},
      requestsPerMinute: dto.requestsPerMinute ?? 60,
    });
    return this.apiKeyRepo.save(apiKey);
  }

  async update(id: string, dto: UpdateApiKeyDto) {
    const apiKey = await this.get(id);
    const nextAllowedApis =
      dto.allowedApis !== undefined
        ? Array.from(new Set((dto.allowedApis ?? []).map((s) => String(s ?? '').trim()).filter(Boolean)))
        : (apiKey.allowedApis ?? []);
    if (!nextAllowedApis.length) {
      throw new BadRequestException('Selecione ao menos 1 API permitida para esta API Key.');
    }
    const nextBindings =
      dto.variableBindings !== undefined ? (dto.variableBindings ?? {}) : (apiKey.variableBindings ?? {});
    await this.validateBindingsDontCollideWithApiTemplates({
      allowedApiSlugs: nextAllowedApis,
      variableBindings: nextBindings,
    });
    apiKey.allowedApis = nextAllowedApis;
    Object.assign(apiKey, {
      ...dto,
      key: dto.key !== undefined ? dto.key.trim() : apiKey.key,
      name: dto.name !== undefined ? dto.name.trim() : apiKey.name,
    });
    if (dto.variableBindings !== undefined) apiKey.variableBindings = dto.variableBindings ?? {};
    return this.apiKeyRepo.save(apiKey);
  }

  async remove(id: string) {
    const apiKey = await this.get(id);
    await this.apiKeyRepo.remove(apiKey);
    return { ok: true };
  }
}
