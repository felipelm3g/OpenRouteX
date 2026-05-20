import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SettingsModule } from '../settings/settings.module';
import { VariablesModule } from '../variables/variables.module';

import { PathEntity } from './path.entity';
import { PathsController } from './paths.controller';
import { PathsService } from './paths.service';

@Module({
  imports: [TypeOrmModule.forFeature([PathEntity]), SettingsModule, VariablesModule],
  controllers: [PathsController],
  providers: [PathsService],
  exports: [PathsService, TypeOrmModule],
})
export class PathsModule {}
