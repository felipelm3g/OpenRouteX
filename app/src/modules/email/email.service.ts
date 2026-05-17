import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { SettingsService } from '../settings/settings.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transport: nodemailer.Transporter | null = null;
  private transportKey = '';

  constructor(private readonly settings: SettingsService) {}

  private async getTransportAndFrom() {
    const cfg = await this.settings.getSettings();
    const all = await this.settings.getAll();
    const host = cfg.smtpHost.trim();
    const port = cfg.smtpPort;
    const secure = cfg.smtpSecure;
    const user = cfg.smtpUser.trim();
    const pass = String(all.smtpPassword ?? '').trim();
    const from = cfg.smtpFrom.trim();
    const rejectUnauthorized = cfg.smtpTlsRejectUnauthorized;

    if (!host || !from) return { transport: null, from: '' };

    const key = JSON.stringify({ host, port, secure, user, hasPass: Boolean(pass), rejectUnauthorized });
    if (!this.transport || this.transportKey !== key) {
      this.transportKey = key;
      this.transport = nodemailer.createTransport({
        host,
        port: Number.isFinite(port) && port > 0 ? port : 587,
        secure,
        auth: user ? { user, pass } : undefined,
        tls: { rejectUnauthorized },
      });
    }
    return { transport: this.transport, from };
  }

  async send(params: { to: string; subject: string; text: string; html?: string }) {
    const { transport, from } = await this.getTransportAndFrom();
    if (!transport || !from) return { ok: false };

    try {
      await transport.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Falha ao enviar email: ${msg}`);
      return { ok: false };
    }
  }
}
