import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiKeyEntity } from '../apikeys/apikey.entity';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { ApiEntity } from '../apis/api.entity';
import { ApisModule } from '../apis/apis.module';
import { AuthEntity } from '../auth/auth.entity';
import { AuthModule } from '../auth/auth.module';
import { CertificateEntity } from '../certificates/certificate.entity';
import { CertificatesModule } from '../certificates/certificates.module';
import { PathEntity } from '../paths/path.entity';
import { PathsModule } from '../paths/paths.module';

import { ImportExportController } from './import-export.controller';
import { ImportExportBatchEntity } from './import-export.entity';
import { ImportExportService } from './import-export.service';

@Module({
  imports: [
    ApisModule,
    PathsModule,
    AuthModule,
    CertificatesModule,
    ApiKeysModule,
    TypeOrmModule.forFeature([
      ImportExportBatchEntity,
      ApiEntity,
      PathEntity,
      AuthEntity,
      CertificateEntity,
      ApiKeyEntity,
    ]),
  ],
  controllers: [ImportExportController],
  providers: [ImportExportService],
})
export class ImportExportModule {}
