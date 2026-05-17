import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RateLimitModule } from '../../modules/rate-limit/rate-limit.module';
import { HttpClientModule } from '../http-client/http-client.module';

import { AuthEngineService } from './auth-engine.service';

@Module({
  imports: [ConfigModule, HttpClientModule, RateLimitModule],
  providers: [AuthEngineService],
  exports: [AuthEngineService],
})
export class AuthEngineModule {}
