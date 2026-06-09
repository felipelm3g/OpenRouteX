import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';

import { LoggingService } from './logging.service';

@Controller('/admin/logs')
export class LoggingController {
  constructor(private readonly logs: LoggingService) {}

  private normalizeApiSlug(input: string | undefined) {
    const s = String(input ?? '').trim();
    if (!s) return undefined;
    return s.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  }

  @Get('meta')
  meta(
    @Query('api') apiSlug?: string,
    @Query('path') publicPath?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const api = this.normalizeApiSlug(apiSlug);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const statusRaw = String(status ?? '').trim();
    const statusNum = statusRaw && /^\d+$/.test(statusRaw) ? Number(statusRaw) : null;
    const statusClass = statusNum === null && statusRaw ? statusRaw.toLowerCase() : undefined;
    return this.logs.meta({
      apiSlug: api,
      publicPath,
      statusCode: statusNum === null ? undefined : statusNum,
      status: statusClass,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    });
  }

  @Post('purge')
  purge(@Body() body: { confirm?: string }) {
    return this.logs.purgeAllLogs(body?.confirm ?? '');
  }

  @Get()
  list(
    @Query('api') apiSlug?: string,
    @Query('apiKey') apiKey?: string,
    @Query('status') status?: string,
    @Query('path') publicPath?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const api = this.normalizeApiSlug(apiSlug);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const statusRaw = String(status ?? '').trim();
    const statusNum = statusRaw && /^\d+$/.test(statusRaw) ? Number(statusRaw) : null;
    const statusClass = statusNum === null && statusRaw ? statusRaw.toLowerCase() : undefined;
    return this.logs.list({
      apiSlug: api,
      apiKey,
      publicPath,
      statusCode: statusNum === null ? undefined : statusNum,
      status: statusClass,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('export')
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('format') format?: string,
    @Query('api') apiSlug?: string,
    @Query('apiKey') apiKey?: string,
    @Query('status') status?: string,
    @Query('path') publicPath?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const api = this.normalizeApiSlug(apiSlug);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const fmt = String(format ?? 'json').toLowerCase();
    const statusRaw = String(status ?? '').trim();
    const statusNum = statusRaw && /^\d+$/.test(statusRaw) ? Number(statusRaw) : null;
    const statusClass =
      statusNum === null && statusRaw ? statusRaw.toLowerCase() : undefined;

    const rows = await this.logs.exportList({
      apiSlug: api,
      apiKey,
      publicPath,
      status: statusClass,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    const list = statusNum === null ? rows : rows.filter((r: any) => Number(r.statusCode ?? 0) === statusNum);

    if (fmt === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', 'attachment; filename="openroutex-logs.csv"');
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        const needs = /[",\n\r]/.test(s);
        const out = s.replace(/"/g, '""');
        return needs ? `"${out}"` : out;
      };
      const header = [
        'id',
        'requestId',
        'apiKey',
        'apiSlug',
        'publicPath',
        'method',
        'originalUrl',
        'finalUrl',
        'statusCode',
        'durationMs',
        'createdAt',
        'responseAt',
      ].join(',');
      const body = list
        .map((r: any) =>
          [
            r.id,
            r.requestId,
            r.apiKey,
            r.apiSlug,
            r.publicPath,
            r.method,
            r.originalUrl,
            r.finalUrl,
            r.statusCode,
            r.durationMs,
            r.createdAt,
            r.responseAt,
          ]
            .map(esc)
            .join(','),
        )
        .join('\n');
      return `${header}\n${body}\n`;
    }

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="openroutex-logs.json"');
    return list;
  }

  @Get('endpoints')
  endpoints(
    @Query('api') apiSlug?: string,
    @Query('path') publicPath?: string,
    @Query('method') method?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const api = this.normalizeApiSlug(apiSlug);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const statusRaw = String(status ?? '').trim();
    const statusNum = statusRaw && /^\d+$/.test(statusRaw) ? Number(statusRaw) : null;
    const statusClass = statusNum === null && statusRaw ? statusRaw.toLowerCase() : undefined;
    return this.logs.endpointReport({
      apiSlug: api,
      publicPath,
      method,
      statusCode: statusNum === null ? undefined : statusNum,
      status: statusClass,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('heatmap')
  heatmap(
    @Query('api') apiSlug?: string,
    @Query('path') publicPath?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tz') tz?: string,
  ) {
    const api = this.normalizeApiSlug(apiSlug);
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.logs.heatmap({
      apiSlug: api,
      publicPath,
      timezone: tz,
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.logs.get(id);
  }
}
