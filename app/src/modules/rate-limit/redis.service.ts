import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    this.client = redisUrl
      ? new Redis(redisUrl)
      : new Redis({
          host: config.get<string>('REDIS_HOST', 'redis'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: Number(config.get<string>('REDIS_DB', '0')),
        });

    this.client.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(message || 'Redis error', stack);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
