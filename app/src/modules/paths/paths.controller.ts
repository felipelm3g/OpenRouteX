import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CreatePathDto, UpdatePathDto } from './dto/path.dto';
import { PathsService } from './paths.service';

@Controller('/admin/paths')
export class PathsController {
  constructor(private readonly paths: PathsService) {}

  @Get()
  list(@Query('apiId') apiId?: string) {
    return this.paths.list({ apiId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.paths.get(id);
  }

  @Post()
  create(@Body() dto: CreatePathDto) {
    return this.paths.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePathDto) {
    return this.paths.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paths.remove(id);
  }
}

