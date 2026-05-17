import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PathEntity } from '../paths/path.entity';

import { ApiEntity } from './api.entity';
import { CreateApiDto, UpdateApiDto } from './dto/api.dto';

function normalizeSlug(input: string) {
  return input.trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

@Injectable()
export class ApisService {
  constructor(
    @InjectRepository(ApiEntity)
    private readonly apiRepo: Repository<ApiEntity>,
    @InjectRepository(PathEntity)
    private readonly pathRepo: Repository<PathEntity>,
  ) {}

  async list() {
    return this.apiRepo.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string) {
    const api = await this.apiRepo.findOne({ where: { id } });
    if (!api) throw new NotFoundException('API não encontrada');
    return api;
  }

  async getBySlug(slug: string) {
    const normalized = normalizeSlug(slug);
    const api = await this.apiRepo.findOne({ where: { slug: normalized } });
    if (!api) throw new NotFoundException(`API não encontrada: ${normalized}`);
    return api;
  }

  async create(dto: CreateApiDto) {
    const api = this.apiRepo.create({
      ...dto,
      slug: normalizeSlug(dto.slug),
      certificateId: dto.certificateId ?? null,
    });
    try {
      return await this.apiRepo.save(api);
    } catch (e: any) {
      if (String(e?.code ?? '') === '23505') {
        throw new BadRequestException('Slug já existe. Use um slug diferente para salvar o serviço.');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateApiDto) {
    const api = await this.get(id);
    Object.assign(api, dto);
    if (dto.slug !== undefined) api.slug = normalizeSlug(dto.slug);
    if (dto.certificateId !== undefined) api.certificateId = dto.certificateId ?? null;
    try {
      return await this.apiRepo.save(api);
    } catch (e: any) {
      if (String(e?.code ?? '') === '23505') {
        throw new BadRequestException('Slug já existe. Use um slug diferente para salvar o serviço.');
      }
      throw e;
    }
  }

  async remove(id: string) {
    const api = await this.get(id);
    const deletedPaths = await this.pathRepo.delete({ apiId: api.id });
    await this.apiRepo.remove(api);
    return { ok: true, deletedPaths: deletedPaths.affected ?? 0 };
  }
}
