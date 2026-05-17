import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CertificateFormat = 'pem' | 'pfx';

@Entity({ name: 'certificates' })
export class CertificateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 12 })
  format!: CertificateFormat;

  @Column({ type: 'bytea' })
  encrypted!: Buffer;

  @Column({ type: 'timestamptz', nullable: true })
  notAfter!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

