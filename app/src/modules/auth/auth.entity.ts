import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AuthType =
  | 'api_key'
  | 'oauth2_client_credentials'
  | 'bearer'
  | 'basic'
  | 'custom_header';

@Entity({ name: 'auths' })
export class AuthEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 40 })
  type!: AuthType;

  @Column({ type: 'jsonb' })
  config!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

