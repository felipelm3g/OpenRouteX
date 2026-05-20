import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { HttpMethod } from '../path.entity';

export class CreatePathDto {
  @IsUUID()
  apiId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  publicPath!: string;

  @IsString()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] satisfies HttpMethod[])
  method!: HttpMethod;

  @IsString()
  @IsNotEmpty()
  targetUrlTemplate!: string;

  @IsOptional()
  @IsUUID()
  authId?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireClientAuth?: boolean;

  @IsOptional()
  @IsObject()
  addHeaders?: Record<string, string>;

  @IsOptional()
  @IsObject()
  addQuery?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  forwardClientQuery?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  timeoutSeconds?: number | null;
}

export class UpdatePathDto {
  @IsOptional()
  @IsUUID()
  apiId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  publicPath?: string;

  @IsOptional()
  @IsString()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] satisfies HttpMethod[])
  method?: HttpMethod;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  targetUrlTemplate?: string;

  @IsOptional()
  @IsUUID()
  authId?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireClientAuth?: boolean;

  @IsOptional()
  @IsObject()
  addHeaders?: Record<string, string>;

  @IsOptional()
  @IsObject()
  addQuery?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  forwardClientQuery?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  timeoutSeconds?: number | null;
}
