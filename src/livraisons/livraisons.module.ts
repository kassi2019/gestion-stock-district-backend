/**
 * MODULE 05 — HISTORIQUE DES LIVRAISONS ET STOCK DES CENTRES (lecture seule)
 * Spec nov. 2026 : plus de commandes des centres ni de nouveaux bons de livraison ;
 * les sorties vers les centres se font par facture (module Facturation).
 */
import { Module } from '@nestjs/common';
import { PiecesJointesService } from '../common/pieces-jointes.service';
import { LivraisonsController } from './livraisons.controller';
import { LivraisonsService } from './livraisons.service';

@Module({
  controllers: [LivraisonsController],
  providers: [LivraisonsService, PiecesJointesService],
})
export class LivraisonsModule {}
