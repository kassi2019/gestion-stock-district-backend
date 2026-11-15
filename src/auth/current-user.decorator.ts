/**
 * Décorateur @UtilisateurCourant()
 *
 * Permet de récupérer facilement l'utilisateur connecté dans une route.
 *
 * Exemple :
 *     @Post()
 *     creer(@Body() dto: CreerCentreDto, @UtilisateurCourant() utilisateur: UtilisateurConnecte) {
 *       // utilisateur.id, utilisateur.login, utilisateur.role
 *     }
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UtilisateurConnecte } from './jwt.strategy';

export const UtilisateurCourant = createParamDecorator(
  (_donnees: unknown, context: ExecutionContext): UtilisateurConnecte => {
    // "request.user" a été rempli par jwt.strategy.ts
    return context.switchToHttp().getRequest().user;
  },
);
