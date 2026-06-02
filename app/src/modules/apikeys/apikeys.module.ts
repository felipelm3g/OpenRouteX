import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApisModule } from '../apis/apis.module';
import { PathEntity } from '../paths/path.entity';

import { ApiKeyEntity } from './apikey.entity';
import { ApiKeysController } from './apikeys.controller';
import { ApiKeysService } from './apikeys.service';

@Module({
  imports: [ApisModule, TypeOrmModule.forFeature([ApiKeyEntity, PathEntity])],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService, TypeOrmModule],
})
export class ApiKeysModule {}
