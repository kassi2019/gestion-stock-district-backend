/**
 * MODULE 04 — GESTION DU DÉPÔT ET DES STOCKS
 *   - état du stock, mouvements, fiche de stock, mouvements manuels (stock.service.ts)
 *   - inventaire PAR LOT (comptage, rattachement, fiche d'inventaire) : stock.service.ts
 *   - sortie automatique des lots périmés, chaque nuit (perimes-auto.service.ts)
 * StockService est exporté : les modules Livraisons, etc. utiliseront
 * appliquerMouvement() pour faire sortir le stock.
 */
import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { PerimesAutoService } from './perimes-auto.service';
import { PiecesJointesService } from '../common/pieces-jointes.service';

import { InventaireInitialController } from './inventaire-initial.controller';
import { InventaireInitialService } from './inventaire-initial.service';

@Module({
  controllers: [StockController, InventaireInitialController],
  providers: [StockService, PiecesJointesService, PerimesAutoService, InventaireInitialService],
  exports: [StockService],
})
export class StockModule {}
