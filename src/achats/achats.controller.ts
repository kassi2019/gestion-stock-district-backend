/**
 * =============================================================================
 * ROUTES DU MODULE 03 — APPROVISIONNEMENTS ET ACHATS
 * =============================================================================
 * Droit « Voir » sur le module Achats :
 *   GET   /api/achats/receptions                liste (?fournisseurId=&statut=&du=&au=)
 *   GET   /api/achats/receptions/:id            une réception avec ses lignes
 *   GET   /api/achats/prix-achat                prix d'achat repris des paramètres
 *                                               (?fournisseurId=&date=AAAA-MM-JJ&medicamentIds=1,2,3)
 *   GET   /api/achats/historique                historique des achats (?fournisseurId=&medicamentId=&du=&au=)
 *   GET   /api/achats/pieces/:type/:id          pièces jointes d'un document
 *   GET   /api/achats/pieces/:id/fichier        télécharger une pièce jointe
 *
 * Droit « Modifier » sur le module Achats :
 *   POST  /api/achats/receptions                créer (brouillon)
 *   PATCH /api/achats/receptions/:id            modifier (brouillon)
 *   POST  /api/achats/receptions/:id/valider    VALIDER = entrée en stock
 *   POST  /api/achats/receptions/:id/annuler    annuler (brouillon)
 *   POST  /api/achats/pieces/:type/:id          ajouter une pièce jointe (fichier « fichier »)
 *   DELETE /api/achats/pieces/:id               supprimer une pièce jointe
 *   (:type = Reception)
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
import { FichierRecu, PIECES_ACHATS, PiecesJointesService, TAILLE_MAX_PIECE } from '../common/pieces-jointes.service';
import { ReceptionsService } from './receptions.service';
import { CreerReceptionDto, ModifierReceptionDto } from './achats.dto';

/** Nombre facultatif lu dans l'adresse (?fournisseurId=3) ; vide = undefined. */
function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('achats')
export class AchatsController {
  constructor(
    private receptions: ReceptionsService,
    private pieces: PiecesJointesService,
  ) {}

  // ===========================================================================
  // RÉCEPTIONS
  // ===========================================================================

  @Acces('achats', 'LECTURE')
  @Get('receptions')
  listerReceptions(
    @Query('fournisseurId') fournisseurId?: string,
    @Query('statut') statut?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.receptions.lister({ fournisseurId: nombre(fournisseurId), statut, du, au });
  }

  /** Prix d'achat applicables (affichés, non modifiables, dans l'écran de saisie). */
  @Acces('achats', 'LECTURE')
  @Get('prix-achat')
  prixAchat(
    @Query('medicamentIds') medicamentIds?: string,
    @Query('fournisseurId') fournisseurId?: string,
    @Query('date') date?: string,
  ) {
    const ids = (medicamentIds || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return this.receptions.prixAchat(ids, nombre(fournisseurId), date);
  }

  @Acces('achats', 'LECTURE')
  @Get('receptions/:id')
  trouverReception(@Param('id', ParseIntPipe) id: number) {
    return this.receptions.trouver(id);
  }

  @Acces('achats', 'MODIFICATION')
  @Post('receptions')
  creerReception(@Body() dto: CreerReceptionDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.receptions.creer(dto, moi.id);
  }

  @Acces('achats', 'MODIFICATION')
  @Patch('receptions/:id')
  modifierReception(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifierReceptionDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.receptions.modifier(id, dto, moi.id);
  }

  @Acces('achats', 'MODIFICATION')
  @Post('receptions/:id/valider')
  validerReception(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.receptions.valider(id, moi.id);
  }

  @Acces('achats', 'MODIFICATION')
  @Post('receptions/:id/annuler')
  annulerReception(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.receptions.annuler(id, moi.id);
  }

  // ===========================================================================
  // HISTORIQUE DES ACHATS
  // ===========================================================================

  @Acces('achats', 'LECTURE')
  @Get('historique')
  historique(
    @Query('fournisseurId') fournisseurId?: string,
    @Query('medicamentId') medicamentId?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.receptions.historique({ fournisseurId: nombre(fournisseurId), medicamentId: nombre(medicamentId), du, au });
  }

  // ===========================================================================
  // PIÈCES JUSTIFICATIVES
  // ===========================================================================

  // ⚠ Route « :id/fichier » placée AVANT « :type/:id » pour ne pas être confondue
  @Acces('achats', 'LECTURE')
  @Get('pieces/:id/fichier')
  async telechargerPiece(@Param('id', ParseIntPipe) id: number, @Res() reponse: Response) {
    const { piece, chemin } = await this.pieces.fichier(id, PIECES_ACHATS);
    reponse.setHeader('Content-Type', piece.mimeType || 'application/octet-stream');
    reponse.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(piece.nomFichier)}"`);
    reponse.sendFile(chemin);
  }

  @Acces('achats', 'LECTURE')
  @Get('pieces/:type/:id')
  listerPieces(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.pieces.lister(type, id, PIECES_ACHATS);
  }

  @Acces('achats', 'MODIFICATION')
  @Post('pieces/:type/:id')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_PIECE } }))
  ajouterPiece(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() fichier: FichierRecu,
    @Body('libelle') libelle: string,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.pieces.ajouter(type, id, fichier, libelle, moi.id, PIECES_ACHATS);
  }

  @Acces('achats', 'MODIFICATION')
  @Delete('pieces/:id')
  supprimerPiece(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.pieces.supprimer(id, moi.id, PIECES_ACHATS);
  }
}
