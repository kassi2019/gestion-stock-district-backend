/**
 * ROUTES DES FOURNISSEURS
 *   GET   /api/fournisseurs          liste (?recherche=...&actifs=true)
 *   GET   /api/fournisseurs/:id      un fournisseur
 *   POST  /api/fournisseurs          créer                 (droit « Modification » sur le Paramétrage)
 *   PATCH /api/fournisseurs/:id      modifier / désactiver  (droit « Modification » sur le Paramétrage)
 */
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { FournisseursService } from './fournisseurs.service';
import { CreerFournisseurDto, ModifierFournisseurDto } from './fournisseurs.dto';

@Controller('fournisseurs')
export class FournisseursController {
  constructor(private fournisseursService: FournisseursService) {}

  @Get()
  lister(@Query('recherche') recherche?: string, @Query('actifs') actifs?: string) {
    return this.fournisseursService.lister(recherche, actifs === 'true');
  }

  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.fournisseursService.trouver(id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerFournisseurDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.fournisseursService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierFournisseurDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.fournisseursService.modifier(id, dto, utilisateur.id);
  }
}
