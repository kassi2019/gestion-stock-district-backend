/**
 * ROUTES DES PRIX
 *   GET  /api/prix/achat?medicamentId=..   historique des prix d'achat
 *   POST /api/prix/achat                   nouveau prix d'achat   (droit « Modification » sur le Paramétrage)
 *   GET  /api/prix/vente?medicamentId=..   historique des prix de vente
 *   POST /api/prix/vente                   nouveau prix de vente  (droit « Modification » sur le Paramétrage)
 *   PATCH /api/prix/achat/:id/corriger     corriger le prix d'achat EN COURS (droit « Modification » sur le Paramétrage)
 *   PATCH /api/prix/vente/:id/corriger     corriger le prix de vente EN COURS (droit « Modification » sur le Paramétrage)
 *          corps : { "prix": 1500, "motif": "erreur de saisie" }
 *
 * Pas de suppression ; la seule modification possible est la CORRECTION du
 * prix en cours, avec un motif (voir prix.service.ts).
 */
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { PrixService } from './prix.service';
import { CorrigerPrixDto, CreerPrixAchatDto, CreerPrixVenteDto } from './prix.dto';

@Controller('prix')
export class PrixController {
  constructor(private prixService: PrixService) {}

  @Get('achat')
  historiqueAchat(@Query('medicamentId', ParseIntPipe) medicamentId: number) {
    return this.prixService.historiqueAchat(medicamentId);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post('achat')
  creerPrixAchat(@Body() dto: CreerPrixAchatDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.prixService.creerPrixAchat(dto, utilisateur.id);
  }

  @Get('vente')
  historiqueVente(@Query('medicamentId', ParseIntPipe) medicamentId: number) {
    return this.prixService.historiqueVente(medicamentId);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post('vente')
  creerPrixVente(@Body() dto: CreerPrixVenteDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.prixService.creerPrixVente(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch('achat/:id/corriger')
  corrigerPrixAchat(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrigerPrixDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.prixService.corrigerPrix('achat', id, dto.prix, dto.motif, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch('vente/:id/corriger')
  corrigerPrixVente(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrigerPrixDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.prixService.corrigerPrix('vente', id, dto.prix, dto.motif, utilisateur.id);
  }
}
