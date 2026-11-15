/**
 * MODULE 03 — APPROVISIONNEMENTS ET ACHATS DU DISTRICT
 *   - commandes fournisseurs   (commandes.service.ts)
 *   - réceptions + entrée en stock du dépôt (receptions.service.ts)
 *   - historique des achats, pièces justificatives
 */
import { Module } from '@nestjs/common';
import { AchatsController } from './achats.controller';
import { CommandesService } from './commandes.service';
import { ReceptionsService } from './receptions.service';
import { PiecesJointesService } from '../common/pieces-jointes.service';

@Module({
  controllers: [AchatsController],
  providers: [CommandesService, ReceptionsService, PiecesJointesService],
})
export class AchatsModule {}
