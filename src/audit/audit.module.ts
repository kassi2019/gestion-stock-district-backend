/**
 * Module du journal d'audit.
 * "@Global()" : AuditService est utilisable dans tous les modules
 * sans réimporter AuditModule.
 */
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
