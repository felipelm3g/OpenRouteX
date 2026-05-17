import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { UserStatus } from '../user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(120)
  password!: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'] satisfies UserStatus[])
  status?: UserStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  sendWelcomeEmail?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'] satisfies UserStatus[])
  status?: UserStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  permissions?: string[];
}
