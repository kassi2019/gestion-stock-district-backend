/**
 * ROUTES DES FAMILLES DE PRODUITS
 *   GET    /api/familles         liste
 *   POST   /api/familles         créer      (droit « Modification » sur le Paramétrage)
 *   PATCH  /api/familles/:id     modifier   (droit « Modification » sur le Paramétrage)
 *   DELETE /api/familles/:id     supprimer  (ADMIN, seulement si aucun médicament)
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { FamillesService } from './familles.service';
import { CreerFamilleDto, ModifierFamilleDto } from './familles.dto';

@Controller('familles')
export class FamillesController {
  constructor(private famillesService: FamillesService) {}

  @Get()
  lister() {
    return this.famillesService.lister();
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerFamilleDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.famillesService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierFamilleDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.famillesService.modifier(id, dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.famillesService.supprimer(id, utilisateur.id);
  }
}
