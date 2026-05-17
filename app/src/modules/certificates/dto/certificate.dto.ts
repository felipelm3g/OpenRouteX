import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { CertificateFormat } from '../certificate.entity';

export class CreateCertificateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsIn(['pem', 'pfx'] satisfies CertificateFormat[])
  format!: CertificateFormat;

  @IsOptional()
  @IsString()
  pemCert?: string;

  @IsOptional()
  @IsString()
  pemKey?: string;

  @IsOptional()
  @IsString()
  pemPassphrase?: string;

  @IsOptional()
  @IsString()
  caPem?: string;

  @IsOptional()
  @IsString()
  pfxBase64?: string;

  @IsOptional()
  @IsString()
  pfxPassphrase?: string;
}

export class UpdateCertificateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pem', 'pfx'] satisfies CertificateFormat[])
  format?: CertificateFormat;

  @IsOptional()
  @IsString()
  pemCert?: string;

  @IsOptional()
  @IsString()
  pemKey?: string;

  @IsOptional()
  @IsString()
  pemPassphrase?: string;

  @IsOptional()
  @IsString()
  caPem?: string;

  @IsOptional()
  @IsString()
  pfxBase64?: string;

  @IsOptional()
  @IsString()
  pfxPassphrase?: string;
}

