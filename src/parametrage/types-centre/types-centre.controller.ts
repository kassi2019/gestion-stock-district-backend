/**
 * ROUTES DES TYPES DE CENTRES
 *   GET    /api/types-centre         liste
 *   POST   /api/types-centre         créer      (droit « Modification » sur le Paramétrage)
 *   PATCH  /api/types-centre/:id     modifier   (droit « Modification » sur le Paramétrage)
 *   DELETE /api/types-centre/:id     supprimer  (ADMIN, seulement si aucun centre)
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { TypesCentreService } from './types-centre.service';
import { CreerTypeCentreDto, ModifierTypeCentreDto } from './types-centre.dto';

@Controller('types-centre')
export class TypesCentreController {
  constructor(private typesCentreService: TypesCentreService) {}

  @Get()
  lister() {
    return this.typesCentreService.lister();
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerTypeCentreDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.typesCentreService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierTypeCentreDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.typesCentreService.modifier(id, dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.typesCentreService.supprimer(id, utilisateur.id);
  }
}
