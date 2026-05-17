import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { ApisService } from './apis.service';
import { CreateApiDto, UpdateApiDto } from './dto/api.dto';

@Controller('/admin/apis')
export class ApisController {
  constructor(private readonly apis: ApisService) {}

  @Get()
  list() {
    return this.apis.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.apis.get(id);
  }

  @Post()
  create(@Body() dto: CreateApiDto) {
    return this.apis.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateApiDto) {
    return this.apis.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.apis.remove(id);
  }
}

