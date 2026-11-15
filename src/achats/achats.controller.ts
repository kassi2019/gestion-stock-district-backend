/**
 * =============================================================================
 * ROUTES DU MODULE 03 — APPROVISIONNEMENTS ET ACHATS
 * =============================================================================
 * Droit « Voir » sur le module Achats :
 *   GET   /api/achats/commandes                 liste (?fournisseurId=&statut=&du=&au=)
 *   GET   /api/achats/commandes/:id             une commande avec ses lignes
 *   GET   /api/achats/receptions                liste (?fournisseurId=&commandeId=&statut=&du=&au=)
 *   GET   /api/achats/receptions/:id            une réception avec ses lignes
 *   GET   /api/achats/historique                historique des achats (?fournisseurId=&medicamentId=&du=&au=)
 *   GET   /api/achats/pieces/:type/:id          pièces jointes d'un document
 *   GET   /api/achats/pieces/:id/fichier        télécharger une pièce jointe
 *
 * Droit « Modifier » sur le module Achats :
 *   POST  /api/achats/commandes                 créer (brouillon)
 *   PATCH /api/achats/commandes/:id             modifier (brouillon)
 *   POST  /api/achats/commandes/:id/valider     valider
 *   POST  /api/achats/commandes/:id/annuler     annuler
 *   POST  /api/achats/receptions                créer (brouillon)
 *   PATCH /api/achats/receptions/:id            modifier (brouillon)
 *   POST  /api/achats/receptions/:id/valider    VALIDER = entrée en stock
 *   POST  /api/achats/receptions/:id/annuler    annuler (brouillon)
 *   POST  /api/achats/pieces/:type/:id          ajouter une pièce jointe (fichier « fichier »)
 *   DELETE /api/achats/pieces/:id               supprimer une pièce jointe
 *   (:type = CommandeFournisseur ou Reception)
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
import { CommandesService } from './commandes.service';
import { ReceptionsService } from './receptions.service';
import { CreerCommandeDto, CreerReceptionDto, ModifierCommandeDto, ModifierReceptionDto } from './achats.dto';

/** Nombre facultatif lu dans l'adresse (?fournisseurId=3) ; vide = undefined. */
function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('achats')
export class AchatsController {
  constructor(
    private commandes: CommandesService,
    private receptions: ReceptionsService,
    private pieces: PiecesJointesService,
  ) {}

  // ===========================================================================
  // COMMANDES FOURNISSEURS
  // ===========================================================================

  @Acces('achats', 'LECTURE')
  @Get('commandes')
  listerCommandes(
    @Query('fournisseurId') fournisseurId?: string,
    @Query('statut') statut?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.commandes.lister({ fournisseurId: nombre(fournisseurId), statut, du, au });
  }

  @Acces('achats', 'LECTURE')
  @Get('commandes/:id')
  trouverCommande(@Param('id', ParseIntPipe) id: number) {
    return this.commandes.trouver(id);
  }

  @Acces('achats', 'MODIFICATION')
  @Post('commandes')
  creerCommande(@Body() dto: CreerCommandeDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.creer(dto, moi.id);
  }

  @Acces('achats', 'MODIFICATION')
  @Patch('commandes/:id')
  modifierCommande(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifierCommandeDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.modifier(id, dto, moi.id);
  }

  @Acces('achats', 'MODIFICATION')
  @Post('commandes/:id/valider')
  validerCommande(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.valider(id, moi.id);
  }

  @Acces('achats', 'MODIFICATION')
  @Post('commandes/:id/annuler')
  annulerCommande(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.annuler(id, moi.id);
  }

  // ===========================================================================
  // RÉCEPTIONS
  // ===========================================================================

  @Acces('achats', 'LECTURE')
  @Get('receptions')
  listerReceptions(
    @Query('fournisseurId') fournisseurId?: string,
    @Query('commandeId') commandeId?: string,
    @Query('statut') statut?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.receptions.lister({ fournisseurId: nombre(fournisseurId), commandeId: nombre(commandeId), statut, du, au });
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
