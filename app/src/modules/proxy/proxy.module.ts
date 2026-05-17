import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RequestEngineModule } from '../../core/request-engine/request-engine.module';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { ApisModule } from '../apis/apis.module';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { LoggingModule } from '../logging/logging.module';
import { PathsModule } from '../paths/paths.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { SettingsModule } from '../settings/settings.module';

import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [
    ConfigModule,
    RateLimitModule,
    LoggingModule,
    AuthModule,
    CertificatesModule,
    ApisModule,
    PathsModule,
    ApiKeysModule,
    SettingsModule,
    RequestEngineModule,
  ],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
