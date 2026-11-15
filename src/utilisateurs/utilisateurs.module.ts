/**
 * MODULE 02 — UTILISATEURS
 *   - personnel   : fiches du personnel, avec création du compte en même temps
 *                   (personnel.service.ts) ;
 *   - comptes     : identifiant, profil, activation, mots de passe
 *                   (utilisateurs.service.ts) ;
 *   - profils     : rôles et droits par module (roles.service.ts).
 */
import { Module } from '@nestjs/common';
import { UtilisateursController } from './utilisateurs.controller';
import { UtilisateursService } from './utilisateurs.service';
import { PersonnelController } from './personnel.controller';
import { PersonnelService } from './personnel.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [UtilisateursController, PersonnelController, RolesController],
  providers: [UtilisateursService, PersonnelService, RolesService],
})
export class UtilisateursModule {}
