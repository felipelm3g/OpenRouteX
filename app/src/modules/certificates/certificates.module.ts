import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CertificateEntity } from './certificate.entity';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [TypeOrmModule.forFeature([CertificateEntity])],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService, TypeOrmModule],
})
export class CertificatesModule {}

