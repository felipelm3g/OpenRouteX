import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ANY';

@Index(['apiId', 'publicPath', 'method'], { unique: true })
@Entity({ name: 'paths' })
export class PathEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  apiId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 200 })
  publicPath!: string;

  @Column({ type: 'varchar', length: 10 })
  method!: HttpMethod;

  @Column({ type: 'text' })
  targetUrlTemplate!: string;

  @Column({ type: 'uuid', nullable: true })
  authId!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  authInlineType!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  authInlineConfig!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'boolean', default: true })
  requireClientAuth!: boolean;

  @Column({ type: 'jsonb', default: {} })
  addHeaders!: Record<string, string>;

  @Column({ type: 'jsonb', default: {} })
  addQuery!: Record<string, string>;

  @Column({ type: 'boolean', default: true })
  forwardClientQuery!: boolean;

  @Column({ type: 'boolean', default: true })
  forwardClientHeaders!: boolean;

  @Column({ type: 'int', nullable: true })
  timeoutSeconds!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
