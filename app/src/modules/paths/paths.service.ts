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
