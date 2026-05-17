import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { AuthService } from './auth.service';
import { CreateAuthDto, UpdateAuthDto } from './dto/auth.dto';

@Controller('/admin/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list() {
    return this.auth.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.auth.get(id);
  }

  @Post()
  create(@Body() dto: CreateAuthDto) {
    return this.auth.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAuthDto) {
    return this.auth.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.auth.remove(id);
  }
}

