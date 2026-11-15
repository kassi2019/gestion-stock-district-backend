/**
 * ROUTES DES UNITÉS DE VENTE
 *   GET    /api/unites-vente         liste
 *   POST   /api/unites-vente         créer      (droit « Modification » sur le Paramétrage)
 *   PATCH  /api/unites-vente/:id     modifier   (droit « Modification » sur le Paramétrage)
 *   DELETE /api/unites-vente/:id     supprimer  (ADMIN, seulement si aucun médicament)
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { UnitesVenteService } from './unites-vente.service';
import { CreerUniteVenteDto, ModifierUniteVenteDto } from './unites-vente.dto';

@Controller('unites-vente')
export class UnitesVenteController {
  constructor(private unitesVenteService: UnitesVenteService) {}

  @Get()
  lister() {
    return this.unitesVenteService.lister();
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerUniteVenteDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.unitesVenteService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierUniteVenteDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.unitesVenteService.modifier(id, dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.unitesVenteService.supprimer(id, utilisateur.id);
  }
}
