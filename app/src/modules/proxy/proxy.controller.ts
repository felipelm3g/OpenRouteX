import { All, Controller, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { ProxyService } from './proxy.service';

@Controller()
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @All('/:api')
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    await this.proxy.handle(req, res, { apiSlug: req.params.api, publicPath: '/' });
  }

  @All('/:api/*')
  async proxyAny(@Req() req: Request, @Res() res: Response) {
    const rest = (req.params as any)[0] as string | undefined;
    const publicPath = `/${rest ?? ''}`.replace(/\/+$/, '') || '/';
    await this.proxy.handle(req, res, { apiSlug: req.params.api, publicPath });
  }
}
