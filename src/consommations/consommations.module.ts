/**
 * MODULE 06 — RAPPORTS MENSUELS DE CONSOMMATION (cahier des charges §3.5)
 *   - saisie des quantités déclarées par les centres, valorisation au prix de vente ;
 *   - vérification sur place par l'agent du district (quantités constatées) ;
 *   - validation = déduction du stock théorique du centre ;
 *   - tableau de suivi des déclarations (centres × mois).
 * Utilise PrixService (prix de vente applicable).
 *
 * SPEC NOV. 2026 : RAPPORT CENTRE DE SANTÉ (rapports-centre.*) — saisi par le
 * district, calcule SI, R, SDU, CMM et la quantité à livrer ; sa validation
 * génère la facture-sortie (FacturationModule). L'ancien circuit (déclaration
 * du centre, vérification sur place) reste pour les anciens rapports.
 */
import { Module } from '@nestjs/common';
import { ParametrageModule } from '../parametrage/parametrage.module';
import { PiecesJointesService } from '../common/pieces-jointes.service';
import { ConsommationsController } from './consommations.controller';
import { ConsommationsService } from './consommations.service';
import { FacturationModule } from '../facturation/facturation.module';
import { RapportsCentreController } from './rapports-centre.controller';
import { RapportsCentreService } from './rapports-centre.service';

@Module({
  imports: [ParametrageModule, FacturationModule],
  controllers: [ConsommationsController, RapportsCentreController],
  providers: [ConsommationsService, PiecesJointesService, RapportsCentreService],
  exports: [ConsommationsService],
})
export class ConsommationsModule {}
