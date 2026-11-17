/**
 * MODULE 03 — RÉCEPTION FOURNISSEURS (spec nov. 2026)
 *   - réceptions + entrée en stock du district (receptions.service.ts)
 *   - historique des achats, pièces justificatives
 * Les commandes du district se font dans l'application nationale.
 * Utilise PrixService (prix d'achat applicable, repris des paramètres).
 */
import { Module } from '@nestjs/common';
import { ParametrageModule } from '../parametrage/parametrage.module';
import { AchatsController } from './achats.controller';
import { ReceptionsService } from './receptions.service';
import { PiecesJointesService } from '../common/pieces-jointes.service';

@Module({
  imports: [ParametrageModule],
  controllers: [AchatsController],
  providers: [ReceptionsService, PiecesJointesService],
})
export class AchatsModule {}
