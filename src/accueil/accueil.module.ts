/**
 * PAGE D'ACCUEIL : chiffres clés et badges des tuiles, calculés depuis la base.
 * Utilise StockService (valeur du stock, alertes).
 */
import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { AccueilController } from './accueil.controller';
import { AccueilService } from './accueil.service';

@Module({
  imports: [StockModule],
  controllers: [AccueilController],
  providers: [AccueilService],
})
export class AccueilModule {}
