import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApiKeyEntity } from './apikey.entity';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/apikey.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
  ) {}

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
    const apiKey = this.apiKeyRepo.create({
      ...dto,
      key: dto.key.trim(),
      name: dto.name.trim(),
      status: dto.status ?? 'ACTIVE',
      allowedApis: dto.allowedApis ?? null,
      variableBindings: dto.variableBindings ?? {},
      requestsPerMinute: dto.requestsPerMinute ?? 60,
    });
    return this.apiKeyRepo.save(apiKey);
  }

  async update(id: string, dto: UpdateApiKeyDto) {
    const apiKey = await this.get(id);
    Object.assign(apiKey, {
      ...dto,
      key: dto.key !== undefined ? dto.key.trim() : apiKey.key,
      name: dto.name !== undefined ? dto.name.trim() : apiKey.name,
    });
    if (dto.allowedApis !== undefined) apiKey.allowedApis = dto.allowedApis ?? null;
    if (dto.variableBindings !== undefined) apiKey.variableBindings = dto.variableBindings ?? {};
    return this.apiKeyRepo.save(apiKey);
  }

  async remove(id: string) {
    const apiKey = await this.get(id);
    await this.apiKeyRepo.remove(apiKey);
    return { ok: true };
  }
}
