import { IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

import { ApiKeyStatus } from '../apikey.entity';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120, { message: 'API Key deve ter no máximo 120 caracteres.' })
  @Matches(/^[A-Za-z0-9._~-]+$/, {
    message: 'API Key inválida. Use apenas letras, números e . _ - ~ (sem espaços).',
  })
  key!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'] satisfies ApiKeyStatus[])
  status?: ApiKeyStatus;

  @IsOptional()
  @IsArray()
  allowedApis?: string[] | null;

  @IsOptional()
  @IsObject()
  variableBindings?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  requestsPerMinute?: number;
}

export class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120, { message: 'API Key deve ter no máximo 120 caracteres.' })
  @Matches(/^[A-Za-z0-9._~-]+$/, {
    message: 'API Key inválida. Use apenas letras, números e . _ - ~ (sem espaços).',
  })
  key?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'] satisfies ApiKeyStatus[])
  status?: ApiKeyStatus;

  @IsOptional()
  @IsArray()
  allowedApis?: string[] | null;

  @IsOptional()
  @IsObject()
  variableBindings?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  requestsPerMinute?: number;
}
