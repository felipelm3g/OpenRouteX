import { createHash, createHmac, randomBytes } from 'crypto';

import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthEntity, AuthType } from '../../modules/auth/auth.entity';
import { RedisService } from '../../modules/rate-limit/redis.service';
import { HttpClientService } from '../http-client/http-client.service';

export type ExternalAuthResult = {
  headers: Record<string, string>;
};

export type ExternalAuthContext = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Buffer | null;
};

@Injectable()
export class AuthEngineService {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpClientService,
    private readonly redis: RedisService,
  ) {}

  private template(tpl: string, vars: Record<string, string>) {
    return String(tpl ?? '').replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => {
      const key = String(k ?? '').toLowerCase();
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : m;
    });
  }

  private oauth1Enc(value: string) {
    return encodeURIComponent(String(value ?? ''))
      .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  private parseJsonSafe(buf: Buffer): any | null {
    const text = buf.toString('utf8').trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private bodyPreview(buf: Buffer, limit = 600) {
    const s = buf.toString('utf8');
    const trimmed = s.trim();
    if (trimmed.length <= limit) return trimmed;
    return `${trimmed.slice(0, limit)}…`;
  }

  private buildOAuth1AuthorizationHeader(params: {
    method: string;
    url: string;
    consumerKey: string;
    consumerSecret: string;
    token?: string;
    tokenSecret?: string;
    realm?: string;
    nonce?: string;
    timestamp?: string;
    signatureMethod?: string;
    version?: string;
  }) {
    const method = String(params.method ?? 'GET').toUpperCase();
    const u = new URL(params.url);
    const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
    const signatureMethod = String(params.signatureMethod ?? 'HMAC-SHA1').toUpperCase();
    if (signatureMethod !== 'HMAC-SHA1') return '';

    const oauthNonce = params.nonce ?? randomBytes(16).toString('hex');
    const oauthTimestamp = params.timestamp ?? String(Math.floor(Date.now() / 1000));
    const oauthVersion = String(params.version ?? '1.0');

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: params.consumerKey,
      oauth_nonce: oauthNonce,
      oauth_signature_method: signatureMethod,
      oauth_timestamp: oauthTimestamp,
      oauth_version: oauthVersion,
    };
    if (params.token) oauthParams.oauth_token = params.token;

    const pairs: Array<[string, string]> = [];
    for (const [k, v] of u.searchParams.entries()) {
      pairs.push([k, v]);
    }
    for (const [k, v] of Object.entries(oauthParams)) {
      pairs.push([k, v]);
    }

    const sorted = pairs
      .map(([k, v]) => [this.oauth1Enc(k), this.oauth1Enc(v)] as [string, string])
      .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

    const normalized = sorted.map(([k, v]) => `${k}=${v}`).join('&');
    const baseString = `${method}&${this.oauth1Enc(baseUrl)}&${this.oauth1Enc(normalized)}`;
    const key = `${this.oauth1Enc(params.consumerSecret)}&${this.oauth1Enc(params.tokenSecret ?? '')}`;
    const signature = createHmac('sha1', key).update(baseString).digest('base64');

    const headerParams: Array<[string, string]> = [];
    if (params.realm) headerParams.push(['realm', params.realm]);
    for (const [k, v] of Object.entries(oauthParams)) headerParams.push([k, v]);
    headerParams.push(['oauth_signature', signature]);

    const headerValue = headerParams
      .map(([k, v]) => `${this.oauth1Enc(k)}="${this.oauth1Enc(v)}"`)
      .join(', ');
    return `OAuth ${headerValue}`;
  }

  private async oidcResolveTokenEndpoint(issuerUrl: string) {
    const issuer = String(issuerUrl ?? '').trim().replace(/\/+$/, '');
    if (!issuer) return '';
    const cacheKey = `oidc:disc:${issuer}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return cached;

    const wellKnown = `${issuer}/.well-known/openid-configuration`;
    const timeoutMs = Number(this.config.get<string>('OIDC_DISCOVERY_TIMEOUT_MS', '10000'));
    const response = await this.http.send({
      method: 'GET',
      url: wellKnown,
      headers: { accept: 'application/json' },
      body: null,
      timeoutMs,
    });
    const json = JSON.parse(response.body.toString('utf8')) as any;
    const tokenEndpoint = String(json?.token_endpoint ?? '').trim();
    if (!tokenEndpoint) return '';
    await this.redis.client.set(cacheKey, tokenEndpoint, 'EX', 86400);
    return tokenEndpoint;
  }

  async buildExternalAuthHeaders(
    auth: AuthEntity | null,
    ctx?: ExternalAuthContext,
  ): Promise<ExternalAuthResult> {
    if (!auth) return { headers: {} };

    const type: AuthType = auth.type;
    const cfg = auth.config ?? {};
    const method = String(ctx?.method ?? 'GET');
    const url = String(ctx?.url ?? '');
    const body = ctx?.body ?? null;

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

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const jsonErr = this.parseJsonSafe(response.body);
        const msg = jsonErr?.error_description || jsonErr?.error || this.bodyPreview(response.body) || 'oauth2_token_failed';
        throw new HttpException(
          { error: 'oauth2_token_failed', statusCode: response.statusCode, message: String(msg) },
          502,
        );
      }

      const json = this.parseJsonSafe(response.body) as any;
      if (!json) {
        throw new HttpException(
          { error: 'oauth2_token_invalid_response', statusCode: response.statusCode, message: this.bodyPreview(response.body) || 'invalid_json' },
          502,
        );
      }
      const accessToken = String(json?.access_token ?? '');
      const expiresIn = Number(json?.expires_in ?? 300);
      if (!accessToken) return { headers: {} };

      const ttl = Math.max(5, Math.min(86400, expiresIn - 5));
      await this.redis.client.set(cacheKey, accessToken, 'EX', ttl);
      return { headers: { Authorization: `Bearer ${accessToken}` } };
    }

    if (type === 'oidc_client_credentials') {
      const issuerUrl = String((cfg as any).issuerUrl ?? '');
      const tokenUrlCfg = String((cfg as any).tokenUrl ?? '');
      const tokenUrl = tokenUrlCfg || (issuerUrl ? await this.oidcResolveTokenEndpoint(issuerUrl) : '');
      const clientId = String((cfg as any).clientId ?? '');
      const clientSecret = String((cfg as any).clientSecret ?? '');
      const scope = (cfg as any).scope ? String((cfg as any).scope) : undefined;
      const audience = (cfg as any).audience ? String((cfg as any).audience) : undefined;
      const authStyle = String((cfg as any).authStyle ?? 'basic'); // basic | body

      if (!tokenUrl || !clientId || !clientSecret) return { headers: {} };

      const cacheKey = `oidc:${auth.id}`;
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

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const jsonErr = this.parseJsonSafe(response.body);
        const msg = jsonErr?.error_description || jsonErr?.error || this.bodyPreview(response.body) || 'oidc_token_failed';
        throw new HttpException(
          { error: 'oidc_token_failed', statusCode: response.statusCode, message: String(msg) },
          502,
        );
      }

      const json = this.parseJsonSafe(response.body) as any;
      if (!json) {
        throw new HttpException(
          { error: 'oidc_token_invalid_response', statusCode: response.statusCode, message: this.bodyPreview(response.body) || 'invalid_json' },
          502,
        );
      }
      const accessToken = String(json?.access_token ?? '');
      const expiresIn = Number(json?.expires_in ?? 300);
      if (!accessToken) return { headers: {} };

      const ttl = Math.max(5, Math.min(86400, expiresIn - 5));
      await this.redis.client.set(cacheKey, accessToken, 'EX', ttl);
      return { headers: { Authorization: `Bearer ${accessToken}` } };
    }

    if (type === 'hmac') {
      const headerName = String((cfg as any).headerName ?? 'Authorization').trim() || 'Authorization';
      const secret = String((cfg as any).secret ?? '');
      const keyId = String((cfg as any).keyId ?? '').trim();
      const algorithm = String((cfg as any).algorithm ?? 'sha256').trim().toLowerCase();
      const encoding = String((cfg as any).signatureEncoding ?? 'hex').trim().toLowerCase();

      if (!url || !secret) return { headers: {} };

      const algo = ['sha256', 'sha1', 'sha512'].includes(algorithm) ? algorithm : 'sha256';
      const enc = encoding === 'base64' ? 'base64' : 'hex';

      const timestamp = String((cfg as any).timestamp ?? Math.floor(Date.now() / 1000));
      const nonce = String((cfg as any).nonce ?? randomBytes(16).toString('hex'));

      const timestampHeaderName = String((cfg as any).timestampHeaderName ?? '').trim();
      const nonceHeaderName = String((cfg as any).nonceHeaderName ?? '').trim();

      const u = new URL(url);
      const queryPairs = Array.from(u.searchParams.entries()).sort((a, b) =>
        a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]),
      );
      const query = queryPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

      const bodyBuf = body ?? Buffer.alloc(0);
      const bodySha256 = createHash('sha256').update(bodyBuf).digest('hex');
      const bodyBase64 = bodyBuf.toString('base64');

      const tpl = String((cfg as any).stringToSignTemplate ?? '{method}\n{path}\n{query}\n{body_sha256}\n{timestamp}');
      const stringToSign = this.template(tpl, {
        method: method.toUpperCase(),
        url,
        path: u.pathname,
        query,
        timestamp,
        nonce,
        body_sha256: bodySha256,
        body_base64: bodyBase64,
      });

      const sig = createHmac(algo, secret).update(stringToSign).digest(enc);
      const headerTpl = String((cfg as any).headerValueTemplate ?? (keyId ? 'HMAC {keyId}:{signature}' : 'HMAC {signature}'));
      const headerValue = this.template(headerTpl, {
        signature: String(sig),
        keyid: keyId,
        timestamp,
        nonce,
      });

      const extra: Record<string, string> = {};
      if (timestampHeaderName) extra[timestampHeaderName] = timestamp;
      if (nonceHeaderName) extra[nonceHeaderName] = nonce;
      return { headers: { ...extra, [headerName]: headerValue } };
    }

    if (type === 'oauth1') {
      const consumerKey = String((cfg as any).consumerKey ?? '');
      const consumerSecret = String((cfg as any).consumerSecret ?? '');
      const token = String((cfg as any).token ?? '');
      const tokenSecret = String((cfg as any).tokenSecret ?? '');
      const realm = String((cfg as any).realm ?? '').trim() || undefined;
      if (!url || !consumerKey || !consumerSecret) return { headers: {} };

      const authHeader = this.buildOAuth1AuthorizationHeader({
        method,
        url,
        consumerKey,
        consumerSecret,
        token: token || undefined,
        tokenSecret: tokenSecret || undefined,
        realm,
      });
      if (!authHeader) return { headers: {} };
      return { headers: { Authorization: authHeader } };
    }

    return { headers: {} };
  }
}
