import { Injectable } from '@nestjs/common';

import { RedisService } from './redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limitPerMinute: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetSeconds: number;
    current: number;
  }> {
    const now = new Date();
    const windowKey = `rl:${key}:${now.getUTCFullYear()}${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(
      now.getUTCHours(),
    ).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;

    const tx = this.redis.client.multi();
    tx.incr(windowKey);
    tx.ttl(windowKey);
    tx.expire(windowKey, 70);
    const [incrRes, ttlRes] = (await tx.exec()) ?? [];

    const current = Number(incrRes?.[1] ?? 0);
    let ttl = Number(ttlRes?.[1] ?? -1);
    if (ttl < 0) ttl = 60;

    const remaining = Math.max(0, limitPerMinute - current);
    const allowed = current <= limitPerMinute;
    return { allowed, remaining, resetSeconds: ttl, current };
  }
}

