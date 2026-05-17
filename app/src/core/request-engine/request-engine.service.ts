import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthEntity } from '../../modules/auth/auth.entity';
import { AuthEngineService } from '../auth-engine/auth-engine.service';
import { HttpClientService } from '../http-client/http-client.service';
import { VariableResolverService } from '../variable-resolver/variable-resolver.service';

const VARIABLE_PATTERN = /\{([A-Z0-9_]+)\}/;

@Injectable()
export class RequestEngineService {
  constructor(
    private readonly config: ConfigService,
    private readonly variables: VariableResolverService,
    private readonly authEngine: AuthEngineService,
    private readonly http: HttpClientService,
  ) {}

  async execute(params: {
    method: string;
    clientHeaders: Record<string, string>;
    clientQuery: Record<string, string>;
    body: Buffer | null;
    targetUrlTemplate: string;
    addHeaders: Record<string, string>;
    addQuery: Record<string, string>;
    apiKeyBindings: Record<string, string>;
    auth: AuthEntity | null;
    timeoutMs?: number;
    tls?: {
      cert?: string;
      key?: string;
      pfx?: Buffer;
      passphrase?: string;
      ca?: string;
    } | null;
  }) {
    for (const [k, v] of Object.entries(params.clientHeaders)) {
      if (VARIABLE_PATTERN.test(v)) {
        throw new ForbiddenException(
          `Variáveis não podem vir do cliente (header: ${k})`,
        );
      }
    }
    for (const [k, v] of Object.entries(params.clientQuery)) {
      if (VARIABLE_PATTERN.test(v)) {
        throw new ForbiddenException(
          `Variáveis não podem vir do cliente (query: ${k})`,
        );
      }
    }

    const addQueryResolved = this.variables.resolveRecordTemplates(
      params.addQuery,
      params.apiKeyBindings,
    );
    const addHeadersResolved = this.variables.resolveRecordTemplates(
      params.addHeaders,
      params.apiKeyBindings,
    );

    const targetResolved = this.variables.resolveTemplate(
      params.targetUrlTemplate,
      params.apiKeyBindings,
    );

    const urlObj = new URL(targetResolved.value);
    for (const [k, v] of Object.entries(params.clientQuery)) {
      urlObj.searchParams.set(k, v);
    }
    for (const [k, v] of Object.entries(addQueryResolved.value)) {
      urlObj.searchParams.set(k, String(v));
    }
    const finalUrl = urlObj.toString();

    const externalAuthHeaders = await this.authEngine.buildExternalAuthHeaders(
      params.auth,
    );

    const outgoingHeaders = {
      ...params.clientHeaders,
      ...addHeadersResolved.value,
      ...externalAuthHeaders.headers,
    };

    const timeoutMs = Number(
      params.timeoutMs ?? this.config.get<string>('PROXY_TIMEOUT_MS', '30000'),
    );

    const upstream = await this.http.send({
      method: params.method,
      url: finalUrl,
      headers: outgoingHeaders,
      body: params.body,
      timeoutMs,
      tls: params.tls ?? null,
    });

    return { finalUrl, outgoingHeaders, upstream };
  }
}
