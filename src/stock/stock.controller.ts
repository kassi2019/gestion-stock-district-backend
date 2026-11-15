/**
 * =============================================================================
 * ROUTES DU MODULE 04 — GESTION DU DÉPÔT ET DES STOCKS
 * =============================================================================
 * Droit « Voir » sur le module Stock :
 *   GET   /api/stock/etat                         stock par médicament et par lot (valorisé)
 *   GET   /api/stock/mouvements                   historique (?medicamentId=&type=&du=&au=)
 *   GET   /api/stock/fiche/:medicamentId          fiche de stock (?du=&au=)
 *   GET   /api/stock/alertes/resume               résumé des alertes (accueil)
 *   GET   /api/stock/inventaire/fiche             fiche d'inventaire (?du=&au=) : lots comptés sur la période
 *   GET   /api/stock/pieces/:type/:id             pièces jointes (type : MouvementStock)
 *   GET   /api/stock/pieces/:id/fichier           télécharger une pièce jointe
 *
 * Droit « Modifier » sur le module Stock :
 *   POST  /api/stock/mouvements                   mouvement manuel (ajustement, périmés, transfert)
 *   POST  /api/stock/perimes/sortir               sortir TOUS les lots périmés (motif, n° de PV)
 *   PATCH /api/stock/seuil/:medicamentId          modifier le seuil d'alerte d'un médicament
 *   POST  /api/stock/inventaire/comptage          valider le comptage d'un ou plusieurs lots
 *   POST  /api/stock/inventaire/rattacher         rattacher du stock « sans lot » à un lot
 *   POST  /api/stock/pieces/:type/:id             ajouter une pièce jointe (fichier « fichier »)
 *   DELETE /api/stock/pieces/:id                  supprimer une pièce jointe
 * =============================================================================
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Acces } from '../auth/droits';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { FichierRecu, PIECES_STOCK, PiecesJointesService, TAILLE_MAX_PIECE } from '../common/pieces-jointes.service';
import { StockService } from './stock.service';
import { ComptageDto, CreerMouvementDto, RattacherDto, SeuilAlerteDto, SortiePerimesDto } from './stock.dto';

function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('stock')
export class StockController {
  constructor(
    private stock: StockService,
    private pieces: PiecesJointesService,
  ) {}

  // ===========================================================================
  // ÉTAT, MOUVEMENTS, FICHE DE STOCK
  // ===========================================================================

  @Acces('stock', 'LECTURE')
  @Get('etat')
  etat() {
    return this.stock.etat();
  }

  @Acces('stock', 'LECTURE')
  @Get('mouvements')
  mouvements(
    @Query('medicamentId') medicamentId?: string,
    @Query('type') type?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.stock.mouvements({ medicamentId: nombre(medicamentId), type, du, au });
  }

  @Acces('stock', 'MODIFICATION')
  @Post('mouvements')
  creerMouvement(@Body() dto: CreerMouvementDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.stock.creerMouvement(dto, moi.id);
  }

  /** Sortie de TOUS les lots périmés encore en stock (bouton des Alertes). */
  @Acces('stock', 'MODIFICATION')
  @Post('perimes/sortir')
  sortirPerimes(@Body() dto: SortiePerimesDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.stock.sortirLotsPerimes(moi.id, { motif: dto.motif, pieceRef: dto.pieceRef, origine: 'MANUEL' });
  }

  /** Seuil d'alerte d'un médicament (modifiable depuis Stock > État). */
  @Acces('stock', 'MODIFICATION')
  @Patch('seuil/:medicamentId')
  modifierSeuil(
    @Param('medicamentId', ParseIntPipe) medicamentId: number,
    @Body() dto: SeuilAlerteDto,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.stock.modifierSeuil(medicamentId, dto.seuilAlerte, moi.id);
  }

  /** Résumé des alertes de stock (accueil). */
  @Acces('stock', 'LECTURE')
  @Get('alertes/resume')
  resumeAlertes() {
    return this.stock.resumeAlertes();
  }

  @Acces('stock', 'LECTURE')
  @Get('fiche/:medicamentId')
  fiche(@Param('medicamentId', ParseIntPipe) medicamentId: number, @Query('du') du?: string, @Query('au') au?: string) {
    return this.stock.ficheStock(medicamentId, du, au);
  }

  // ===========================================================================
  // INVENTAIRE PAR LOT
  // ===========================================================================

  @Acces('stock', 'MODIFICATION')
  @Post('inventaire/comptage')
  comptage(@Body() dto: ComptageDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.stock.comptage(dto, moi.id);
  }

  @Acces('stock', 'MODIFICATION')
  @Post('inventaire/rattacher')
  rattacher(@Body() dto: RattacherDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.stock.rattacher(dto, moi.id);
  }

  @Acces('stock', 'LECTURE')
  @Get('inventaire/fiche')
  ficheInventaire(@Query('du') du?: string, @Query('au') au?: string) {
    return this.stock.ficheInventaire(du, au);
  }

  // ===========================================================================
  // PIÈCES JUSTIFICATIVES (mouvements, inventaires)
  // ===========================================================================

  @Acces('stock', 'LECTURE')
  @Get('pieces/:id/fichier')
  async telechargerPiece(@Param('id', ParseIntPipe) id: number, @Res() reponse: Response) {
    const { piece, chemin } = await this.pieces.fichier(id, PIECES_STOCK);
    reponse.setHeader('Content-Type', piece.mimeType || 'application/octet-stream');
    reponse.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(piece.nomFichier)}"`);
    reponse.sendFile(chemin);
  }

  @Acces('stock', 'LECTURE')
  @Get('pieces/:type/:id')
  listerPieces(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.pieces.lister(type, id, PIECES_STOCK);
  }

  @Acces('stock', 'MODIFICATION')
  @Post('pieces/:type/:id')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_PIECE } }))
  ajouterPiece(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() fichier: FichierRecu,
    @Body('libelle') libelle: string,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.pieces.ajouter(type, id, fichier, libelle, moi.id, PIECES_STOCK);
  }

  @Acces('stock', 'MODIFICATION')
  @Delete('pieces/:id')
  supprimerPiece(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.pieces.supprimer(id, moi.id, PIECES_STOCK);
  }
}
