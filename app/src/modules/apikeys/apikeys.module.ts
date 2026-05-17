import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiKeyEntity } from './apikey.entity';
import { ApiKeysController } from './apikeys.controller';
import { ApiKeysService } from './apikeys.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyEntity])],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService, TypeOrmModule],
})
export class ApiKeysModule {}
