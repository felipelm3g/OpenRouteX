import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RedisService } from '../rate-limit/redis.service';
import { SettingsService } from '../settings/settings.service';

import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UserEntity, UserStatus } from './user.entity';

const PERMISSIONS = [
  'dashboard',
  'authentication',
  'apis',
  'paths',
  'apikeys',
  'certificates',
  'users',
  'settings',
] as const;

type PermissionKey = (typeof PERMISSIONS)[number];

function normalizeUsername(v: string) {
  return v.trim().toLowerCase();
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 3) return false;
  const algo = parts[0];
  if (algo !== 'scrypt') return false;
  const salt = Buffer.from(parts[1] ?? '', 'base64');
  const expected = Buffer.from(parts[2] ?? '', 'base64');
  if (!salt.length || !expected.length) return false;
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function passwordMeetsPolicy(
  password: string,
  cfg: {
    passwordMinLength: number;
    passwordRequireUppercase: boolean;
    passwordRequireLowercase: boolean;
    passwordRequireNumber: boolean;
    passwordRequireSymbol: boolean;
  },
) {
  const p = String(password ?? '');
  if (p.trim().length < cfg.passwordMinLength) return { ok: false, message: `Senha deve ter no mínimo ${cfg.passwordMinLength} caracteres.` };
  if (cfg.passwordRequireUppercase && !/[A-Z]/.test(p)) return { ok: false, message: 'Senha deve conter ao menos 1 letra maiúscula.' };
  if (cfg.passwordRequireLowercase && !/[a-z]/.test(p)) return { ok: false, message: 'Senha deve conter ao menos 1 letra minúscula.' };
  if (cfg.passwordRequireNumber && !/[0-9]/.test(p)) return { ok: false, message: 'Senha deve conter ao menos 1 número.' };
  if (cfg.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(p)) return { ok: false, message: 'Senha deve conter ao menos 1 símbolo.' };
  return { ok: true, message: '' };
}

function sanitizePermissions(input: unknown): PermissionKey[] {
  if (!Array.isArray(input)) return [...PERMISSIONS];
  const list = input
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .filter((v) => (PERMISSIONS as readonly string[]).includes(v));
  return Array.from(new Set(list)) as PermissionKey[];
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  private primaryAdminUsername() {
    return normalizeUsername(process.env.ADMIN_USER ?? 'admin');
  }

  private isPrimaryAdmin(u: { username: string }) {
    return normalizeUsername(u.username) === this.primaryAdminUsername();
  }

  private lockKey(username: string) {
    return `orx:login:lock:${normalizeUsername(username)}`;
  }

  private failKey(username: string) {
    return `orx:login:fail:${normalizeUsername(username)}`;
  }

  async onModuleInit() {
    const total = await this.repo.count();
    if (total > 0) return;

    const allowInsecureDefaults = String(process.env.ORX_ALLOW_INSECURE_DEFAULTS ?? '').trim().toLowerCase() === 'true';

    const username = normalizeUsername(process.env.ADMIN_USER ?? 'admin');
    const email = normalizeEmail(process.env.ADMIN_EMAIL ?? 'admin@example.com');
    const password = String(process.env.ADMIN_PASSWORD ?? 'admin123');
    if (!username || !email || !password) return;

    const weakDefaults = new Set(['admin123', 'admin', 'password', 'changeme', 'change_me', '123456', '12345678']);
    if (!allowInsecureDefaults && weakDefaults.has(password.trim().toLowerCase())) {
      throw new ServiceUnavailableException(
        'ADMIN_PASSWORD inseguro. Defina uma senha forte (ex.: via docker-compose.yml) ou defina ORX_ALLOW_INSECURE_DEFAULTS=true para desenvolvimento.',
      );
    }

    const cfg = await this.settings.getSettings();
    const policy = passwordMeetsPolicy(password, cfg);
    if (!policy.ok) return;

    const row = this.repo.create({
      username,
      email,
      passwordHash: hashPassword(password),
      passwordUpdatedAt: new Date(),
      status: 'ACTIVE',
      permissions: [...PERMISSIONS],
    });
    await this.repo.save(row);
  }

  private toPublic(u: UserEntity) {
    const isPrimaryAdmin = this.isPrimaryAdmin(u);
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      status: u.status,
      permissions: isPrimaryAdmin ? [...PERMISSIONS] : sanitizePermissions(u.permissions),
      isPrimaryAdmin,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async list() {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map((u: UserEntity) => this.toPublic(u));
  }

  async get(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    return this.toPublic(u);
  }

  async getEntity(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    return u;
  }

  async getEntityByUsername(username: string) {
    const u = await this.repo.findOne({ where: { username: normalizeUsername(username) } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    return u;
  }

  async findEntityByEmail(email: string) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const u = await this.repo.findOne({ where: { email: normalized } });
    return u ?? null;
  }

  async authenticate(username: string, password: string) {
    const u = await this.repo.findOne({ where: { username: normalizeUsername(username) } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    if (u.status !== 'ACTIVE') throw new ForbiddenException('Usuário bloqueado');
    const ok = verifyPassword(password, u.passwordHash);
    if (!ok) throw new BadRequestException('Senha inválida');
    const cfg = await this.settings.getSettings();
    if (cfg.passwordMaxAgeDays > 0 && u.passwordUpdatedAt) {
      const ageMs = cfg.passwordMaxAgeDays * 24 * 60 * 60 * 1000;
      if (Date.now() - new Date(u.passwordUpdatedAt).getTime() > ageMs) {
        throw new HttpException({ error: 'password_expired', message: 'Senha expirada. Redefina sua senha.' }, 403);
      }
    }
    return u;
  }

  async create(dto: CreateUserDto) {
    const username = normalizeUsername(dto.username);
    const email = normalizeEmail(dto.email);
    if (!username) throw new BadRequestException('username obrigatório');
    if (!email) throw new BadRequestException('email obrigatório');
    const cfg = await this.settings.getSettings();
    const policy = passwordMeetsPolicy(dto.password, cfg);
    if (!policy.ok) throw new BadRequestException(policy.message);
    const row = this.repo.create({
      username,
      email,
      passwordHash: hashPassword(dto.password),
      passwordUpdatedAt: new Date(),
      status: dto.status ?? 'ACTIVE',
      permissions: sanitizePermissions(dto.permissions),
    });
    const saved = await this.repo.save(row);
    return this.toPublic(saved);
  }

  async update(id: string, dto: UpdateUserDto) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    const isPrimaryAdmin = this.isPrimaryAdmin(u);
    if (dto.username !== undefined) u.username = normalizeUsername(dto.username);
    if (dto.email !== undefined) u.email = normalizeEmail(dto.email);
    if (dto.password !== undefined) {
      const cfg = await this.settings.getSettings();
      const policy = passwordMeetsPolicy(dto.password, cfg);
      if (!policy.ok) throw new BadRequestException(policy.message);
      u.passwordHash = hashPassword(dto.password);
      u.passwordUpdatedAt = new Date();
    }
    if (!isPrimaryAdmin && dto.status !== undefined) u.status = dto.status;
    if (!isPrimaryAdmin && dto.permissions !== undefined) u.permissions = sanitizePermissions(dto.permissions);
    const saved = await this.repo.save(u);
    return this.toPublic(saved);
  }

  async remove(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    if (this.isPrimaryAdmin(u)) throw new BadRequestException('O admin principal não pode ser removido.');
    await this.repo.remove(u);
    await this.clearLoginLock(u.username);
    return { ok: true };
  }

  async setStatus(id: string, status: UserStatus) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    if (this.isPrimaryAdmin(u)) throw new BadRequestException('O admin principal não pode ser bloqueado.');
    u.status = status;
    const saved = await this.repo.save(u);
    return this.toPublic(saved);
  }

  async clearLoginLock(username: string) {
    await this.redis.client.del(this.lockKey(username), this.failKey(username));
    return { ok: true };
  }

  async setPasswordById(id: string, password: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    const cfg = await this.settings.getSettings();
    const policy = passwordMeetsPolicy(password, cfg);
    if (!policy.ok) throw new BadRequestException(policy.message);
    u.passwordHash = hashPassword(password);
    u.passwordUpdatedAt = new Date();
    const saved = await this.repo.save(u);
    return this.toPublic(saved);
  }
}
