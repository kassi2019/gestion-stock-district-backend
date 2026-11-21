/**
 * ROUTES DU CATALOGUE DES MÉDICAMENTS
 *   GET   /api/medicaments          liste (?recherche=...&familleId=...&actifs=true)
 *   GET   /api/medicaments/:id      un médicament
 *   POST  /api/medicaments          créer                 (droit « Modification » sur le Paramétrage)
 *   PATCH /api/medicaments/:id      modifier / désactiver  (droit « Modification » sur le Paramétrage)
 *
 * CODES-BARRES (scan des boîtes) :
 *   GET    /api/medicaments/code-barre/:code            médicament de ce code (404 si inconnu)
 *   POST   /api/medicaments/:id/codes-barres {code}     rattache un code au médicament
 *          (droit « Modification » sur le Paramétrage, les Achats OU la Facturation :
 *           un code inconnu scanné à la réception est rattaché sur place)
 *   DELETE /api/medicaments/:id/codes-barres/:codeId    retire un code (Paramétrage)
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { MedicamentsService } from './medicaments.service';
import { CodeBarreDto, CreerMedicamentDto, ModifierMedicamentDto } from './medicaments.dto';

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

  /** (Déclarée AVANT « :id » pour que « code-barre » ne soit pas pris pour un identifiant.) */
  @Get('code-barre/:code')
  parCodeBarre(@Param('code') code: string) {
    return this.medicamentsService.parCodeBarre(code);
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

  @Acces('parametrage|achats|facturation', 'MODIFICATION')
  @Post(':id/codes-barres')
  ajouterCodeBarre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CodeBarreDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.medicamentsService.ajouterCodeBarre(id, dto.code, utilisateur.id);
  }

  @Acces('parametrage', 'MODIFICATION')
  @Delete(':id/codes-barres/:codeId')
  retirerCodeBarre(
    @Param('id', ParseIntPipe) id: number,
    @Param('codeId', ParseIntPipe) codeId: number,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.medicamentsService.retirerCodeBarre(id, codeId, utilisateur.id);
  }
}
