import { randomUUID } from 'crypto';

import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { EmailService } from '../email/email.service';
import { RedisService } from '../rate-limit/redis.service';

import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('/admin/users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const created = await this.users.create(dto);

    const shouldSend = Boolean(dto.sendWelcomeEmail);
    if (!shouldSend) return created;

    const token = randomUUID();
    const ttlSeconds = 60 * 60 * 24;
    await this.redis.client.set(
      `orx:pwdreset:${token}`,
      JSON.stringify({ userId: created.id }),
      'EX',
      ttlSeconds,
    );

    const host = String(process.env.HOST ?? '').trim() || 'localhost';
    const portal = String(process.env.URL_PORTAL ?? '').trim();
    const portalBase =
      portal && portal.toLowerCase() !== 'localhost'
        ? portal.replace(/\/+$/, '')
        : `http://${host}:3100`;
    const resetUrl = `${portalBase}/reset-password?token=${encodeURIComponent(token)}`;

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:640px;margin:0 auto;padding:24px;">
        <div style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;background:#ffffff;">
          <div style="padding:18px 20px;background:#0b1020;color:#ffffff;">
            <div style="font-size:14px;opacity:.9;">OpenRouteX</div>
            <div style="margin-top:6px;font-size:18px;font-weight:700;">Sua conta foi criada</div>
          </div>
          <div style="padding:20px;color:#111827;font-size:14px;line-height:1.6;">
            <p style="margin:0 0 12px 0;">
              Uma conta foi criada para você no portal do OpenRouteX.
            </p>
            <p style="margin:0 0 12px 0;">
              O administrador irá informar suas credenciais de acesso. Caso você não receba, você pode redefinir sua senha pelo link abaixo.
            </p>
            <div style="margin:18px 0;">
              <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:12px;font-weight:600;">
                Redefinir minha senha
              </a>
            </div>
            <div style="margin-top:12px;font-size:12px;color:#6b7280;">
              Este link expira em 24 horas.
            </div>
          </div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;">
          Se você não esperava este email, ignore esta mensagem.
        </div>
      </div>
    `.trim();

    const sent = await this.email.send({
      to: created.email,
      subject: 'OpenRouteX: sua conta foi criada',
      text:
        `Uma conta foi criada para você no OpenRouteX.\n\n` +
        `O administrador irá informar suas credenciais. Caso você não receba, redefina sua senha:\n${resetUrl}\n\n` +
        `Este link expira em 24 horas.`,
      html,
    });

    return { ...created, welcomeEmailSent: sent.ok };
  }

  @Post(':id/send-reset-email')
  async sendResetEmail(@Param('id') id: string) {
    const u = await this.users.getEntity(id);
    const to = String(u.email ?? '').trim();
    if (!to) throw new BadRequestException('Email do usuário não configurado');

    const token = randomUUID();
    const ttlSeconds = 60 * 60 * 24;
    await this.redis.client.set(
      `orx:pwdreset:${token}`,
      JSON.stringify({ userId: u.id }),
      'EX',
      ttlSeconds,
    );

    const host = String(process.env.HOST ?? '').trim() || 'localhost';
    const portal = String(process.env.URL_PORTAL ?? '').trim();
    const portalBase =
      portal && portal.toLowerCase() !== 'localhost'
        ? portal.replace(/\/+$/, '')
        : `http://${host}:3100`;
    const resetUrl = `${portalBase}/reset-password?token=${encodeURIComponent(token)}`;

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:640px;margin:0 auto;padding:24px;">
        <div style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;background:#ffffff;">
          <div style="padding:18px 20px;background:#0b1020;color:#ffffff;">
            <div style="font-size:14px;opacity:.9;">OpenRouteX</div>
            <div style="margin-top:6px;font-size:18px;font-weight:700;">Redefinição de senha</div>
          </div>
          <div style="padding:20px;color:#111827;font-size:14px;line-height:1.6;">
            <p style="margin:0 0 12px 0;">
              Você recebeu este email porque o administrador solicitou uma redefinição de senha para sua conta.
            </p>
            <div style="margin:18px 0;">
              <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:12px;font-weight:600;">
                Redefinir minha senha
              </a>
            </div>
            <div style="margin-top:12px;font-size:12px;color:#6b7280;">
              Este link expira em 24 horas.
            </div>
          </div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;">
          Se você não solicitou esta ação, ignore esta mensagem.
        </div>
      </div>
    `.trim();

    const sent = await this.email.send({
      to,
      subject: 'OpenRouteX: redefinição de senha',
      text: `Redefina sua senha pelo link:\n${resetUrl}\n\nEste link expira em 24 horas.`,
      html,
    });
    if (!sent.ok) throw new BadRequestException('Falha ao enviar email. Verifique SMTP em Configurações.');
    return { ok: true };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }

  @Post(':id/block')
  block(@Param('id') id: string) {
    return this.users.setStatus(id, 'DISABLED');
  }

  @Post(':id/unblock')
  unblock(@Param('id') id: string) {
    return this.users.setStatus(id, 'ACTIVE');
  }

  @Post(':id/clear-login-lock')
  async clearLoginLock(@Param('id') id: string) {
    const u = await this.users.getEntity(id);
    return this.users.clearLoginLock(u.username);
  }
}
