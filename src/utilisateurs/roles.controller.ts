/**
 * ROUTES DES PROFILS (rôles) ET DE LEURS DROITS
 *   GET    /api/roles         liste avec droits et nombre de comptes (droit Lecture sur Utilisateurs)
 *   POST   /api/roles         créer un profil                         (ADMINISTRATEUR)
 *   PATCH  /api/roles/:id     modifier libellé / description / droits (ADMINISTRATEUR)
 *   DELETE /api/roles/:id     supprimer (si aucun compte)             (ADMINISTRATEUR)
 *
 * ⚠ La gestion des profils est réservée à l'ADMINISTRATEUR, même pour un
 *   profil qui a le droit « Modification » sur les utilisateurs : sinon ce
 *   profil pourrait se donner lui-même plus de droits.
 */
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../auth/droits';
import { Roles } from '../auth/roles.decorator';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { ROLES } from '../common/constants';
import { RolesService } from './roles.service';
import { CreerRoleDto, ModifierRoleDto } from './roles.dto';

@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Acces('utilisateurs', 'LECTURE')
  @Get()
  lister() {
    return this.rolesService.lister();
  }

  @Roles(ROLES.ADMIN)
  @Post()
  creer(@Body() dto: CreerRoleDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.rolesService.creer(dto, moi.id);
  }

  @Roles(ROLES.ADMIN)
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierRoleDto,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.rolesService.modifier(id, dto, moi.id);
  }

  @Roles(ROLES.ADMIN)
  @Delete(':id')
  supprimer(@Param('id', ParseIntPipe) id: number, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.rolesService.supprimer(id, moi.id);
  }
}
