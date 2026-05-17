import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Index(['createdAt'])
@Index(['apiSlug', 'publicPath', 'method'])
@Index(['apiKey'])
@Entity({ name: 'request_logs' })
export class RequestLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  requestId!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  apiKey!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  apiSlug!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  publicPath!: string | null;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'text' })
  originalUrl!: string;

  @Column({ type: 'text', nullable: true })
  finalUrl!: string | null;

  @Column({ type: 'jsonb', default: {} })
  requestHeaders!: Record<string, string | string[]>;

  @Column({ type: 'bytea', nullable: true })
  requestBody!: Buffer | null;

  @Column({ type: 'jsonb', default: {} })
  responseHeaders!: Record<string, string | string[]>;

  @Column({ type: 'bytea', nullable: true })
  responseBody!: Buffer | null;

  @Column({ type: 'int', nullable: true })
  statusCode!: number | null;

  @Column({ type: 'int', nullable: true })
  durationMs!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  responseAt!: Date | null;
}
