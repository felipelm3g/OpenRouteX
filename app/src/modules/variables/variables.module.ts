import { Module } from '@nestjs/common';

import { VariableResolverService } from '../../core/variable-resolver/variable-resolver.service';

@Module({
  providers: [VariableResolverService],
  exports: [VariableResolverService],
})
export class VariablesModule {}

