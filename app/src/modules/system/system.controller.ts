import { randomUUID } from 'crypto';

import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApiKeyEntity } from '../apikeys/apikey.entity';
import { ApiEntity } from '../apis/api.entity';
import { AuthEntity } from '../auth/auth.entity';
import { EmailService } from '../email/email.service';
import { LoggingService } from '../logging/logging.service';
import { RequestLogEntity } from '../logging/request-log.entity';
import { PathEntity } from '../paths/path.entity';
import { RedisService } from '../rate-limit/redis.service';
import { SystemSettingEntity } from '../settings/settings.entity';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';

@Controller()
export class SystemController {
  constructor(
    private readonly logs: LoggingService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly settings: SettingsService,
    @InjectRepository(ApiEntity)
    private readonly apiRepo: Repository<ApiEntity>,
    @InjectRepository(PathEntity)
    private readonly pathRepo: Repository<PathEntity>,
    @InjectRepository(AuthEntity)
    private readonly authRepo: Repository<AuthEntity>,
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
    @InjectRepository(RequestLogEntity)
    private readonly logRepo: Repository<RequestLogEntity>,
    @InjectRepository(SystemSettingEntity)
    private readonly settingsRepo: Repository<SystemSettingEntity>,
  ) {}

  @Get('/health')
  health() {
    return { ok: true };
  }

  @Post('/password-reset/confirm')
  async confirmPasswordReset(@Body() body: { token?: string; password?: string }) {
    const token = String(body?.token ?? '').trim();
    const password = String(body?.password ?? '').trim();
    if (!token) throw new BadRequestException('Token obrigatório');
    if (!password) throw new BadRequestException('Senha obrigatória');

    const key = `orx:pwdreset:${token}`;
    const raw = await this.redis.client.get(key);
    if (!raw) throw new BadRequestException('Token inválido ou expirado');

    let userId = '';
    try {
      const parsed = JSON.parse(raw) as { userId?: unknown };
      userId = String(parsed?.userId ?? '').trim();
    } catch (e: any) {
      void e;
    }
    if (!userId) throw new BadRequestException('Token inválido ou expirado');

    await this.users.setPasswordById(userId, password);
    await this.redis.client.del(key);
    return { ok: true };
  }

  @Get('/admin/metrics')
  metrics(
    @Query('api') apiSlug?: string,
    @Query('path') publicPath?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const statusRaw = String(status ?? '').trim();
    const statusNum = statusRaw && /^\d+$/.test(statusRaw) ? Number(statusRaw) : null;
    const statusClass = statusNum === null && statusRaw ? statusRaw.toLowerCase() : undefined;
    return this.logs.metricsFiltered({
      apiSlug,
      publicPath,
      statusCode: statusNum === null ? undefined : statusNum,
      status: statusClass,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    });
  }

  @Get('/admin/session')
  session(@Req() req: any) {
    return { ok: true, user: req?.orxUser ?? null };
  }

  @Post('/admin/test-email')
  async testEmail(@Body() body: { to?: string }) {
    const to = String(body?.to ?? '').trim() || String(process.env.ADMIN_EMAIL ?? '').trim();
    if (!to) throw new BadRequestException('Email de destino obrigatório');
    const ok = await this.email.send({
      to,
      subject: 'OpenRouteX: teste de email',
      text: 'Este é um email de teste do OpenRouteX.',
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:560px;margin:0 auto;padding:24px;">
          <div style="font-size:18px;font-weight:700;color:#0b1020;">OpenRouteX</div>
          <div style="margin-top:12px;font-size:14px;line-height:1.6;color:#111827;">
            Este é um email de teste do OpenRouteX. Se você recebeu esta mensagem, suas configurações SMTP estão funcionando.
          </div>
          <div style="margin-top:18px;font-size:12px;color:#6b7280;">
            Enviado em ${new Date().toISOString()}
          </div>
        </div>
      `.trim(),
    });
    if (!ok.ok) throw new HttpException({ error: 'email_failed', message: 'Falha ao enviar email. Verifique SMTP em Configurações.' }, 400);
    return { ok: true };
  }

  @Post('/admin/login')
  async login(@Body() body: { username?: string; password?: string }) {
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '').trim();

    const cfg = await this.settings.getSettings();
    const keyUser = (username || 'unknown').trim().toLowerCase();
    const lockKey = `orx:login:lock:${keyUser}`;
    const failKey = `orx:login:fail:${keyUser}`;
    const maxAttempts = Math.max(1, Number(cfg.loginMaxAttempts || 3));
    const lockSeconds = Math.max(60, Number(cfg.loginLockMinutes || 180) * 60);
    const lockMinutes = Math.max(1, Math.ceil(lockSeconds / 60));

    const locked = await this.redis.client.get(lockKey);
    if (locked) {
      const ttl = await this.redis.client.ttl(lockKey);
      const minutes = ttl > 0 ? Math.ceil(ttl / 60) : lockMinutes;
      throw new HttpException(
        { error: 'locked', message: `Login bloqueado por tentativas inválidas. Tente novamente em ~${minutes} min.` },
        429,
      );
    }

    try {
      const user = await this.users.authenticate(username, password);
      await this.redis.client.del(failKey, lockKey);

      const token = randomUUID();
      const ttlSeconds = 60 * 60 * 24 * 7;
      const primary = String(process.env.ADMIN_USER ?? 'admin').trim().toLowerCase();
      const isPrimaryAdmin = String(user.username ?? '').trim().toLowerCase() === primary;
      const permissions = isPrimaryAdmin
        ? null
        : (Array.isArray((user as any).permissions) ? (user as any).permissions : []);
      await this.redis.client.set(
        `orx:sess:${token}`,
        JSON.stringify({ userId: user.id, username: user.username, permissions, isPrimaryAdmin }),
        'EX',
        ttlSeconds,
      );
      return { token };
    } catch (e: any) {
      if (e instanceof HttpException) {
        const status = Number(e.getStatus?.() ?? 500);
        const resp = e.getResponse?.() as any;
        if (status === 403 && String(resp?.error ?? '') === 'password_expired') throw e;
      }
      if (e instanceof ForbiddenException) {
        throw new UnauthorizedException('Usuário bloqueado');
      }

      const count = await this.redis.client.incr(failKey);
      if (count === 1) await this.redis.client.expire(failKey, lockSeconds);
      if (count >= maxAttempts) {
        await this.redis.client.multi().set(lockKey, '1', 'EX', lockSeconds).del(failKey).exec();
        if (cfg.loginLockEmailEnabled) {
          try {
            const u = await this.users.getEntityByUsername(username);
            const to = String(u.email ?? '').trim();
            if (to) {
              void this.email.send({
                to,
                subject: 'OpenRouteX: login bloqueado',
                text: `Seu login foi bloqueado por ${lockMinutes} min após tentativas inválidas de senha.\n\nUsuário: ${u.username}\n\nSe não foi você, altere a senha assim que possível.`,
                html: `
                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:560px;margin:0 auto;padding:24px;">
                    <div style="font-size:18px;font-weight:700;color:#0b1020;">OpenRouteX</div>
                    <div style="margin-top:12px;font-size:14px;line-height:1.6;color:#111827;">
                      Detectamos tentativas inválidas de senha e seu login foi <b>bloqueado por ${lockMinutes} min</b> para proteger sua conta.
                    </div>
                    <div style="margin-top:14px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                      <div style="font-size:12px;color:#6b7280;">Usuário</div>
                      <div style="margin-top:4px;font-size:14px;color:#111827;"><b>${u.username}</b></div>
                    </div>
                    <div style="margin-top:14px;font-size:13px;line-height:1.6;color:#111827;">
                      Se não foi você, recomendamos alterar sua senha assim que possível.
                    </div>
                    <div style="margin-top:18px;font-size:12px;color:#6b7280;">
                      Este email foi enviado automaticamente pelo OpenRouteX.
                    </div>
                  </div>
                `.trim(),
              });
            }
          } catch (err) {
            void err;
          }
        }
        throw new HttpException(
          { error: 'locked', message: `Login bloqueado por ${lockMinutes} min por tentativas inválidas.` },
          429,
        );
      }
      throw new UnauthorizedException('Credenciais inválidas');
    }
  }

  @Get('/admin/search')
  async search(@Query('q') q?: string, @Query('limit') limit?: string) {
    const query = String(q ?? '').trim();
    const perGroup = Math.min(25, Math.max(1, Number(limit ?? 8)));
    if (query.length < 2) {
      return {
        query,
        services: [],
        rotas: [],
        credenciaisUpstream: [],
        autenticacaoDoCliente: [],
        logs: [],
        configuracoes: [],
      };
    }

    const like = `%${query}%`;

    const services = await this.apiRepo
      .createQueryBuilder('a')
      .where('a.name ILIKE :like', { like })
      .orWhere('a.slug ILIKE :like', { like })
      .orWhere('a.description ILIKE :like', { like })
      .orderBy('a.updatedAt', 'DESC')
      .limit(perGroup)
      .getMany();

    const rotas = await this.pathRepo
      .createQueryBuilder('p')
      .where('p.name ILIKE :like', { like })
      .orWhere('p.publicPath ILIKE :like', { like })
      .orWhere('p.method ILIKE :like', { like })
      .orWhere('p.targetUrlTemplate ILIKE :like', { like })
      .orWhere('p.addHeaders::text ILIKE :like', { like })
      .orWhere('p.addQuery::text ILIKE :like', { like })
      .orderBy('p.updatedAt', 'DESC')
      .limit(perGroup)
      .getMany();

    const credenciaisUpstream = await this.authRepo
      .createQueryBuilder('au')
      .where('au.name ILIKE :like', { like })
      .orWhere('au.type ILIKE :like', { like })
      .orWhere('au.config::text ILIKE :like', { like })
      .orderBy('au.updatedAt', 'DESC')
      .limit(perGroup)
      .getMany();

    const autenticacaoDoCliente = await this.apiKeyRepo
      .createQueryBuilder('k')
      .where('k.name ILIKE :like', { like })
      .orWhere('k.key ILIKE :like', { like })
      .orWhere('k.allowedApis::text ILIKE :like', { like })
      .orWhere('k.variableBindings::text ILIKE :like', { like })
      .orderBy('k.updatedAt', 'DESC')
      .limit(perGroup)
      .getMany();

    const logs = await this.logRepo
      .createQueryBuilder('l')
      .where('l.apiSlug ILIKE :like', { like })
      .orWhere('l.publicPath ILIKE :like', { like })
      .orWhere('l.method ILIKE :like', { like })
      .orWhere('l.originalUrl ILIKE :like', { like })
      .orWhere('l.finalUrl ILIKE :like', { like })
      .orWhere('CAST(l.statusCode AS text) ILIKE :like', { like })
      .orderBy('l.createdAt', 'DESC')
      .limit(perGroup)
      .getMany();

    const configuracoes = await this.settingsRepo
      .createQueryBuilder('s')
      .where('s.key ILIKE :like', { like })
      .orWhere('s.value ILIKE :like', { like })
      .orderBy('s.updatedAt', 'DESC')
      .limit(perGroup)
      .getMany();

    return {
      query,
      services: services.map((a: ApiEntity) => ({ id: a.id, name: a.name, slug: a.slug, description: a.description })),
      rotas: rotas.map((p: PathEntity) => ({
        id: p.id,
        apiId: p.apiId,
        name: p.name,
        publicPath: p.publicPath,
        method: p.method,
        enabled: p.enabled,
      })),
      credenciaisUpstream: credenciaisUpstream.map((a: AuthEntity) => ({ id: a.id, name: a.name, type: a.type })),
      autenticacaoDoCliente: autenticacaoDoCliente.map((k: ApiKeyEntity) => ({
        id: k.id,
        name: k.name,
        status: k.status,
        requestsPerMinute: k.requestsPerMinute,
        allowedApis: k.allowedApis,
      })),
      logs: logs.map((l: RequestLogEntity) => ({
        id: l.id,
        apiSlug: l.apiSlug,
        publicPath: l.publicPath,
        method: l.method,
        statusCode: l.statusCode,
        createdAt: l.createdAt,
      })),
      configuracoes: configuracoes.map((s: SystemSettingEntity) => ({ id: s.id, key: s.key, value: s.value })),
    };
  }
}
