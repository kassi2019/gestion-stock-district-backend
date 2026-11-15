/**
 * =============================================================================
 * ROUTES DU MODULE 05 — COMMANDES ET LIVRAISONS AUX CENTRES
 * =============================================================================
 * Droit « Voir » sur le module Livraisons :
 *   GET   /api/livraisons/commandes                commandes des centres (?centreId=&statut=&du=&au=)
 *   GET   /api/livraisons/commandes/:id            une commande (lignes, livré, disponibilités)
 *   GET   /api/livraisons/bons                     bons de livraison (?centreId=&commandeId=&statut=&du=&au=)
 *   GET   /api/livraisons/bons/:id                 un bon de livraison (lignes par lot)
 *   GET   /api/livraisons/disponibilites?ids=1,2   stock utilisable au dépôt (lots non périmés)
 *                                                  (sans ids : tous les médicaments disponibles > 0)
 *   GET   /api/livraisons/centres/:id              fiche d'un centre : stock théorique, livraisons, mouvements
 *   GET   /api/livraisons/pieces/:type/:id         pièces jointes (type : CommandeCentre, Livraison)
 *   GET   /api/livraisons/pieces/:id/fichier       télécharger une pièce jointe
 *
 * Droit « Modifier » sur le module Livraisons :
 *   POST  /api/livraisons/commandes                créer une commande (brouillon)
 *   PATCH /api/livraisons/commandes/:id            modifier (brouillon)
 *   POST  /api/livraisons/commandes/:id/valider    valider (quantités accordées)
 *   POST  /api/livraisons/commandes/:id/annuler    annuler
 *   POST  /api/livraisons/bons                     préparer un bon de livraison (brouillon)
 *   PATCH /api/livraisons/bons/:id                 modifier la préparation (brouillon)
 *   POST  /api/livraisons/bons/:id/valider         VALIDER = sortie du dépôt + stock du centre
 *   POST  /api/livraisons/bons/:id/annuler         annuler (brouillon)
 *   POST  /api/livraisons/pieces/:type/:id         ajouter une pièce jointe ; DELETE /pieces/:id
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
import { FichierRecu, PIECES_LIVRAISONS, PiecesJointesService, TAILLE_MAX_PIECE } from '../common/pieces-jointes.service';
import { CommandesCentreService } from './commandes-centre.service';
import { LivraisonsService } from './livraisons.service';
import {
  CreerCommandeCentreDto,
  CreerLivraisonDto,
  ModifierCommandeCentreDto,
  ModifierLivraisonDto,
  ValiderCommandeCentreDto,
  ValiderLivraisonDto,
} from './livraisons.dto';

function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('livraisons')
export class LivraisonsController {
  constructor(
    private commandes: CommandesCentreService,
    private livraisons: LivraisonsService,
    private pieces: PiecesJointesService,
  ) {}

  // ===========================================================================
  // COMMANDES DES CENTRES
  // ===========================================================================

  @Acces('livraisons', 'LECTURE')
  @Get('commandes')
  listerCommandes(@Query('centreId') centreId?: string, @Query('statut') statut?: string, @Query('du') du?: string, @Query('au') au?: string) {
    return this.commandes.lister({ centreId: nombre(centreId), statut, du, au });
  }

  @Acces('livraisons', 'LECTURE')
  @Get('commandes/:id')
  trouverCommande(@Param('id', ParseIntPipe) id: number) {
    return this.commandes.trouver(id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Post('commandes')
  creerCommande(@Body() dto: CreerCommandeCentreDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.creer(dto, moi.id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Patch('commandes/:id')
  modifierCommande(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifierCommandeCentreDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.modifier(id, dto, moi.id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Post('commandes/:id/valider')
  validerCommande(@Param('id', ParseIntPipe) id: number, @Body() dto: ValiderCommandeCentreDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.valider(id, dto, moi.id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Post('commandes/:id/annuler')
  annulerCommande(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.commandes.annuler(id, moi.id);
  }

  // ===========================================================================
  // BONS DE LIVRAISON
  // ===========================================================================

  @Acces('livraisons', 'LECTURE')
  @Get('bons')
  listerLivraisons(
    @Query('centreId') centreId?: string,
    @Query('commandeId') commandeId?: string,
    @Query('statut') statut?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
  ) {
    return this.livraisons.lister({ centreId: nombre(centreId), commandeId: nombre(commandeId), statut, du, au });
  }

  @Acces('livraisons', 'LECTURE')
  @Get('bons/:id')
  trouverLivraison(@Param('id', ParseIntPipe) id: number) {
    return this.livraisons.trouver(id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Post('bons')
  creerLivraison(@Body() dto: CreerLivraisonDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.livraisons.creer(dto, moi.id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Patch('bons/:id')
  modifierLivraison(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifierLivraisonDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.livraisons.modifier(id, dto, moi.id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Post('bons/:id/valider')
  validerLivraison(@Param('id', ParseIntPipe) id: number, @Body() dto: ValiderLivraisonDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.livraisons.valider(id, dto, moi.id);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Post('bons/:id/annuler')
  annulerLivraison(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.livraisons.annuler(id, moi.id);
  }

  // ===========================================================================
  // DISPONIBILITÉS ET FICHE D'UN CENTRE
  // ===========================================================================

  @Acces('livraisons', 'LECTURE')
  @Get('disponibilites')
  disponibilites(@Query('ids') ids?: string) {
    const liste = (ids || '').split(',').map(Number).filter((n) => n > 0);
    return this.livraisons.disponibilites(liste);
  }

  @Acces('livraisons', 'LECTURE')
  @Get('centres/:id')
  ficheCentre(@Param('id', ParseIntPipe) id: number) {
    return this.livraisons.ficheCentre(id);
  }

  // ===========================================================================
  // PIÈCES JUSTIFICATIVES (commandes, bons de livraison signés)
  // ===========================================================================

  @Acces('livraisons', 'LECTURE')
  @Get('pieces/:id/fichier')
  async telechargerPiece(@Param('id', ParseIntPipe) id: number, @Res() reponse: Response) {
    const { piece, chemin } = await this.pieces.fichier(id, PIECES_LIVRAISONS);
    reponse.setHeader('Content-Type', piece.mimeType || 'application/octet-stream');
    reponse.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(piece.nomFichier)}"`);
    reponse.sendFile(chemin);
  }

  @Acces('livraisons', 'LECTURE')
  @Get('pieces/:type/:id')
  listerPieces(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.pieces.lister(type, id, PIECES_LIVRAISONS);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Post('pieces/:type/:id')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_PIECE } }))
  ajouterPiece(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() fichier: FichierRecu,
    @Body('libelle') libelle: string,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.pieces.ajouter(type, id, fichier, libelle, moi.id, PIECES_LIVRAISONS);
  }

  @Acces('livraisons', 'MODIFICATION')
  @Delete('pieces/:id')
  supprimerPiece(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.pieces.supprimer(id, moi.id, PIECES_LIVRAISONS);
  }
}
