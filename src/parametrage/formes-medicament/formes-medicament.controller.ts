/**
 * ROUTES DES FORMES DE MÉDICAMENTS
 *   GET    /api/formes-medicament         liste
 *   POST   /api/formes-medicament         créer      (droit « Modification » sur le Paramétrage)
 *   PATCH  /api/formes-medicament/:id     modifier   (droit « Modification » sur le Paramétrage)
 *   DELETE /api/formes-medicament/:id     supprimer  (ADMIN, seulement si aucun médicament)
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { FormesMedicamentService } from './formes-medicament.service';
import { CreerFormeDto, ModifierFormeDto } from './formes-medicament.dto';

@Controller('formes-medicament')
export class FormesMedicamentController {
  constructor(private formesService: FormesMedicamentService) {}

  @Get()
  lister() {
    return this.formesService.lister();
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerFormeDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.formesService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierFormeDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.formesService.modifier(id, dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.formesService.supprimer(id, utilisateur.id);
  }
}
