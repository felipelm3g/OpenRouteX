import { execFileSync } from 'child_process';
import { randomBytes, createCipheriv, createDecipheriv, createHash, X509Certificate } from 'crypto';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CertificateEntity, CertificateFormat } from './certificate.entity';
import { CreateCertificateDto, UpdateCertificateDto } from './dto/certificate.dto';

type PemPayload = {
  certPem: string;
  keyPem: string;
  passphrase?: string;
  caPem?: string;
};

type PfxPayload = {
  pfxBase64: string;
  passphrase?: string;
};

const MAGIC = Buffer.from('ORX1');

function pickFirstPemCertificate(pem: string) {
  const m = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  return m ? m[0] : '';
}

@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(CertificateEntity)
    private readonly repo: Repository<CertificateEntity>,
  ) {}

  private getEncKey() {
    const allowInsecureDefaults = String(process.env.ORX_ALLOW_INSECURE_DEFAULTS ?? '').trim().toLowerCase() === 'true';
    const fromEnv = String(process.env.CERTS_ENC_KEY ?? '').trim();
    if (fromEnv) return createHash('sha256').update(fromEnv).digest();

    const adminPassword = String(process.env.ADMIN_PASSWORD ?? 'admin').trim();
    const weakDefaults = new Set(['admin123', 'admin', 'password', 'changeme', 'change_me', '123456', '12345678']);
    if (!allowInsecureDefaults && weakDefaults.has(adminPassword.toLowerCase())) {
      throw new ServiceUnavailableException('CERTS_ENC_KEY não configurada. Defina uma chave forte para criptografar certificados.');
    }

    const fallback = `${process.env.ADMIN_USER ?? 'admin'}:${adminPassword}`;
    if (!fallback.trim()) throw new ServiceUnavailableException('CERTS_ENC_KEY não configurada');
    const material = fallback;
    return createHash('sha256').update(material).digest();
  }

  private encryptJson(obj: unknown): Buffer {
    const key = this.getEncKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([MAGIC, iv, tag, ciphertext]);
  }

  private decryptJson<T>(buf: Buffer): T {
    if (!Buffer.isBuffer(buf) || buf.length < 4 + 12 + 16) throw new BadRequestException('Certificado inválido');
    const magic = buf.subarray(0, 4);
    if (!magic.equals(MAGIC)) throw new BadRequestException('Certificado inválido');
    const iv = buf.subarray(4, 16);
    const tag = buf.subarray(16, 32);
    const ciphertext = buf.subarray(32);
    const key = this.getEncKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext) as T;
  }

  private computeNotAfterFromPem(pem: string): Date {
    const first = pickFirstPemCertificate(pem);
    if (!first) throw new BadRequestException('Certificado PEM inválido');
    const x = new X509Certificate(first);
    const dt = new Date(x.validTo);
    if (Number.isNaN(dt.getTime())) throw new BadRequestException('Não foi possível ler a validade do certificado');
    return dt;
  }

  private computeNotAfterFromPfx(pfx: Buffer, passphrase?: string): Date {
    const file = join(tmpdir(), `orx-${Date.now()}-${Math.random().toString(16).slice(2)}.pfx`);
    try {
      writeFileSync(file, pfx);
      const out = execFileSync(
        'openssl',
        [
          'pkcs12',
          '-in',
          file,
          '-clcerts',
          '-nokeys',
          '-passin',
          `pass:${passphrase ?? ''}`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const pem = pickFirstPemCertificate(String(out ?? ''));
      if (!pem) throw new BadRequestException('Não foi possível extrair certificado do PFX');
      return this.computeNotAfterFromPem(pem);
    } catch (e: any) {
      const msg = String(e?.stderr?.toString?.() ?? e?.message ?? 'Falha');
      throw new BadRequestException(`PFX inválido ou senha incorreta. ${msg}`);
    } finally {
      try {
        unlinkSync(file);
      } catch (err) {
        void err;
      }
    }
  }

  async list() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async get(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Certificado não encontrado');
    return row;
  }

  async create(dto: CreateCertificateDto) {
    const name = dto.name.trim();
    const format = dto.format;
    if (format === 'pem') {
      const certPem = String(dto.pemCert ?? '').trim();
      const keyPem = String(dto.pemKey ?? '').trim();
      if (!certPem || !keyPem) throw new BadRequestException('Envie certificado e chave (PEM).');
      const notAfter = this.computeNotAfterFromPem(certPem);
      const payload: PemPayload = {
        certPem,
        keyPem,
        passphrase: dto.pemPassphrase?.trim() || undefined,
        caPem: dto.caPem?.trim() || undefined,
      };
      const row = this.repo.create({
        name,
        format,
        notAfter,
        encrypted: this.encryptJson(payload),
      });
      return this.repo.save(row);
    }

    const pfxBase64 = String(dto.pfxBase64 ?? '').trim();
    if (!pfxBase64) throw new BadRequestException('Envie o arquivo PFX/P12.');
    const pfx = Buffer.from(pfxBase64, 'base64');
    const notAfter = this.computeNotAfterFromPfx(pfx, dto.pfxPassphrase?.trim() || undefined);
    const payload: PfxPayload = { pfxBase64, passphrase: dto.pfxPassphrase?.trim() || undefined };
    const row = this.repo.create({
      name,
      format: 'pfx',
      notAfter,
      encrypted: this.encryptJson(payload),
    });
    return this.repo.save(row);
  }

  async update(id: string, dto: UpdateCertificateDto) {
    const row = await this.get(id);
    const nextFormat = (dto.format ?? row.format) as CertificateFormat;
    const nextName = dto.name !== undefined ? dto.name.trim() : row.name;

    if (nextFormat === 'pem') {
      const current = this.decryptJson<PemPayload>(row.encrypted);
      const certPem = dto.pemCert !== undefined ? String(dto.pemCert ?? '').trim() : current.certPem;
      const keyPem = dto.pemKey !== undefined ? String(dto.pemKey ?? '').trim() : current.keyPem;
      const passphrase = dto.pemPassphrase !== undefined ? (dto.pemPassphrase?.trim() || undefined) : current.passphrase;
      const caPem = dto.caPem !== undefined ? (dto.caPem?.trim() || undefined) : current.caPem;
      if (!certPem || !keyPem) throw new BadRequestException('Envie certificado e chave (PEM).');
      row.name = nextName;
      row.format = 'pem';
      row.notAfter = this.computeNotAfterFromPem(certPem);
      row.encrypted = this.encryptJson({ certPem, keyPem, passphrase, caPem } satisfies PemPayload);
      return this.repo.save(row);
    }

    const current = this.decryptJson<PfxPayload>(row.encrypted);
    const pfxBase64 = dto.pfxBase64 !== undefined ? String(dto.pfxBase64 ?? '').trim() : current.pfxBase64;
    const passphrase = dto.pfxPassphrase !== undefined ? (dto.pfxPassphrase?.trim() || undefined) : current.passphrase;
    if (!pfxBase64) throw new BadRequestException('Envie o arquivo PFX/P12.');
    const pfx = Buffer.from(pfxBase64, 'base64');
    row.name = nextName;
    row.format = 'pfx';
    row.notAfter = this.computeNotAfterFromPfx(pfx, passphrase);
    row.encrypted = this.encryptJson({ pfxBase64, passphrase } satisfies PfxPayload);
    return this.repo.save(row);
  }

  async remove(id: string) {
    const row = await this.get(id);
    await this.repo.remove(row);
    return { ok: true };
  }

  async exportPlain(id: string): Promise<{
    name: string;
    format: 'pem' | 'pfx';
    pemCert?: string;
    pemKey?: string;
    pemPassphrase?: string;
    caPem?: string;
    pfxBase64?: string;
    pfxPassphrase?: string;
  }> {
    const row = await this.get(id);
    if (row.format === 'pem') {
      const payload = this.decryptJson<PemPayload>(row.encrypted);
      return {
        name: row.name,
        format: 'pem',
        pemCert: payload.certPem,
        pemKey: payload.keyPem,
        pemPassphrase: payload.passphrase,
        caPem: payload.caPem,
      };
    }
    const payload = this.decryptJson<PfxPayload>(row.encrypted);
    return {
      name: row.name,
      format: 'pfx',
      pfxBase64: payload.pfxBase64,
      pfxPassphrase: payload.passphrase,
    };
  }

  async getTlsForApiCertificateId(certificateId: string | null | undefined): Promise<null | { cert?: string; key?: string; pfx?: Buffer; passphrase?: string; ca?: string }> {
    if (!certificateId) return null;
    const row = await this.get(certificateId);
    if (row.format === 'pem') {
      const payload = this.decryptJson<PemPayload>(row.encrypted);
      return {
        cert: payload.certPem,
        key: payload.keyPem,
        passphrase: payload.passphrase,
        ca: payload.caPem,
      };
    }
    const payload = this.decryptJson<PfxPayload>(row.encrypted);
    return {
      pfx: Buffer.from(payload.pfxBase64, 'base64'),
      passphrase: payload.passphrase,
    };
  }
}
