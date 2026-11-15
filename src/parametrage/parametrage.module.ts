/**
 * =============================================================================
 * MODULE 01 — PARAMÉTRAGE
 * =============================================================================
 * Regroupe les données de référence utilisées par tous les autres modules :
 *   - types de centres      (/api/types-centre)
 *   - centres de santé      (/api/centres)
 *   - fournisseurs          (/api/fournisseurs)
 *   - familles de produits  (/api/familles)
 *   - formes de médicaments (/api/formes-medicament)
 *   - unités de vente       (/api/unites-vente)
 *   - fonctions du personnel (/api/fonctions)
 *   - médicaments           (/api/medicaments)
 *   - prix d'achat / vente  (/api/prix)
 *   - paramètres généraux   (/api/parametres)
 *
 * Les services PrixService et ParametresService sont "exportés" : les autres
 * modules (livraisons, consommations, facturation...) pourront les utiliser.
 * =============================================================================
 */
import { Module } from '@nestjs/common';
import { TypesCentreController } from './types-centre/types-centre.controller';
import { TypesCentreService } from './types-centre/types-centre.service';
import { CentresController } from './centres/centres.controller';
import { CentresService } from './centres/centres.service';
import { FournisseursController } from './fournisseurs/fournisseurs.controller';
import { FournisseursService } from './fournisseurs/fournisseurs.service';
import { FamillesController } from './familles/familles.controller';
import { FamillesService } from './familles/familles.service';
import { FormesMedicamentController } from './formes-medicament/formes-medicament.controller';
import { FormesMedicamentService } from './formes-medicament/formes-medicament.service';
import { UnitesVenteController } from './unites-vente/unites-vente.controller';
import { UnitesVenteService } from './unites-vente/unites-vente.service';
import { FonctionsController } from './fonctions/fonctions.controller';
import { FonctionsService } from './fonctions/fonctions.service';
import { MedicamentsController } from './medicaments/medicaments.controller';
import { MedicamentsService } from './medicaments/medicaments.service';
import { PrixController } from './prix/prix.controller';
import { PrixService } from './prix/prix.service';
import { ParametresController } from './parametres/parametres.controller';
import { ParametresService } from './parametres/parametres.service';

@Module({
  controllers: [
    TypesCentreController,
    CentresController,
    FournisseursController,
    FamillesController,
    FormesMedicamentController,
    UnitesVenteController,
    FonctionsController,
    MedicamentsController,
    PrixController,
    ParametresController,
  ],
  providers: [
    TypesCentreService,
    CentresService,
    FournisseursService,
    FamillesService,
    FormesMedicamentService,
    UnitesVenteService,
    FonctionsService,
    MedicamentsService,
    PrixService,
    ParametresService,
  ],
  exports: [PrixService, ParametresService],
})
export class ParametrageModule {}
