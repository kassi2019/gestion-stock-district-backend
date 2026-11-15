/**
 * MODULE 06 — RAPPORTS MENSUELS DE CONSOMMATION (cahier des charges §3.5)
 *   - saisie des quantités déclarées par les centres, valorisation au prix de vente ;
 *   - vérification sur place par l'agent du district (quantités constatées) ;
 *   - validation = déduction du stock théorique du centre ;
 *   - tableau de suivi des déclarations (centres × mois).
 * Utilise PrixService (prix de vente applicable).
 */
import { Module } from '@nestjs/common';
import { ParametrageModule } from '../parametrage/parametrage.module';
import { PiecesJointesService } from '../common/pieces-jointes.service';
import { ConsommationsController } from './consommations.controller';
import { ConsommationsService } from './consommations.service';

@Module({
  imports: [ParametrageModule],
  controllers: [ConsommationsController],
  providers: [ConsommationsService, PiecesJointesService],
  exports: [ConsommationsService],
})
export class ConsommationsModule {}
