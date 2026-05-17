import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthEntity, AuthType } from '../../modules/auth/auth.entity';
import { RedisService } from '../../modules/rate-limit/redis.service';
import { HttpClientService } from '../http-client/http-client.service';

export type ExternalAuthResult = {
  headers: Record<string, string>;
};

@Injectable()
export class AuthEngineService {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpClientService,
    private readonly redis: RedisService,
  ) {}

  async buildExternalAuthHeaders(auth: AuthEntity | null): Promise<ExternalAuthResult> {
    if (!auth) return { headers: {} };

    const type: AuthType = auth.type;
    const cfg = auth.config ?? {};

    if (type === 'api_key') {
      const headerName = String((cfg as any).headerName ?? 'X-API-KEY');
      const value = String((cfg as any).value ?? '');
      return { headers: { [headerName]: value } };
    }

    if (type === 'bearer') {
      const token = String((cfg as any).token ?? '');
      return { headers: { Authorization: `Bearer ${token}` } };
    }

    if (type === 'basic') {
      const username = String((cfg as any).username ?? '');
      const password = String((cfg as any).password ?? '');
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      return { headers: { Authorization: `Basic ${encoded}` } };
    }

    if (type === 'custom_header') {
      const headerName = String((cfg as any).headerName ?? '');
      const value = String((cfg as any).value ?? '');
      if (!headerName) return { headers: {} };
      return { headers: { [headerName]: value } };
    }

    if (type === 'oauth2_client_credentials') {
      const tokenUrl = String((cfg as any).tokenUrl ?? '');
      const clientId = String((cfg as any).clientId ?? '');
      const clientSecret = String((cfg as any).clientSecret ?? '');
      const scope = (cfg as any).scope ? String((cfg as any).scope) : undefined;
      const audience = (cfg as any).audience ? String((cfg as any).audience) : undefined;
      const authStyle = String((cfg as any).authStyle ?? 'basic'); // basic | body

      if (!tokenUrl || !clientId || !clientSecret) return { headers: {} };

      const cacheKey = `oauth2:${auth.id}`;
      const cached = await this.redis.client.get(cacheKey);
      if (cached) return { headers: { Authorization: `Bearer ${cached}` } };

      const form = new URLSearchParams();
      form.set('grant_type', 'client_credentials');
      if (scope) form.set('scope', scope);
      if (audience) form.set('audience', audience);
      if (authStyle === 'body') {
        form.set('client_id', clientId);
        form.set('client_secret', clientSecret);
      }

      const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      };
      if (authStyle !== 'body') {
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers.authorization = `Basic ${basic}`;
      }

      const timeoutMs = Number(this.config.get<string>('OAUTH2_TIMEOUT_MS', '10000'));
      const response = await this.http.send({
        method: 'POST',
        url: tokenUrl,
        headers,
        body: Buffer.from(form.toString()),
        timeoutMs,
      });

      const json = JSON.parse(response.body.toString('utf8')) as any;
      const accessToken = String(json?.access_token ?? '');
      const expiresIn = Number(json?.expires_in ?? 300);
      if (!accessToken) return { headers: {} };

      const ttl = Math.max(5, Math.min(86400, expiresIn - 5));
      await this.redis.client.set(cacheKey, accessToken, 'EX', ttl);
      return { headers: { Authorization: `Bearer ${accessToken}` } };
    }

    return { headers: {} };
  }
}
