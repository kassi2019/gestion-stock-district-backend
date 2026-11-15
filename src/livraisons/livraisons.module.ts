/**
 * MODULE 05 — GESTION DES CENTRES DE SANTÉ, COMMANDES ET LIVRAISONS
 *   - commandes des centres + disponibilités du dépôt (commandes-centre.service.ts)
 *   - bons de livraison : préparation (lots), validation = sortie du dépôt et
 *     stock théorique du centre (livraisons.service.ts)
 *   - fiche d'un centre : stock théorique, livraisons, mouvements
 * Utilise PrixService (prix de vente applicable) et StockService (sorties du dépôt).
 */
import { Module } from '@nestjs/common';
import { ParametrageModule } from '../parametrage/parametrage.module';
import { StockModule } from '../stock/stock.module';
import { PiecesJointesService } from '../common/pieces-jointes.service';
import { LivraisonsController } from './livraisons.controller';
import { CommandesCentreService } from './commandes-centre.service';
import { LivraisonsService } from './livraisons.service';

@Module({
  imports: [ParametrageModule, StockModule],
  controllers: [LivraisonsController],
  providers: [CommandesCentreService, LivraisonsService, PiecesJointesService],
})
export class LivraisonsModule {}
