/**
 * MODULE 08 — SUPERVISIONS ET INVENTAIRES DANS LES CENTRES (cahier des charges §3.7)
 *   constat (stock théorique à la date / physique / écarts valorisés) ->
 *   validation -> décision (aucune suite, régularisation du stock, facturation).
 * Utilise PrixService (prix de vente applicable pour valoriser les écarts).
 */
import { Module } from '@nestjs/common';
import { ParametrageModule } from '../parametrage/parametrage.module';
import { PiecesJointesService } from '../common/pieces-jointes.service';
import { SupervisionsController } from './supervisions.controller';
import { SupervisionsService } from './supervisions.service';

@Module({
  imports: [ParametrageModule],
  controllers: [SupervisionsController],
  providers: [SupervisionsService, PiecesJointesService],
})
export class SupervisionsModule {}
