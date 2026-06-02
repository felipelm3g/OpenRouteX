import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiKeysModule } from '../apikeys/apikeys.module';
import { ApisModule } from '../apis/apis.module';
import { SettingsModule } from '../settings/settings.module';
import { VariablesModule } from '../variables/variables.module';

import { PathEntity } from './path.entity';
import { PathsController } from './paths.controller';
import { PathsService } from './paths.service';

@Module({
  imports: [TypeOrmModule.forFeature([PathEntity]), SettingsModule, VariablesModule, ApisModule, ApiKeysModule],
  controllers: [PathsController],
  providers: [PathsService],
  exports: [PathsService, TypeOrmModule],
})
export class PathsModule {}
