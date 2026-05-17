import { readFileSync } from 'fs';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, raw, urlencoded } from 'body-parser';
import Redis from 'ioredis';

import { AppModule } from './app.module';

async function bootstrap() {
  const safeOrigin = (value: string) => {
    try {
      return new URL(value).origin;
    } catch {
      return '';
    }
  };

  const host = String(process.env.HOST ?? '').trim();
  const backendOrigin = safeOrigin(String(process.env.URL_BACKEND ?? '').trim());
  const portalRaw = String(process.env.URL_PORTAL ?? '').trim();
  const portalIsLocal = portalRaw.toLowerCase() === 'localhost' || !portalRaw;
  const portalOrigin = !portalIsLocal ? safeOrigin(portalRaw) : '';
  const allowedOrigins = new Set(
    [
      backendOrigin,
      portalOrigin,
      portalIsLocal && host ? `http://${host}:3100` : '',
      portalIsLocal && host ? `https://${host}:3100` : '',
    ].filter(Boolean),
  );

  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  const httpsOptions =
    sslKeyPath && sslCertPath
      ? {
          key: readFileSync(sslKeyPath),
          cert: readFileSync(sslCertPath),
          passphrase: process.env.SSL_PASSPHRASE || undefined,
        }
      : undefined;

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    httpsOptions,
    cors: {
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    },
  });

  const express = app.getHttpAdapter().getInstance() as any;
  express.disable('x-powered-by');
  express.set('trust proxy', true);
  express.use((_: any, res: any, next: any) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('permissions-policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  const parseCookieToken = (cookieHeader: string | undefined, name: string) => {
    if (!cookieHeader) return '';
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const k = part.slice(0, idx).trim();
      if (k !== name) continue;
      return part.slice(idx + 1).trim();
    }
    return '';
  };

  const redisUrl = String(process.env.REDIS_URL ?? '').trim();
  const redis = redisUrl
    ? new Redis(redisUrl)
    : new Redis({
        host: String(process.env.REDIS_HOST ?? 'redis'),
        port: Number(process.env.REDIS_PORT ?? '6379'),
        password: process.env.REDIS_PASSWORD ? String(process.env.REDIS_PASSWORD) : undefined,
        db: Number(process.env.REDIS_DB ?? '0'),
      });

  express.use('/admin', async (req: any, res: any, next: any) => {
    const path = String(req.path ?? '');
    if (req.method === 'OPTIONS') return next();
    if (req.method === 'POST' && path === '/login') return next();

    const auth = String(req.headers?.authorization ?? '');
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const cookieToken = parseCookieToken(String(req.headers?.cookie ?? ''), 'orx_token');
    const token = bearer || cookieToken;
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const rawSession = await redis.get(`orx:sess:${token}`);
    if (!rawSession) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    let session: any = null;
    try {
      session = JSON.parse(rawSession);
    } catch (e: any) {
      void e;
    }
    req.orxUser = session;

    const primary = String(process.env.ADMIN_USER ?? 'admin').trim().toLowerCase();
    const isPrimaryAdmin =
      Boolean(session?.isPrimaryAdmin) ||
      String(session?.username ?? '').trim().toLowerCase() === primary;

    const permissionForPath = (p: string) => {
      if (p === '/session') return null;
      if (p.startsWith('/metrics')) return 'dashboard';
      if (p.startsWith('/logs')) return 'dashboard';
      if (p.startsWith('/search')) return 'dashboard';
      if (p.startsWith('/settings')) return 'settings';
      if (p.startsWith('/test-email')) return 'settings';
      if (p.startsWith('/apis')) return 'apis';
      if (p.startsWith('/paths')) return 'paths';
      if (p.startsWith('/auth')) return 'authentication';
      if (p.startsWith('/apikeys')) return 'apikeys';
      if (p.startsWith('/certificates')) return 'certificates';
      if (p.startsWith('/users')) return 'users';
      return null;
    };

    const perms = session?.permissions;
    if (!isPrimaryAdmin && Array.isArray(perms)) {
      const required = permissionForPath(path);
      if (required && !perms.includes(required)) {
        res.status(403).json({ error: 'forbidden', message: 'Sem permissão para acessar este recurso.' });
        return;
      }
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(
    '/admin',
    json({ limit: process.env.ADMIN_BODY_LIMIT ?? '2mb' }),
    urlencoded({ extended: true, limit: process.env.ADMIN_BODY_LIMIT ?? '2mb' }),
  );

  app.use(
    '/password-reset',
    json({ limit: process.env.ADMIN_BODY_LIMIT ?? '2mb' }),
    urlencoded({ extended: true, limit: process.env.ADMIN_BODY_LIMIT ?? '2mb' }),
  );

  app.use(
    /^\/(?!admin|health|password-reset).*/,
    raw({
      type: '*/*',
      limit: process.env.PROXY_BODY_LIMIT ?? '25mb',
    }),
  );

  const port = Number(process.env.PORT ?? 3994);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
