import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  logsRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  logsRetentionDaysSuccess?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  logsRetentionDaysError?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  logsCleanupIntervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600000)
  dashboardMetricsRefetchMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600000)
  dashboardLogsRefetchMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600000)
  proxyTimeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  defaultForwardClientQuery?: boolean;

  @IsOptional()
  @IsString()
  apiKeyHeaderName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  proxyBlockedHeaders?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  loginMaxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  loginLockMinutes?: number;

  @IsOptional()
  @IsBoolean()
  loginLockEmailEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(128)
  passwordMinLength?: number;

  @IsOptional()
  @IsBoolean()
  passwordRequireUppercase?: boolean;

  @IsOptional()
  @IsBoolean()
  passwordRequireLowercase?: boolean;

  @IsOptional()
  @IsBoolean()
  passwordRequireNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  passwordRequireSymbol?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  passwordMaxAgeDays?: number;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPassword?: string;

  @IsOptional()
  @IsString()
  smtpFrom?: string;

  @IsOptional()
  @IsBoolean()
  smtpTlsRejectUnauthorized?: boolean;
}

export type SettingsDto = {
  language: string;
  timezone: string;
  logsRetentionDays: number;
  logsCleanupIntervalMinutes: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordSet: boolean;
  smtpFrom: string;
  smtpTlsRejectUnauthorized: boolean;
  logsRetentionDaysSuccess: number;
  logsRetentionDaysError: number;
  dashboardMetricsRefetchMs: number;
  dashboardLogsRefetchMs: number;
  proxyTimeoutMs: number;
  defaultForwardClientQuery: boolean;
  apiKeyHeaderName: string;
  proxyBlockedHeaders: string[];
  loginMaxAttempts: number;
  loginLockMinutes: number;
  loginLockEmailEnabled: boolean;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordMaxAgeDays: number;
};
