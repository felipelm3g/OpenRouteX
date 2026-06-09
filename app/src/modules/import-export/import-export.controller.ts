import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';

import { ImportExportService } from './import-export.service';

@Controller('/admin/import-export')
export class ImportExportController {
  constructor(private readonly svc: ImportExportService) {}

  @Get('/history')
  history() {
    return this.svc.history();
  }

  @Post('/export')
  export(@Body() body: any, @Req() req: any) {
    const username = String(req?.orxUser?.username ?? 'unknown');
    return this.svc.export({ selection: body?.selection ?? { apis: [] }, username });
  }

  @Post('/import')
  import(@Body() body: any, @Req() req: any) {
    const userIdRaw = req?.orxUser?.userId;
    const userId = userIdRaw ? String(userIdRaw) : null;
    const username = String(req?.orxUser?.username ?? 'unknown');
    return this.svc.import({ file: body?.file, userId, username });
  }

  @Post('/history/:id/undo')
  undo(@Param('id') id: string, @Req() req: any) {
    const userIdRaw = req?.orxUser?.userId;
    const userId = userIdRaw ? String(userIdRaw) : null;
    const username = String(req?.orxUser?.username ?? 'unknown');
    return this.svc.undo({ id, userId, username });
  }
}

