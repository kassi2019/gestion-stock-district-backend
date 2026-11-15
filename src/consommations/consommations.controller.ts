/**
 * =============================================================================
 * ROUTES DU MODULE 06 — RAPPORTS MENSUELS DE CONSOMMATION
 * =============================================================================
 * Droit « Voir » sur le module Consommations :
 *   GET    /api/consommations/rapports              liste (?centreId=&annee=&mois=&statut=)
 *   GET    /api/consommations/rapports/:id          un rapport (lignes, stock théorique du centre)
 *   GET    /api/consommations/suivi?annee=2026      tableau de suivi centres × mois
 *   GET    /api/consommations/stock-centre/:id      stock théorique d'un centre (aide à la saisie)
 *   GET    /api/consommations/pieces/:type/:id      pièces jointes (type : RapportConsommation)
 *   GET    /api/consommations/pieces/:id/fichier    télécharger une pièce jointe
 *
 * Droit « Modifier » sur le module Consommations :
 *   POST   /api/consommations/rapports              saisir un rapport (brouillon)
 *   PATCH  /api/consommations/rapports/:id          modifier (brouillon)
 *   DELETE /api/consommations/rapports/:id          supprimer (brouillon)
 *   POST   /api/consommations/rapports/:id/soumettre
 *   POST   /api/consommations/rapports/:id/renvoyer   renvoyer en brouillon (motif)
 *   POST   /api/consommations/rapports/:id/verifier   VÉRIFICATION SUR PLACE (quantités constatées)
 *   POST   /api/consommations/rapports/:id/valider    VALIDER = déduction du stock théorique du centre
 *   POST   /api/consommations/pieces/:type/:id      ajouter une pièce jointe ; DELETE /pieces/:id
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
import { FichierRecu, PIECES_CONSOMMATIONS, PiecesJointesService, TAILLE_MAX_PIECE } from '../common/pieces-jointes.service';
import { ConsommationsService } from './consommations.service';
import { CreerRapportDto, ModifierRapportDto, RenvoyerRapportDto, VerifierRapportDto } from './consommations.dto';

function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('consommations')
export class ConsommationsController {
  constructor(
    private consommations: ConsommationsService,
    private pieces: PiecesJointesService,
  ) {}

  // ===========================================================================
  // CONSULTATION
  // ===========================================================================

  @Acces('consommations', 'LECTURE')
  @Get('rapports')
  lister(@Query('centreId') centreId?: string, @Query('annee') annee?: string, @Query('mois') mois?: string, @Query('statut') statut?: string) {
    return this.consommations.lister({ centreId: nombre(centreId), annee: nombre(annee), mois: nombre(mois), statut: statut || undefined });
  }

  @Acces('consommations', 'LECTURE')
  @Get('rapports/:id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.consommations.trouver(id);
  }

  @Acces('consommations', 'LECTURE')
  @Get('suivi')
  suivi(@Query('annee') annee?: string) {
    return this.consommations.suivi(nombre(annee) ?? new Date().getFullYear());
  }

  @Acces('consommations', 'LECTURE')
  @Get('stock-centre/:id')
  stockCentre(@Param('id', ParseIntPipe) id: number) {
    return this.consommations.stockCentre(id);
  }

  // ===========================================================================
  // SAISIE ET CIRCUIT DE VALIDATION
  // ===========================================================================

  @Acces('consommations', 'MODIFICATION')
  @Post('rapports')
  creer(@Body() dto: CreerRapportDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.consommations.creer(dto, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Patch('rapports/:id')
  modifier(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifierRapportDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.consommations.modifier(id, dto, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Delete('rapports/:id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.consommations.supprimer(id, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post('rapports/:id/soumettre')
  soumettre(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.consommations.soumettre(id, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post('rapports/:id/renvoyer')
  renvoyer(@Param('id', ParseIntPipe) id: number, @Body() dto: RenvoyerRapportDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.consommations.renvoyer(id, dto.motif, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post('rapports/:id/verifier')
  verifier(@Param('id', ParseIntPipe) id: number, @Body() dto: VerifierRapportDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.consommations.verifier(id, dto, moi.id);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post('rapports/:id/valider')
  valider(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.consommations.valider(id, moi.id);
  }

  // ===========================================================================
  // PIÈCES JUSTIFICATIVES (rapport papier du centre, fiche de vérification)
  // ===========================================================================

  @Acces('consommations', 'LECTURE')
  @Get('pieces/:id/fichier')
  async telechargerPiece(@Param('id', ParseIntPipe) id: number, @Res() reponse: Response) {
    const { piece, chemin } = await this.pieces.fichier(id, PIECES_CONSOMMATIONS);
    reponse.setHeader('Content-Type', piece.mimeType || 'application/octet-stream');
    reponse.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(piece.nomFichier)}"`);
    reponse.sendFile(chemin);
  }

  @Acces('consommations', 'LECTURE')
  @Get('pieces/:type/:id')
  listerPieces(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.pieces.lister(type, id, PIECES_CONSOMMATIONS);
  }

  @Acces('consommations', 'MODIFICATION')
  @Post('pieces/:type/:id')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_PIECE } }))
  ajouterPiece(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() fichier: FichierRecu,
    @Body('libelle') libelle: string,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.pieces.ajouter(type, id, fichier, libelle, moi.id, PIECES_CONSOMMATIONS);
  }

  @Acces('consommations', 'MODIFICATION')
  @Delete('pieces/:id')
  supprimerPiece(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.pieces.supprimer(id, moi.id, PIECES_CONSOMMATIONS);
  }
}
