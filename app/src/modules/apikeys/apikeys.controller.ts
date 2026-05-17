import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { ApiKeysService } from './apikeys.service';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/apikey.dto';

@Controller('/admin/apikeys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list() {
    return this.apiKeys.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.apiKeys.get(id);
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateApiKeyDto) {
    return this.apiKeys.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.apiKeys.remove(id);
  }
}
