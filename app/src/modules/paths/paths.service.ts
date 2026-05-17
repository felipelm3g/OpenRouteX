import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SettingsService } from '../settings/settings.service';

import { CreatePathDto, UpdatePathDto } from './dto/path.dto';
import { PathEntity } from './path.entity';

@Injectable()
export class PathsService {
  constructor(
    @InjectRepository(PathEntity)
    private readonly pathRepo: Repository<PathEntity>,
    private readonly settings: SettingsService,
  ) {}

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
    const path = this.pathRepo.create({
      ...dto,
      enabled: dto.enabled ?? true,
      addHeaders: dto.addHeaders ?? {},
      addQuery: dto.addQuery ?? {},
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
