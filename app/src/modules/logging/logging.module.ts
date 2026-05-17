import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SettingsModule } from '../settings/settings.module';

import { LogCleanupService } from './log-cleanup.service';
import { LoggingController } from './logging.controller';
import { LoggingService } from './logging.service';
import { RequestLogEntity } from './request-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RequestLogEntity]), SettingsModule],
  controllers: [LoggingController],
  providers: [LoggingService, LogCleanupService],
  exports: [LoggingService],
})
export class LoggingModule {}
