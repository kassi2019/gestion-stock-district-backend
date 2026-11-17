/**
 * =============================================================================
 * ROUTES DU RAPPORT CENTRE DE SANTÉ (spec nov. 2026, §5)
 * =============================================================================
 * Droit « Voir » sur le module Consommations :
 *   GET    /api/rapports-centre                     liste (?centreId=&annee=&mois=&statut=)
 *   GET    /api/rapports-centre/suivi?annee=2026     tableau centres × mois
 *   GET    /api/rapports-centre/:id                 un rapport (colonnes calculées, stock district, transferts)
 *
 * Droit « Modifier » sur le module Consommations :
 *   POST   /api/rapports-centre                     ouvrir (ou créer) { centreId, annee, mois }
 *   PUT    /api/rapports-centre/:id                 enregistrer le brouillon { lignes, observations }
 *   POST   /api/rapports-centre/:id/valider         VALIDER (même corps) : stock du centre (pas de facture)
 *   DELETE /api/rapports-centre/:id                 supprimer un brouillon
 *   POST   /api/rapports-centre/:id/transferts      transfert cédé à un autre centre
 *   DELETE /api/rapports-centre/transferts/:id      supprimer un transfert
 *
 * Module Facturation (facture générée) :
 *   GET    /api/rapports-centre/facture-generee?centreId=&annee=&mois=   proposition (Voir)
 *   POST   /api/rapports-centre/:id/facture-generee  { lignes: [{ medicamentId, quantite }] }  (Modifier)
 *
 * ADMINISTRATEUR seulement :
 *   POST   /api/rapports-centre/:id/rouvrir         rouvrir un rapport validé { motif }
 * =============================================================================
 */
import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Acces } from '../auth/droits';
import { Roles } from '../auth/roles.decorator';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { ROLES } from '../common/constants';
import { RapportsCentreService } from './rapports-centre.service';
import { CreerTransfertDto, EnregistrerRapportCentreDto, GenererFactureDto, OuvrirRapportCentreDto, RouvrirRapportDto } from './rapports-centre.dto';

function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('rapports-centre')
export class RapportsCentreController {
  constructor(private service: RapportsCentreService) {}

  @Acces('consommations', 'LECTURE')
  @Get()
  lister(@Query('centreId') centreId?: string, @Query('annee') annee?: string, @Query('mois') mois?: string, @Query('statut') statut?: string) {
    return this.service.lister({ centreId: nombre(centreId), annee: nombre(annee), mois: nombre(mois), statut: statut || undefined });
  }

  @Acces('consommations', 'LECTURE')
  @Get('suivi')
  suivi(@Query('annee') annee?: string) {
    return this.service.suivi(nombre(annee) ?? new Date().getFullYear());
  }

  /** Proposition de facture générée (déclarée avant « :id »). */
  @Acces('facturation', 'LECTURE')
  @Get('facture-generee')
  propositionFacture(@Query('centreId') centreId?: string, @Query('annee') annee?: string, @Query('mois') mois?: string) {
    if (!nombre(centreId) || !nombre(annee) || !nombre(mois)) throw new BadRequestException('Choisissez le centre et la période.');
    return this.service.propositionFacture(Number(centreId), Number(annee), Number(mois));
  }

  @Acces('facturation', 'MODIFICATION')
  @Post(':id/facture-generee')
  genererFacture(@Param('id', ParseIntPipe) id: number, @Body() dto: GenererFactureDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.genererFacture(id, dto, moi.id);
  }

  @Acces('consommations', 'LECTURE')
  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.service.trouver(id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post()
  ouvrir(@Body() dto: OuvrirRapportCentreDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.ouvrir(dto, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Put(':id')
  enregistrer(@Param('id', ParseIntPipe) id: number, @Body() dto: EnregistrerRapportCentreDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.enregistrer(id, dto, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post(':id/valider')
  valider(@Param('id', ParseIntPipe) id: number, @Body() dto: EnregistrerRapportCentreDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.valider(id, dto, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Delete('transferts/:id')
  supprimerTransfert(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.supprimerTransfert(id, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.supprimer(id, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post(':id/transferts')
  ajouterTransfert(@Param('id', ParseIntPipe) id: number, @Body() dto: CreerTransfertDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.ajouterTransfert(id, dto, moi.id);
  }

  /** Réservé à l'administrateur du district (motif tracé). */
  @Roles(ROLES.ADMIN)
  @Post(':id/rouvrir')
  rouvrir(@Param('id', ParseIntPipe) id: number, @Body() dto: RouvrirRapportDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.rouvrir(id, dto.motif, moi.id);
  }
}
