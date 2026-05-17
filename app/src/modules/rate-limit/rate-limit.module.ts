import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RateLimitService } from './rate-limit.service';
import { RedisService } from './redis.service';

@Module({
  imports: [ConfigModule],
  providers: [RedisService, RateLimitService],
  exports: [RedisService, RateLimitService],
})
export class RateLimitModule {}

