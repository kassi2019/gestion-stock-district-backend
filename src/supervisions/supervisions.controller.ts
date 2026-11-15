/**
 * =============================================================================
 * ROUTES DU MODULE 08 — SUPERVISIONS ET INVENTAIRES DANS LES CENTRES
 * =============================================================================
 * Droit « Voir » sur le module Supervisions :
 *   GET    /api/supervisions                      liste (?centreId=&statut=&du=&au=)
 *   GET    /api/supervisions/ecarts               écarts constatés (?centreId=&du=&au=)
 *   GET    /api/supervisions/preparation/:centreId?date=  stock théorique à la date + lots livrés
 *   GET    /api/supervisions/:id                  une supervision
 *   GET    /api/supervisions/pieces/:type/:id     pièces jointes (type : Supervision)
 *   GET    /api/supervisions/pieces/:id/fichier
 *
 * Droit « Modifier » :
 *   POST   /api/supervisions                      nouveau constat (brouillon)
 *   PATCH  /api/supervisions/:id                  modifier (brouillon)
 *   DELETE /api/supervisions/:id                  supprimer (brouillon)
 *   POST   /api/supervisions/:id/soumettre | renvoyer { motif } | valider
 *   POST   /api/supervisions/:id/decider          { decision, motif, dateFacture? }
 *   POST   /api/supervisions/pieces/:type/:id ; DELETE /api/supervisions/pieces/:id
 * =============================================================================
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Acces } from '../auth/droits';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { FichierRecu, PIECES_SUPERVISIONS, PiecesJointesService, TAILLE_MAX_PIECE } from '../common/pieces-jointes.service';
import { SupervisionsService } from './supervisions.service';
import { CreerSupervisionDto, DeciderSupervisionDto, ModifierSupervisionDto, MotifDto } from './supervisions.dto';

function nombre(valeur?: string) {
  return valeur ? Number(valeur) : undefined;
}

@Controller('supervisions')
export class SupervisionsController {
  constructor(
    private supervisions: SupervisionsService,
    private pieces: PiecesJointesService,
  ) {}

  @Acces('supervisions', 'LECTURE')
  @Get()
  lister(@Query('centreId') centreId?: string, @Query('statut') statut?: string, @Query('du') du?: string, @Query('au') au?: string) {
    return this.supervisions.lister({ centreId: nombre(centreId), statut: statut || undefined, du, au });
  }

  @Acces('supervisions', 'LECTURE')
  @Get('ecarts')
  ecarts(@Query('centreId') centreId?: string, @Query('du') du?: string, @Query('au') au?: string) {
    return this.supervisions.ecarts({ centreId: nombre(centreId), du, au });
  }

  @Acces('supervisions', 'LECTURE')
  @Get('preparation/:centreId')
  preparation(@Param('centreId', ParseIntPipe) centreId: number, @Query('date') date?: string) {
    return this.supervisions.preparation(centreId, date || undefined);
  }

  // --- Pièces justificatives (déclarées avant « :id ») ---
  @Acces('supervisions', 'LECTURE')
  @Get('pieces/:id/fichier')
  async telechargerPiece(@Param('id', ParseIntPipe) id: number, @Res() reponse: Response) {
    const { piece, chemin } = await this.pieces.fichier(id, PIECES_SUPERVISIONS);
    reponse.setHeader('Content-Type', piece.mimeType || 'application/octet-stream');
    reponse.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(piece.nomFichier)}"`);
    reponse.sendFile(chemin);
  }

  @Acces('supervisions', 'LECTURE')
  @Get('pieces/:type/:id')
  listerPieces(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.pieces.lister(type, id, PIECES_SUPERVISIONS);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Post('pieces/:type/:id')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_PIECE } }))
  ajouterPiece(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() fichier: FichierRecu,
    @Body('libelle') libelle: string,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.pieces.ajouter(type, id, fichier, libelle, moi.id, PIECES_SUPERVISIONS);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Delete('pieces/:id')
  supprimerPiece(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.pieces.supprimer(id, moi.id, PIECES_SUPERVISIONS);
  }

  // --- Supervisions ---
  @Acces('supervisions', 'LECTURE')
  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.supervisions.trouver(id);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerSupervisionDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.supervisions.creer(dto, moi.id);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Patch(':id')
  modifier(@Param('id', ParseIntPipe) id: number, @Body() dto: ModifierSupervisionDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.supervisions.modifier(id, dto, moi.id);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.supervisions.supprimer(id, moi.id);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Post(':id/soumettre')
  soumettre(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.supervisions.soumettre(id, moi.id);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Post(':id/renvoyer')
  renvoyer(@Param('id', ParseIntPipe) id: number, @Body() dto: MotifDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.supervisions.renvoyer(id, dto.motif, moi.id);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Post(':id/valider')
  valider(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.supervisions.valider(id, moi.id);
  }

  @Acces('supervisions', 'MODIFICATION')
  @Post(':id/decider')
  decider(@Param('id', ParseIntPipe) id: number, @Body() dto: DeciderSupervisionDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.supervisions.decider(id, dto.decision, dto.motif, dto.dateFacture, moi.id);
  }
}
