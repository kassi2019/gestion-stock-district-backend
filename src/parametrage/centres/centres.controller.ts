/**
 * =============================================================================
 * ROUTES DES CENTRES DE SANTÉ
 * =============================================================================
 *   GET   /api/centres            liste (?recherche=...&actifs=true)
 *   GET   /api/centres/:id        un centre
 *   POST  /api/centres            créer           (droit « Modification » sur le Paramétrage)
 *   PATCH /api/centres/:id        modifier / désactiver (droit « Modification » sur le Paramétrage)
 *
 * La lecture est ouverte à tout utilisateur connecté (les autres modules ont
 * besoin de la liste des centres). La modification est réservée à l'ADMIN.
 * =============================================================================
 */
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { CentresService } from './centres.service';
import { CreerCentreDto, ModifierCentreDto } from './centres.dto';

@Controller('centres')
export class CentresController {
  constructor(private centresService: CentresService) {}

  @Get()
  lister(@Query('recherche') recherche?: string, @Query('actifs') actifs?: string) {
    return this.centresService.lister(recherche, actifs === 'true');
  }

  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.centresService.trouver(id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerCentreDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.centresService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierCentreDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.centresService.modifier(id, dto, utilisateur.id);
  }
}
