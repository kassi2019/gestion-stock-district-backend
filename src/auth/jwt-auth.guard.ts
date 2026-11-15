/**
 * =============================================================================
 * PROTECTION N°1 : L'UTILISATEUR DOIT ÊTRE CONNECTÉ
 * =============================================================================
 * Un "guard" (garde) est exécuté AVANT chaque route.
 * Il répond à la question : "cette requête a-t-elle le droit de passer ?"
 *
 * Fonctionnement :
 *   - si la route porte l'étiquette @Public()  -> on laisse passer ;
 *   - sinon on vérifie le jeton de connexion (JWT) envoyé par le frontend
 *     dans l'en-tête "Authorization: Bearer <jeton>".
 *     La vérification elle-même est faite dans jwt.strategy.ts.
 *   - jeton absent ou invalide -> erreur 401 "Unauthorized".
 * =============================================================================
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { CLE_PUBLIC } from './roles.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // On regarde si la route (ou son controller) est marquée @Public()
    const routePublique = this.reflector.getAllAndOverride<boolean>(CLE_PUBLIC, [
      context.getHandler(), // la méthode (ex. login)
      context.getClass(), // le controller (ex. AuthController)
    ]);

    if (routePublique) {
      return true; // pas besoin d'être connecté
    }

    // Sinon : vérification normale du jeton de connexion
    return super.canActivate(context);
  }
}
