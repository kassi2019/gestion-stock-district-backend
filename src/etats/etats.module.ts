/**
 * MODULE 09 — TABLEAU DE BORD ET ÉTATS (cahier des charges §3.8), lecture seule.
 * Utilise StockService (état valorisé du stock, alertes).
 */
import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { EtatsController } from './etats.controller';
import { EtatsService } from './etats.service';

@Module({
  imports: [StockModule],
  controllers: [EtatsController],
  providers: [EtatsService],
})
export class EtatsModule {}
