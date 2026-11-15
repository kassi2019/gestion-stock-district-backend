/**
 * ROUTES DU CATALOGUE DES MÉDICAMENTS
 *   GET   /api/medicaments          liste (?recherche=...&familleId=...&actifs=true)
 *   GET   /api/medicaments/:id      un médicament
 *   POST  /api/medicaments          créer                 (droit « Modification » sur le Paramétrage)
 *   PATCH /api/medicaments/:id      modifier / désactiver  (droit « Modification » sur le Paramétrage)
 */
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { MedicamentsService } from './medicaments.service';
import { CreerMedicamentDto, ModifierMedicamentDto } from './medicaments.dto';

@Controller('medicaments')
export class MedicamentsController {
  constructor(private medicamentsService: MedicamentsService) {}

  @Get()
  lister(
    @Query('recherche') recherche?: string,
    @Query('familleId') familleId?: string,
    @Query('actifs') actifs?: string,
  ) {
    return this.medicamentsService.lister(
      recherche,
      familleId ? Number(familleId) : undefined,
      actifs === 'true',
    );
  }

  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.medicamentsService.trouver(id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerMedicamentDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    return this.medicamentsService.creer(dto, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierMedicamentDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.medicamentsService.modifier(id, dto, utilisateur.id);
  }
}
