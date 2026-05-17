import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { VariablesModule } from '../../modules/variables/variables.module';
import { AuthEngineModule } from '../auth-engine/auth-engine.module';
import { HttpClientModule } from '../http-client/http-client.module';

import { RequestEngineService } from './request-engine.service';

@Module({
  imports: [ConfigModule, VariablesModule, AuthEngineModule, HttpClientModule],
  providers: [RequestEngineService],
  exports: [RequestEngineService],
})
export class RequestEngineModule {}
