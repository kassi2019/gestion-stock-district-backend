/**
 * =============================================================================
 * VÉRIFICATION DU JETON DE CONNEXION (JWT)
 * =============================================================================
 * Après la connexion, le frontend reçoit un "jeton" (JWT). C'est une sorte de
 * badge signé qui contient l'identifiant et le profil de l'utilisateur.
 * Le frontend renvoie ce jeton à chaque requête.
 *
 * Ce fichier :
 *   1. lit le jeton dans l'en-tête "Authorization: Bearer <jeton>" ;
 *   2. vérifie sa signature (avec JWT_SECRET du .env) et sa date d'expiration ;
 *   3. vérifie dans la base que le compte existe toujours et est actif ;
 *   4. place l'utilisateur dans "request.user" pour que les routes puissent
 *      savoir qui fait l'opération (voir le décorateur @UtilisateurCourant()).
 * =============================================================================
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { lirePermissions, Permissions } from './droits';

/** Contenu enregistré à l'intérieur du jeton au moment de la connexion. */
export interface ContenuJeton {
  sub: number; // identifiant de l'utilisateur ("sub" est le nom standard JWT)
  login: string;
  role: string;
}

/** Utilisateur connecté, tel qu'il est disponible dans les routes. */
export interface UtilisateurConnecte {
  id: number;
  login: string;
  role: string; // code du profil : ADMIN, COMPTABLE, ...
  roleLibelle: string;
  nom: string;
  prenoms: string | null;
  /** Droits par module : { parametrage: 'MODIFICATION', stock: 'LECTURE' } */
  permissions: Permissions;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      // Où trouver le jeton : en-tête "Authorization: Bearer ..."
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Un jeton expiré est refusé
      ignoreExpiration: false,
      // Clé secrète utilisée pour vérifier la signature
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Appelée automatiquement quand le jeton est valide.
   * Ce qu'elle retourne devient "request.user".
   */
  async validate(contenu: ContenuJeton): Promise<UtilisateurConnecte> {
    // On relit l'utilisateur en base : si un administrateur a désactivé
    // le compte entre-temps, l'accès est coupé immédiatement.
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: contenu.sub },
      include: { role: true },
    });

    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException('Compte inexistant ou désactivé');
    }

    return {
      id: utilisateur.id,
      login: utilisateur.login,
      role: utilisateur.role.code,
      roleLibelle: utilisateur.role.libelle,
      nom: utilisateur.nom,
      prenoms: utilisateur.prenoms,
      // Droits relus à chaque requête : un changement s'applique tout de suite
      permissions: lirePermissions(utilisateur.role.code, utilisateur.role.permissions),
    };
  }
}
