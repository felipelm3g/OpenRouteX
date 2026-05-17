import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { ApiKeyEntity } from '../modules/apikeys/apikey.entity';
import { ApiEntity } from '../modules/apis/api.entity';
import { AuthEntity } from '../modules/auth/auth.entity';
import { RequestLogEntity } from '../modules/logging/request-log.entity';
import { PathEntity } from '../modules/paths/path.entity';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.PGHOST ?? 'postgres',
    port: Number(process.env.PGPORT ?? '5432'),
    username: process.env.PGUSER ?? 'openroutex',
    password: process.env.PGPASSWORD ?? 'openroutex',
    database: process.env.PGDATABASE ?? 'openroutex',
    entities: [ApiEntity, PathEntity, ApiKeyEntity, AuthEntity, RequestLogEntity],
    synchronize: true,
  });
  await ds.initialize();
  await ds.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

