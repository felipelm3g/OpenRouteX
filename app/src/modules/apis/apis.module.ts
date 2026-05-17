import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PathEntity } from '../paths/path.entity';

import { ApiEntity } from './api.entity';
import { ApisController } from './apis.controller';
import { ApisService } from './apis.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiEntity, PathEntity])],
  controllers: [ApisController],
  providers: [ApisService],
  exports: [ApisService, TypeOrmModule],
})
export class ApisModule {}
