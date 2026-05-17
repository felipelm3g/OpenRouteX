import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

import { AuthType } from '../auth.entity';

export class CreateAuthDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn([
    'api_key',
    'oauth2_client_credentials',
    'oidc_client_credentials',
    'bearer',
    'basic',
    'custom_header',
    'hmac',
    'oauth1',
  ] satisfies AuthType[])
  type!: AuthType;

  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateAuthDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'api_key',
    'oauth2_client_credentials',
    'oidc_client_credentials',
    'bearer',
    'basic',
    'custom_header',
    'hmac',
    'oauth1',
  ] satisfies AuthType[])
  type?: AuthType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
