/**
 * =============================================================================
 * ROUTES DU MODULE 05 — HISTORIQUE DES LIVRAISONS ET STOCK DES CENTRES
 * =============================================================================
 * Spec nov. 2026 : plus de commandes des centres ni de nouveaux bons de
 * livraison (les sorties se font par facture). Lecture seule, sauf les pièces
 * jointes des anciens bons.
 *
 * Droit « Voir » sur le module Livraisons :
 *   GET   /api/livraisons/bons                     anciens bons de livraison (?centreId=&statut=&du=&au=)
 *   GET   /api/livraisons/bons/:id                 un bon de livraison (lignes par lot)
 *   GET   /api/livraisons/centres/:id              fiche d'un centre : stock théorique, livraisons, mouvements
 *   GET   /api/livraisons/pieces/:type/:id         pièces jointes (type : Livraison)
 *   GET   /api/livraisons/pieces/:id/fichier       télécharger une pièce jointe
 *
 * Droit « Modifier » sur le module Livraisons :
 *   POST  /api/livraisons/pieces/:type/:id         ajouter une pièce jointe ; DELETE /pieces/:id
 * =============================================================================
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Acces } from '../auth/droits';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { FichierRecu, PIECES_LIVRAISONS, PiecesJointesService, TAILLE_MAX_PIECE } from '../common/pieces-jointes.service';
import { LivraisonsService } from './livraisons.service';

function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('livraisons')
export class LivraisonsController {
  constructor(
    private livraisons: LivraisonsService,
    private pieces: PiecesJointesService,
  ) {}

  // ===========================================================================
  // ANCIENS BONS DE LIVRAISON
  // ===========================================================================

  @Acces('livraisons', 'LECTURE')
  @Get('bons')
  listerLivraisons(@Query('centreId') centreId?: string, @Query('statut') statut?: string, @Query('du') du?: string, @Query('au') au?: string) {
    return this.livraisons.lister({ centreId: nombre(centreId), statut, du, au });
  }

  @Acces('livraisons', 'LECTURE')
  @Get('bons/:id')
  trouverLivraison(@Param('id', ParseIntPipe) id: number) {
    return this.livraisons.trouver(id);
  }

  // ===========================================================================
  // FICHE D'UN CENTRE
  // ===========================================================================

  @Acces('livraisons', 'LECTURE')
  @Get('centres/:id')
  ficheCentre(@Param('id', ParseIntPipe) id: number) {
    return this.livraisons.ficheCentre(id);
  }

  // ===========================================================================
  // PIÈCES JUSTIFICATIVES (bons de livraison signés)
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
