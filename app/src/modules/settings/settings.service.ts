import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SettingsDto, UpdateSettingsDto } from './dto/settings.dto';
import { SystemSettingEntity } from './settings.entity';

function parseBool(raw: unknown, fallback: boolean) {
  if (raw === undefined || raw === null) return fallback;
  const v = String(raw).trim().toLowerCase();
  if (!v) return fallback;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function parseIntSafe(raw: unknown, fallback: number, min?: number, max?: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  if (min !== undefined && v < min) return fallback;
  if (max !== undefined && v > max) return fallback;
  return v;
}

function parseStringArray(raw: unknown, fallback: string[]) {
  if (raw === undefined || raw === null) return fallback;
  const txt = String(raw).trim();
  if (!txt) return fallback;
  try {
    const parsed: unknown = JSON.parse(txt);
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
  } catch {
    return txt
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
}

const DEFAULTS: SettingsDto = {
  language: 'en_us',
  timezone: 'UTC',
  logsRetentionDays: 30,
  logsRetentionDaysSuccess: 30,
  logsRetentionDaysError: 90,
  logsCleanupIntervalMinutes: 60,
  dashboardMetricsRefetchMs: 5000,
  dashboardLogsRefetchMs: 2000,
  dashboardColorizeEnabled: true,
  proxyTimeoutMs: 30000,
  defaultForwardClientQuery: true,
  apiKeyHeaderName: 'API-KEY',
  proxyBlockedHeaders: ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'],
  loginMaxAttempts: 3,
  loginLockMinutes: 180,
  loginLockEmailEnabled: true,
  passwordMinLength: 8,
  passwordRequireUppercase: false,
  passwordRequireLowercase: false,
  passwordRequireNumber: false,
  passwordRequireSymbol: false,
  passwordMaxAgeDays: 0,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPasswordSet: false,
  smtpFrom: '',
  smtpTlsRejectUnauthorized: true,
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SystemSettingEntity)
    private readonly repo: Repository<SystemSettingEntity>,
  ) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.repo.find();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async getSettings(): Promise<SettingsDto> {
    const all = await this.getAll();
    const language = String(all.language ?? DEFAULTS.language).trim() || DEFAULTS.language;
    const timezone = String(all.timezone ?? DEFAULTS.timezone).trim() || DEFAULTS.timezone;
    const logsRetentionDays = parseIntSafe(all.logsRetentionDays, DEFAULTS.logsRetentionDays, 0, 3650);
    const logsRetentionDaysSuccess = parseIntSafe(all.logsRetentionDaysSuccess, DEFAULTS.logsRetentionDaysSuccess, 0, 3650);
    const logsRetentionDaysError = parseIntSafe(all.logsRetentionDaysError, DEFAULTS.logsRetentionDaysError, 0, 3650);
    const logsCleanupIntervalMinutes = parseIntSafe(all.logsCleanupIntervalMinutes, DEFAULTS.logsCleanupIntervalMinutes, 5, 1440);

    const dashboardMetricsRefetchMs = parseIntSafe(all.dashboardMetricsRefetchMs, DEFAULTS.dashboardMetricsRefetchMs, 1000, 600000);
    const dashboardLogsRefetchMs = parseIntSafe(all.dashboardLogsRefetchMs, DEFAULTS.dashboardLogsRefetchMs, 1000, 600000);
    const dashboardColorizeEnabled = parseBool(all.dashboardColorizeEnabled, DEFAULTS.dashboardColorizeEnabled);
    const proxyTimeoutMs = parseIntSafe(all.proxyTimeoutMs, parseIntSafe(process.env.PROXY_TIMEOUT_MS, DEFAULTS.proxyTimeoutMs, 1000, 600000), 1000, 600000);
    const defaultForwardClientQuery = parseBool(all.defaultForwardClientQuery, DEFAULTS.defaultForwardClientQuery);
    const apiKeyHeaderName = String(all.apiKeyHeaderName ?? DEFAULTS.apiKeyHeaderName).trim() || DEFAULTS.apiKeyHeaderName;
    const proxyBlockedHeaders = parseStringArray(all.proxyBlockedHeaders, DEFAULTS.proxyBlockedHeaders).map((h) => h.toLowerCase());

    const loginMaxAttempts = parseIntSafe(all.loginMaxAttempts, DEFAULTS.loginMaxAttempts, 1, 20);
    const loginLockMinutes = parseIntSafe(all.loginLockMinutes, DEFAULTS.loginLockMinutes, 1, 1440);
    const loginLockEmailEnabled = parseBool(all.loginLockEmailEnabled, DEFAULTS.loginLockEmailEnabled);

    const passwordMinLength = parseIntSafe(all.passwordMinLength, DEFAULTS.passwordMinLength, 8, 128);
    const passwordRequireUppercase = parseBool(all.passwordRequireUppercase, DEFAULTS.passwordRequireUppercase);
    const passwordRequireLowercase = parseBool(all.passwordRequireLowercase, DEFAULTS.passwordRequireLowercase);
    const passwordRequireNumber = parseBool(all.passwordRequireNumber, DEFAULTS.passwordRequireNumber);
    const passwordRequireSymbol = parseBool(all.passwordRequireSymbol, DEFAULTS.passwordRequireSymbol);
    const passwordMaxAgeDays = parseIntSafe(all.passwordMaxAgeDays, DEFAULTS.passwordMaxAgeDays, 0, 3650);

    const smtpHost = String(all.smtpHost ?? DEFAULTS.smtpHost).trim();
    const smtpPort = parseIntSafe(all.smtpPort, DEFAULTS.smtpPort, 1, 65535);
    const smtpSecure = parseBool(all.smtpSecure, DEFAULTS.smtpSecure);
    const smtpUser = String(all.smtpUser ?? DEFAULTS.smtpUser).trim();
    const smtpPassword = String(all.smtpPassword ?? '').trim();
    const smtpFrom = String(all.smtpFrom ?? DEFAULTS.smtpFrom).trim();
    const smtpTlsRejectUnauthorized = parseBool(all.smtpTlsRejectUnauthorized, DEFAULTS.smtpTlsRejectUnauthorized);
    return {
      language,
      timezone,
      logsRetentionDays,
      logsRetentionDaysSuccess,
      logsRetentionDaysError,
      logsCleanupIntervalMinutes,
      dashboardMetricsRefetchMs,
      dashboardLogsRefetchMs,
      dashboardColorizeEnabled,
      proxyTimeoutMs,
      defaultForwardClientQuery,
      apiKeyHeaderName,
      proxyBlockedHeaders,
      loginMaxAttempts,
      loginLockMinutes,
      loginLockEmailEnabled,
      passwordMinLength,
      passwordRequireUppercase,
      passwordRequireLowercase,
      passwordRequireNumber,
      passwordRequireSymbol,
      passwordMaxAgeDays,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPasswordSet: Boolean(smtpPassword),
      smtpFrom,
      smtpTlsRejectUnauthorized,
    };
  }

  async update(dto: UpdateSettingsDto): Promise<SettingsDto> {
    const updates: Array<[string, string]> = [];
    if (dto.language !== undefined) updates.push(['language', String(dto.language)]);
    if (dto.timezone !== undefined) updates.push(['timezone', String(dto.timezone)]);
    if (dto.logsRetentionDays !== undefined)
      updates.push(['logsRetentionDays', String(dto.logsRetentionDays)]);
    if (dto.logsRetentionDaysSuccess !== undefined)
      updates.push(['logsRetentionDaysSuccess', String(dto.logsRetentionDaysSuccess)]);
    if (dto.logsRetentionDaysError !== undefined)
      updates.push(['logsRetentionDaysError', String(dto.logsRetentionDaysError)]);
    if (dto.logsCleanupIntervalMinutes !== undefined)
      updates.push(['logsCleanupIntervalMinutes', String(dto.logsCleanupIntervalMinutes)]);
    if (dto.dashboardMetricsRefetchMs !== undefined)
      updates.push(['dashboardMetricsRefetchMs', String(dto.dashboardMetricsRefetchMs)]);
    if (dto.dashboardLogsRefetchMs !== undefined)
      updates.push(['dashboardLogsRefetchMs', String(dto.dashboardLogsRefetchMs)]);
    if (dto.dashboardColorizeEnabled !== undefined)
      updates.push(['dashboardColorizeEnabled', String(Boolean(dto.dashboardColorizeEnabled))]);
    if (dto.proxyTimeoutMs !== undefined) updates.push(['proxyTimeoutMs', String(dto.proxyTimeoutMs)]);
    if (dto.defaultForwardClientQuery !== undefined)
      updates.push(['defaultForwardClientQuery', String(Boolean(dto.defaultForwardClientQuery))]);
    if (dto.apiKeyHeaderName !== undefined) updates.push(['apiKeyHeaderName', String(dto.apiKeyHeaderName)]);
    if (dto.proxyBlockedHeaders !== undefined)
      updates.push(['proxyBlockedHeaders', JSON.stringify(dto.proxyBlockedHeaders)]);
    if (dto.loginMaxAttempts !== undefined) updates.push(['loginMaxAttempts', String(dto.loginMaxAttempts)]);
    if (dto.loginLockMinutes !== undefined) updates.push(['loginLockMinutes', String(dto.loginLockMinutes)]);
    if (dto.loginLockEmailEnabled !== undefined)
      updates.push(['loginLockEmailEnabled', String(Boolean(dto.loginLockEmailEnabled))]);
    if (dto.passwordMinLength !== undefined) updates.push(['passwordMinLength', String(dto.passwordMinLength)]);
    if (dto.passwordRequireUppercase !== undefined)
      updates.push(['passwordRequireUppercase', String(Boolean(dto.passwordRequireUppercase))]);
    if (dto.passwordRequireLowercase !== undefined)
      updates.push(['passwordRequireLowercase', String(Boolean(dto.passwordRequireLowercase))]);
    if (dto.passwordRequireNumber !== undefined)
      updates.push(['passwordRequireNumber', String(Boolean(dto.passwordRequireNumber))]);
    if (dto.passwordRequireSymbol !== undefined)
      updates.push(['passwordRequireSymbol', String(Boolean(dto.passwordRequireSymbol))]);
    if (dto.passwordMaxAgeDays !== undefined)
      updates.push(['passwordMaxAgeDays', String(dto.passwordMaxAgeDays)]);
    if (dto.smtpHost !== undefined) updates.push(['smtpHost', String(dto.smtpHost)]);
    if (dto.smtpPort !== undefined) updates.push(['smtpPort', String(dto.smtpPort)]);
    if (dto.smtpSecure !== undefined) updates.push(['smtpSecure', String(Boolean(dto.smtpSecure))]);
    if (dto.smtpUser !== undefined) updates.push(['smtpUser', String(dto.smtpUser)]);
    if (dto.smtpPassword !== undefined) updates.push(['smtpPassword', String(dto.smtpPassword)]);
    if (dto.smtpFrom !== undefined) updates.push(['smtpFrom', String(dto.smtpFrom)]);
    if (dto.smtpTlsRejectUnauthorized !== undefined)
      updates.push(['smtpTlsRejectUnauthorized', String(Boolean(dto.smtpTlsRejectUnauthorized))]);

    for (const [key, value] of updates) {
      const existing = await this.repo.findOne({ where: { key } });
      if (existing) {
        existing.value = value;
        await this.repo.save(existing);
      } else {
        await this.repo.save(this.repo.create({ key, value }));
      }
    }

    return this.getSettings();
  }
}
