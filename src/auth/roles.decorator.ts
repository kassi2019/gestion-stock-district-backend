/**
 * =============================================================================
 * DÉCORATEURS DE SÉCURITÉ : @Public() et @Roles(...)
 * =============================================================================
 * Un "décorateur" est une étiquette placée au-dessus d'une route pour indiquer
 * qui a le droit de l'appeler.
 *
 * Par défaut, TOUTES les routes exigent que l'utilisateur soit connecté.
 *
 *   @Public()
 *       -> la route est accessible sans être connecté (ex. page de connexion).
 *
 *   @Roles(ROLES.COMPTABLE)
 *       -> seuls les comptables (et l'administrateur) peuvent appeler la route.
 *
 *   @Roles(ROLES.GESTIONNAIRE_DEPOT, ROLES.SUPERVISEUR)
 *       -> plusieurs profils autorisés.
 *
 * Exemple dans un controller :
 *
 *     @Roles(ROLES.COMPTABLE)
 *     @Post('paiements')
 *     enregistrerPaiement(...) { ... }
 * =============================================================================
 */
import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '../common/constants';

/** Nom interne de l'étiquette "rôles" (utilisé par RolesGuard). */
export const CLE_ROLES = 'roles';

/** Nom interne de l'étiquette "publique" (utilisé par JwtAuthGuard). */
export const CLE_PUBLIC = 'public';

/** Limite l'accès à certains profils. L'administrateur a toujours accès. */
export const Roles = (...roles: RoleCode[]) => SetMetadata(CLE_ROLES, roles);

/** Rend la route accessible sans connexion. */
export const Public = () => SetMetadata(CLE_PUBLIC, true);
