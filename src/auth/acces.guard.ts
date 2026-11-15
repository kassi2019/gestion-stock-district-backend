/**
 * =============================================================================
 * PROTECTION N°3 : DROITS PAR MODULE (étiquette @Acces)
 * =============================================================================
 * Si une route porte @Acces('module', 'NIVEAU'), l'utilisateur connecté doit
 * avoir ce niveau sur ce module dans son profil (voir droits.ts).
 * Sinon : erreur 403 « Accès refusé ».
 *
 * Les droits sont relus en base à CHAQUE requête (jwt.strategy.ts) : un
 * changement de droits d'un profil s'applique immédiatement, sans reconnexion.
 * =============================================================================
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NIVEAU_ACCES, NiveauAcces } from '../common/constants';
import { aLeDroit, CLE_ACCES } from './droits';
import { UtilisateurConnecte } from './jwt.strategy';

@Injectable()
export class AccesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const exigence = this.reflector.getAllAndOverride<{ module: string; niveau: NiveauAcces }>(CLE_ACCES, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Pas d'étiquette @Acces : rien à vérifier ici
    if (!exigence) return true;

    const utilisateur: UtilisateurConnecte | undefined = context.switchToHttp().getRequest().user;
    if (utilisateur && aLeDroit(utilisateur.permissions, exigence.module, exigence.niveau)) return true;

    throw new ForbiddenException(
      exigence.niveau === NIVEAU_ACCES.MODIFICATION
        ? "Accès refusé : votre profil n'a pas le droit de modifier ce module."
        : "Accès refusé : votre profil n'a pas accès à ce module.",
    );
  }
}
