/**
 * ROUTES DES FONCTIONS DU PERSONNEL
 *   GET    /api/fonctions         liste
 *   POST   /api/fonctions         créer      (droit « Modification » sur le Paramétrage)
 *   PATCH  /api/fonctions/:id     modifier   (droit « Modification » sur le Paramétrage)
 *   DELETE /api/fonctions/:id     supprimer  (ADMIN, seulement si aucun médicament)
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { FonctionsService } from './fonctions.service';
import { CreerFonctionDto, ModifierFonctionDto } from './fonctions.dto';

@Controller('fonctions')
export class FonctionsController {
  constructor(private fonctionsService: FonctionsService) {}

  @Get()
  lister() {
    return this.fonctionsService.lister();
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerFonctionDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.fonctionsService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierFonctionDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.fonctionsService.modifier(id, dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.fonctionsService.supprimer(id, utilisateur.id);
  }
}
