import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateApiDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  certificateId?: string | null;

  @IsOptional()
  @IsObject()
  variableBindings?: Record<string, string>;
}

export class UpdateApiDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  certificateId?: string | null;

  @IsOptional()
  @IsObject()
  variableBindings?: Record<string, string>;
}
