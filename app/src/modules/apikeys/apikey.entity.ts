import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ApiKeyStatus = 'ACTIVE' | 'DISABLED';

@Entity({ name: 'api_keys' })
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  key!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 12, default: 'ACTIVE' })
  status!: ApiKeyStatus;

  @Column({ type: 'jsonb', nullable: true })
  allowedApis!: string[] | null;

  @Column({ type: 'jsonb', default: {} })
  variableBindings!: Record<string, string>;

  @Column({ type: 'int', default: 60 })
  requestsPerMinute!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

