/**
 * =============================================================================
 * PROTECTION N°2 : L'UTILISATEUR DOIT AVOIR LE BON PROFIL
 * =============================================================================
 * Exécuté après JwtAuthGuard (l'utilisateur est donc déjà identifié).
 *
 * Règles :
 *   - la route n'a pas d'étiquette @Roles(...)    -> tout utilisateur connecté passe ;
 *   - l'utilisateur est ADMIN                      -> il passe toujours ;
 *   - le profil de l'utilisateur est dans la liste -> il passe ;
 *   - sinon                                        -> erreur 403 "Forbidden".
 * =============================================================================
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLE_ROLES } from './roles.decorator';
import { ROLES } from '../common/constants';
import { UtilisateurConnecte } from './jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Liste des profils autorisés, lue dans l'étiquette @Roles(...)
    const rolesAutorises = this.reflector.getAllAndOverride<string[]>(CLE_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Pas d'étiquette @Roles : la route est ouverte à tout utilisateur connecté
    if (!rolesAutorises || rolesAutorises.length === 0) {
      return true;
    }

    // Utilisateur connecté (rempli par jwt.strategy.ts)
    const utilisateur: UtilisateurConnecte | undefined = context.switchToHttp().getRequest().user;
    if (!utilisateur) {
      return false;
    }

    // L'administrateur a accès à tout
    if (utilisateur.role === ROLES.ADMIN) {
      return true;
    }

    return rolesAutorises.includes(utilisateur.role);
  }
}
