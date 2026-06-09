import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiKeysModule } from './modules/apikeys/apikeys.module';
import { ApisModule } from './modules/apis/apis.module';
import { AuthModule } from './modules/auth/auth.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { ImportExportModule } from './modules/import-export/import-export.module';
import { LoggingModule } from './modules/logging/logging.module';
import { PathsModule } from './modules/paths/paths.module';
import { ProxyModule } from './modules/proxy/proxy.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SystemModule } from './modules/system/system.module';
import { UsersModule } from './modules/users/users.module';
import { VariablesModule } from './modules/variables/variables.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('PGHOST', 'postgres'),
        port: Number(config.get<string>('PGPORT', '5432')),
        username: config.get<string>('PGUSER', 'openroutex'),
        password: config.get<string>('PGPASSWORD', 'openroutex'),
        database: config.get<string>('PGDATABASE', 'openroutex'),
        autoLoadEntities: true,
        synchronize: config.get<string>('TYPEORM_SYNC', 'true') === 'true',
        logging: config.get<string>('TYPEORM_LOGGING', 'false') === 'true',
      }),
    }),
    VariablesModule,
    RateLimitModule,
    SettingsModule,
    LoggingModule,
    SystemModule,
    CertificatesModule,
    UsersModule,
    AuthModule,
    ApisModule,
    PathsModule,
    ApiKeysModule,
    ImportExportModule,
    ProxyModule,
  ],
})
export class AppModule {}
