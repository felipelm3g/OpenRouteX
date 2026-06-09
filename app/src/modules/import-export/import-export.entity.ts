import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'import_export_batches' })
export class ImportExportBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  createdByUsername!: string;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  summary!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  snapshotBefore!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  applied!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  undoneAt!: Date | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  undoneByUsername!: string | null;

  @Column({ type: 'uuid', nullable: true })
  undoneByUserId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
