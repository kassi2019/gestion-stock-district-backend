/**
 * ROUTES DU PERSONNEL (module 02 Utilisateurs)
 *   GET   /api/personnel                 liste              (droit Lecture)
 *   GET   /api/personnel/:id             une fiche          (droit Lecture)
 *   POST  /api/personnel                 créer une fiche, avec un compte
 *                                        utilisateur si « compte » est rempli (droit Modification)
 *   PATCH /api/personnel/:id             modifier / désactiver (droit Modification)
 *   POST  /api/personnel/:id/compte      créer le compte d'une personne qui n'en a pas (droit Modification)
 */
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../auth/droits';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { PersonnelService } from './personnel.service';
import { CreerPersonnelDto, ModifierPersonnelDto } from './personnel.dto';
import { CompteDto } from './utilisateurs.dto';

@Controller('personnel')
export class PersonnelController {
  constructor(private personnelService: PersonnelService) {}

  @Acces('utilisateurs', 'LECTURE')
  @Get()
  lister() {
    return this.personnelService.lister();
  }

  @Acces('utilisateurs', 'LECTURE')
  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.personnelService.trouver(id);
  }

  @Acces('utilisateurs', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerPersonnelDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.personnelService.creer(dto, moi);
  }

  @Acces('utilisateurs', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierPersonnelDto,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.personnelService.modifier(id, dto, moi);
  }

  @Acces('utilisateurs', 'MODIFICATION')
  @Post(':id/compte')
  creerCompte(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompteDto,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.personnelService.creerCompte(id, dto, moi);
  }
}
