import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SettingsService } from '../settings/settings.service';

import { RequestLogEntity } from './request-log.entity';

@Injectable()
export class LogCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly settings: SettingsService,
    @InjectRepository(RequestLogEntity)
    private readonly logsRepo: Repository<RequestLogEntity>,
  ) {}

  onModuleInit() {
    void this.tick();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async tick() {
    if (this.stopped) return;

    try {
      const cfg = await this.settings.getSettings();
      const intervalMinutes = Math.max(5, Number(cfg.logsCleanupIntervalMinutes || 60));
      const fallbackDays = Math.max(0, Number(cfg.logsRetentionDays || 0));
      const successDaysRaw = cfg.logsRetentionDaysSuccess;
      const errorDaysRaw = cfg.logsRetentionDaysError;
      const successDays = Number.isFinite(Number(successDaysRaw)) ? Math.max(0, Number(successDaysRaw)) : fallbackDays;
      const errorDays = Number.isFinite(Number(errorDaysRaw)) ? Math.max(0, Number(errorDaysRaw)) : fallbackDays;

      if (successDays > 0) {
        const cutoff = new Date(Date.now() - successDays * 24 * 60 * 60 * 1000);
        await this.logsRepo
          .createQueryBuilder()
          .delete()
          .from(RequestLogEntity)
          .where('createdAt < :cutoff', { cutoff })
          .andWhere('statusCode >= 200 AND statusCode < 300')
          .execute();
      }

      if (errorDays > 0) {
        const cutoff = new Date(Date.now() - errorDays * 24 * 60 * 60 * 1000);
        await this.logsRepo
          .createQueryBuilder()
          .delete()
          .from(RequestLogEntity)
          .where('createdAt < :cutoff', { cutoff })
          .andWhere('(statusCode IS NULL OR statusCode < 200 OR statusCode >= 300)')
          .execute();
      }

      this.timer = setTimeout(() => void this.tick(), intervalMinutes * 60 * 1000);
    } catch {
      this.timer = setTimeout(() => void this.tick(), 60 * 1000);
    }
  }
}
