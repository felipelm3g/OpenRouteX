import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthEntity } from './auth.entity';
import { CreateAuthDto, UpdateAuthDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthEntity)
    private readonly authRepo: Repository<AuthEntity>,
  ) {}

  async list() {
    return this.authRepo.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string) {
    const auth = await this.authRepo.findOne({ where: { id } });
    if (!auth) throw new NotFoundException('Auth não encontrada');
    return auth;
  }

  async create(dto: CreateAuthDto) {
    const auth = this.authRepo.create(dto);
    return this.authRepo.save(auth);
  }

  async update(id: string, dto: UpdateAuthDto) {
    const auth = await this.get(id);
    Object.assign(auth, dto);
    return this.authRepo.save(auth);
  }

  async remove(id: string) {
    const auth = await this.get(id);
    await this.authRepo.remove(auth);
    return { ok: true };
  }
}

