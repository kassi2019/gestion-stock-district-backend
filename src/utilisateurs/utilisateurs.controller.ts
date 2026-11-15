/**
 * =============================================================================
 * ROUTES DES COMPTES UTILISATEURS (module 02)
 * =============================================================================
 * Droit « Lecture » sur le module Utilisateurs :
 *   GET   /api/utilisateurs                         liste des comptes
 *   GET   /api/utilisateurs/roles                   liste des profils (liste déroulante)
 *   GET   /api/utilisateurs/:id                     un compte
 *
 * Droit « Modification » sur le module Utilisateurs :
 *   POST  /api/utilisateurs                         créer un compte pour un membre du personnel
 *   PATCH /api/utilisateurs/:id                     identifiant, profil, activation
 *   PATCH /api/utilisateurs/:id/mot-de-passe        réinitialiser le mot de passe
 *
 * Ouverte à TOUT utilisateur connecté :
 *   PATCH /api/utilisateurs/moi/mot-de-passe        changer SON mot de passe
 *
 * (Le personnel : personnel.controller.ts ; les profils et droits : roles.controller.ts)
 * =============================================================================
 */
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Acces } from '../auth/droits';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { UtilisateursService } from './utilisateurs.service';
import {
  ChangerMonMotDePasseDto,
  CreerUtilisateurDto,
  ModifierUtilisateurDto,
  ReinitialiserMotDePasseDto,
} from './utilisateurs.dto';

@Controller('utilisateurs')
export class UtilisateursController {
  constructor(private utilisateursService: UtilisateursService) {}

  // ⚠ Cette route est placée AVANT les routes ":id" pour que "moi" ne soit
  //   pas pris pour un identifiant.
  /** Changer son propre mot de passe (tout profil). */
  @Patch('moi/mot-de-passe')
  changerMonMotDePasse(@Body() dto: ChangerMonMotDePasseDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.utilisateursService.changerMonMotDePasse(moi.id, dto.ancienMotDePasse, dto.nouveauMotDePasse);
  }

  @Acces('utilisateurs', 'LECTURE')
  @Get('roles')
  listerRoles() {
    return this.utilisateursService.listerRoles();
  }

  @Acces('utilisateurs', 'LECTURE')
  @Get()
  lister() {
    return this.utilisateursService.lister();
  }

  @Acces('utilisateurs', 'LECTURE')
  @Get(':id')
  trouver(@Param('id', ParseIntPipe) id: number) {
    return this.utilisateursService.trouver(id);
  }

  @Acces('utilisateurs', 'MODIFICATION')
  @Post()
  creer(@Body() dto: CreerUtilisateurDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.utilisateursService.creer(dto, moi);
  }

  @Acces('utilisateurs', 'MODIFICATION')
  @Patch(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierUtilisateurDto,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.utilisateursService.modifier(id, dto, moi);
  }

  @Acces('utilisateurs', 'MODIFICATION')
  @Patch(':id/mot-de-passe')
  reinitialiserMotDePasse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReinitialiserMotDePasseDto,
    @UtilisateurCourant() moi: UtilisateurConnecte,
  ) {
    return this.utilisateursService.reinitialiserMotDePasse(id, dto.nouveauMotDePasse, moi);
  }
}
