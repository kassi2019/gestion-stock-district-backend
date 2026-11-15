/**
 * MODULE 07 — FACTURATION ET COMPTES CLIENTS (cahier des charges §3.6)
 *   - factures générées à partir des rapports de consommation validés ;
 *   - paiements totaux ou partiels, avances et leur imputation ;
 *   - situation et relevé de compte de chaque centre.
 * Deux tuiles / deux droits : « facturation » et « paiements ».
 */
import { Module } from '@nestjs/common';
import { FacturationController, PaiementsController } from './facturation.controller';
import { FacturesService } from './factures.service';
import { PaiementsService } from './paiements.service';

@Module({
  controllers: [FacturationController, PaiementsController],
  providers: [FacturesService, PaiementsService],
})
export class FacturationModule {}
