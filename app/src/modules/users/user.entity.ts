import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UserStatus = 'ACTIVE' | 'DISABLED';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  username!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200 })
  email!: string;

  @Column({ type: 'varchar', length: 220 })
  passwordHash!: string;

  @Column({ type: 'timestamptz', nullable: true })
  passwordUpdatedAt!: Date | null;

  @Column({ type: 'varchar', length: 12, default: 'ACTIVE' })
  status!: UserStatus;

  @Column({ type: 'jsonb', default: [] })
  permissions!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
