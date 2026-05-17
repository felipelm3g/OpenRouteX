import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { CertificatesService } from './certificates.service';
import { CreateCertificateDto, UpdateCertificateDto } from './dto/certificate.dto';

@Controller('/admin/certificates')
export class CertificatesController {
  constructor(private readonly certs: CertificatesService) {}

  @Get()
  async list() {
    const rows = await this.certs.list();
    return rows.map((c: { id: string; name: string; format: string; notAfter: Date | null; createdAt: Date; updatedAt: Date }) => ({
      id: c.id,
      name: c.name,
      format: c.format,
      notAfter: c.notAfter,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  @Post()
  async create(@Body() dto: CreateCertificateDto) {
    const c = await this.certs.create(dto);
    return {
      id: c.id,
      name: c.name,
      format: c.format,
      notAfter: c.notAfter,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCertificateDto) {
    const c = await this.certs.update(id, dto);
    return {
      id: c.id,
      name: c.name,
      format: c.format,
      notAfter: c.notAfter,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.certs.remove(id);
  }
}
