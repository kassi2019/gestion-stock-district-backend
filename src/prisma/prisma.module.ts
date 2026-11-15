/**
 * Module Prisma.
 * "@Global()" signifie que PrismaService est disponible dans TOUS les modules
 * sans avoir besoin de réimporter PrismaModule à chaque fois.
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
