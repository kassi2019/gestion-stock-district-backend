/**
 * =============================================================================
 * ROUTES DU MODULE 07 — FACTURATION ET COMPTES CLIENTS
 * =============================================================================
 * Deux tuiles, donc deux droits :
 *
 * FACTURATION (module « facturation ») :
 *   GET   /api/facturation/factures               liste (?centreId=&statut=&du=&au=&nonSoldees=1)
 *   GET   /api/facturation/factures/:id           une facture (lignes, paiements imputés)
 *   GET   /api/facturation/a-facturer             rapports validés non facturés
 *   GET   /api/facturation/sortie-infos           stock district + prix de vente (?centreId=&date=&medicamentIds=1,2)
 *   POST  /api/facturation/factures/manuelle      facture-sortie manuelle { centreId, dateEmission, lignes } (Modifier)
 *   POST  /api/facturation/factures/generer       { rapportIds, dateEmission? } — ancien circuit (Modifier)
 *   POST  /api/facturation/factures/:id/annuler   { motif }                       (Modifier)
 *
 * PAIEMENTS ET COMPTES (module « paiements ») :
 *   GET   /api/paiements                          liste (?centreId=&du=&au=&mode=&avecAvance=1)
 *   GET   /api/paiements/:id                      un paiement (reçu)
 *   GET   /api/paiements/factures-non-soldees/:centreId
 *   GET   /api/paiements/situation                situation de tous les centres
 *   GET   /api/paiements/releve/:centreId         relevé de compte (?du=&au=)
 *   POST  /api/paiements                          enregistrer un paiement / une avance (Modifier)
 *   POST  /api/paiements/:id/imputer              imputer une avance sur des factures (Modifier)
 *   POST  /api/paiements/imputer-avances/:factureId  avances du centre -> facture (Modifier)
 *   POST  /api/paiements/:id/annuler              { motif }                       (Modifier)
 * =============================================================================
 */
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Acces } from '../auth/droits';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { FacturesService } from './factures.service';
import { SortiesService } from './sorties.service';
import { ORIGINE_FACTURE } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { PaiementsService } from './paiements.service';
import { AnnulerDto, CreerFactureManuelleDto, CreerPaiementDto, GenererFacturesDto, ImputerDto } from './facturation.dto';

function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('facturation')
export class FacturationController {
  constructor(
    private factures: FacturesService,
    private sorties: SortiesService,
  ) {}

  /** Stock disponible au district et prix de vente, pour l'écran de saisie. */
  @Acces('facturation', 'LECTURE')
  @Get('sortie-infos')
  sortieInfos(@Query('medicamentIds') medicamentIds?: string, @Query('centreId') centreId?: string, @Query('date') date?: string) {
    const ids = (medicamentIds || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return this.sorties.infos(ids, nombre(centreId), date ? texteVersDate(date) : new Date());
  }

  /** Facture MANUELLE : sortie immédiate du stock du district. */
  @Acces('facturation', 'MODIFICATION')
  @Post('factures/manuelle')
  async creerManuelle(@Body() dto: CreerFactureManuelleDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    const id = await this.sorties.creer(
      { centreId: dto.centreId, dateEmission: texteVersDate(dto.dateEmission), origine: ORIGINE_FACTURE.MANUELLE, lignes: dto.lignes },
      moi.id,
    );
    return this.factures.trouver(id);
  }

  @Acces('facturation', 'LECTURE')
  @Get('factures')
  lister(
    @Query('centreId') centreId?: string,
    @Query('statut') statut?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
    @Query('nonSoldees') nonSoldees?: string,
  ) {
    return this.factures.lister({ centreId: nombre(centreId), statut: statut || undefined, du, au, nonSoldees: nonSoldees === '1' });
  }

  @Acces('facturation', 'LECTURE')
  @Get('a-facturer')
  aFacturer() {
    return this.factures.aFacturer();
  }

  @Acces('facturation', 'LECTURE')
  @Get('factures/:id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.factures.trouver(id);
  }

  @Acces('facturation', 'MODIFICATION')
  @Post('factures/generer')
  generer(@Body() dto: GenererFacturesDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.factures.generer(dto.rapportIds, dto.dateEmission, moi.id);
  }

  @Acces('facturation', 'MODIFICATION')
  @Post('factures/:id/annuler')
  annuler(@Param('id', ParseIntPipe) id: number, @Body() dto: AnnulerDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.factures.annuler(id, dto.motif, moi.id);
  }
}

@Controller('paiements')
export class PaiementsController {
  constructor(private paiements: PaiementsService) {}

  @Acces('paiements', 'LECTURE')
  @Get()
  lister(
    @Query('centreId') centreId?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
    @Query('mode') mode?: string,
    @Query('avecAvance') avecAvance?: string,
  ) {
    return this.paiements.lister({ centreId: nombre(centreId), du, au, mode: mode || undefined, avecAvance: avecAvance === '1' });
  }

  @Acces('paiements', 'LECTURE')
  @Get('situation')
  situation() {
    return this.paiements.situation();
  }

  @Acces('paiements', 'LECTURE')
  @Get('releve/:centreId')
  releve(@Param('centreId', ParseIntPipe) centreId: number, @Query('du') du?: string, @Query('au') au?: string) {
    return this.paiements.releve(centreId, du || undefined, au || undefined);
  }

  @Acces('paiements', 'LECTURE')
  @Get('factures-non-soldees/:centreId')
  facturesNonSoldees(@Param('centreId', ParseIntPipe) centreId: number) {
    return this.paiements.facturesNonSoldees(centreId);
  }

  @Acces('paiements', 'LECTURE')
  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.paiements.trouver(id);
  }

  @Acces('paiements', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerPaiementDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.paiements.creer(dto, moi.id);
  }

  @Acces('paiements', 'MODIFICATION')
  @Post('imputer-avances/:factureId')
  imputerAvances(@Param('factureId', ParseIntPipe) factureId: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.paiements.imputerAvancesSurFacture(factureId, moi.id);
  }

  @Acces('paiements', 'MODIFICATION')
  @Post(':id/imputer')
  imputer(@Param('id', ParseIntPipe) id: number, @Body() dto: ImputerDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.paiements.imputer(id, dto.imputations, moi.id);
  }

  @Acces('paiements', 'MODIFICATION')
  @Post(':id/annuler')
  annuler(@Param('id', ParseIntPipe) id: number, @Body() dto: AnnulerDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.paiements.annuler(id, dto.motif, moi.id);
  }
}
