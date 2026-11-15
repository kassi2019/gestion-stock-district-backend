/**
 * =============================================================================
 * SERVICE DE CONNEXION
 * =============================================================================
 * Contient la logique de connexion d'un utilisateur :
 *   1. chercher l'utilisateur par son identifiant (login) ;
 *   2. vérifier que le compte est actif et que le mot de passe est correct ;
 *   3. noter la connexion (ou l'échec) dans le journal d'audit ;
 *   4. créer et renvoyer un jeton de connexion (JWT).
 *
 * Note : les mots de passe ne sont JAMAIS stockés en clair. On stocke une
 * empreinte (hash) calculée avec bcrypt, et on compare les empreintes.
 * =============================================================================
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContenuJeton } from './jwt.strategy';
import { lirePermissions } from './droits';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  /** Photo de l'utilisateur (celle de sa fiche personnel), ou null. */
  async photo(utilisateurId: number): Promise<string | null> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { personnel: { select: { photo: true } } },
    });
    return utilisateur?.personnel?.photo ?? null;
  }

  /**
   * Connecte un utilisateur.
   * @returns le jeton de connexion et les informations de l'utilisateur
   */
  async connecter(login: string, motDePasse: string, adresseIp?: string) {
    // 1. Recherche de l'utilisateur (avec son profil)
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { login },
      include: { role: true },
    });

    // 2. Vérifications : compte existant, actif, et mot de passe correct
    let identifiantsCorrects = false;
    if (utilisateur && utilisateur.actif) {
      identifiantsCorrects = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);
    }

    if (!utilisateur || !identifiantsCorrects) {
      // On trace la tentative échouée (utile pour repérer les abus)
      await this.audit.enregistrer({
        action: 'ECHEC_CONNEXION',
        entite: 'Utilisateur',
        entiteId: login,
        adresseIp,
      });
      // Message volontairement vague : on ne dit pas si c'est le login
      // ou le mot de passe qui est faux (sécurité).
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }

    // 3. Mise à jour de la date de dernière connexion + journal
    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { derniereConnexion: new Date() },
    });

    await this.audit.enregistrer({
      utilisateurId: utilisateur.id,
      action: 'CONNEXION',
      entite: 'Utilisateur',
      entiteId: utilisateur.id,
      adresseIp,
    });

    // 4. Création du jeton de connexion (durée : JWT_EXPIRES_IN dans le .env)
    const contenuJeton: ContenuJeton = {
      sub: utilisateur.id,
      login: utilisateur.login,
      role: utilisateur.role.code,
    };
    const jeton = await this.jwt.signAsync(contenuJeton);

    // Réponse envoyée au frontend (sans le mot de passe !)
    return {
      accessToken: jeton,
      utilisateur: {
        id: utilisateur.id,
        login: utilisateur.login,
        nom: utilisateur.nom,
        prenoms: utilisateur.prenoms,
        role: utilisateur.role.code,
        roleLibelle: utilisateur.role.libelle,
        // Droits par module (le frontend affiche les tuiles et boutons selon ces droits)
        permissions: lirePermissions(utilisateur.role.code, utilisateur.role.permissions),
      },
    };
  }
}
