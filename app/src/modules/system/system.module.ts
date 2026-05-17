import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiKeyEntity } from '../apikeys/apikey.entity';
import { ApiEntity } from '../apis/api.entity';
import { AuthEntity } from '../auth/auth.entity';
import { EmailModule } from '../email/email.module';
import { LoggingModule } from '../logging/logging.module';
import { RequestLogEntity } from '../logging/request-log.entity';
import { PathEntity } from '../paths/path.entity';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { SystemSettingEntity } from '../settings/settings.entity';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';

import { SystemController } from './system.controller';

@Module({
  imports: [
    LoggingModule,
    RateLimitModule,
    UsersModule,
    EmailModule,
    SettingsModule,
    TypeOrmModule.forFeature([
      ApiEntity,
      PathEntity,
      ApiKeyEntity,
      AuthEntity,
      RequestLogEntity,
      SystemSettingEntity,
    ]),
  ],
  controllers: [SystemController],
})
export class SystemModule {}
