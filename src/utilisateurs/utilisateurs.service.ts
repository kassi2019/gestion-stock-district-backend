/**
 * =============================================================================
 * SERVICE DES COMPTES UTILISATEURS (module 02)
 * =============================================================================
 * Un compte utilisateur appartient à un MEMBRE DU PERSONNEL (table personnel) :
 *   - son IDENTIFIANT DE CONNEXION est le MATRICULE de la personne (il n'est
 *     pas saisi ; il suit le matricule si celui-ci change) ;
 *   - le nom, les prénoms, la fonction, le téléphone et l'e-mail viennent de
 *     sa fiche personnel (ils sont RECOPIÉS dans le compte, et mis à jour
 *     quand la fiche change : voir synchroniserIdentite) ;
 *   - un membre du personnel a AU PLUS UN compte.
 *
 * Gestion des comptes : création, identifiant, profil, activation,
 * réinitialisation et changement de mot de passe.
 *
 * Règles de sécurité :
 *   - le mot de passe n'est JAMAIS renvoyé ni stocké en clair (empreinte bcrypt) ;
 *   - un utilisateur n'est jamais supprimé (il apparaît dans l'historique des
 *     opérations) : on le DÉSACTIVE, il ne peut alors plus se connecter ;
 *   - on ne peut pas se désactiver soi-même ;
 *   - il doit toujours rester AU MOINS UN administrateur actif ;
 *   - seul un ADMINISTRATEUR peut donner ou retirer le profil Administrateur,
 *     et réinitialiser le mot de passe d'un administrateur ;
 *   - chaque opération est inscrite dans le journal d'audit.
 * =============================================================================
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { traduireErreurPrisma } from '../common/prisma-erreurs';
import { ROLES } from '../common/constants';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import {
  CompteDto,
  CreerUtilisateurDto,
  MESSAGE_MATRICULE,
  ModifierUtilisateurDto,
  REGLE_MATRICULE,
} from './utilisateurs.dto';

/** Nombre de "tours" de calcul de l'empreinte du mot de passe (sécurité). */
const COUT_BCRYPT = 10;

/**
 * Champs renvoyés au frontend. Le mot de passe (motDePasseHash) n'y figure
 * volontairement PAS.
 */
export const CHAMPS_PUBLICS = {
  id: true,
  login: true,
  nom: true,
  prenoms: true,
  email: true,
  telephone: true,
  fonction: true,
  roleId: true,
  personnelId: true,
  actif: true,
  derniereConnexion: true,
  createdAt: true,
  role: { select: { id: true, code: true, libelle: true } },
  personnel: { select: { id: true, matricule: true, photo: true, centre: { select: { id: true, nom: true } } } },
} as const;

/** Base de données : connexion normale ou transaction en cours. */
type Base = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UtilisateursService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des profils (pour la liste déroulante du formulaire). */
  listerRoles() {
    return this.prisma.role.findMany({
      select: { id: true, code: true, libelle: true, description: true },
      orderBy: { id: 'asc' },
    });
  }

  /** Liste des comptes, triés par nom. */
  lister() {
    return this.prisma.utilisateur.findMany({
      select: CHAMPS_PUBLICS,
      orderBy: [{ nom: 'asc' }, { prenoms: 'asc' }],
    });
  }

  async trouver(id: number) {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id }, select: CHAMPS_PUBLICS });
    if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');
    return utilisateur;
  }

  /** Création d'un compte pour un membre du personnel existant. */
  async creer(dto: CreerUtilisateurDto, auteur: UtilisateurConnecte) {
    const { personnelId, ...compte } = dto;
    try {
      return await this.prisma.$transaction((tx) => this.creerCompte(tx, personnelId, compte, auteur));
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'utilisateur');
    }
  }

  /**
   * Crée le compte d'un membre du personnel (dans une transaction).
   * Utilisée aussi par le service du personnel (« créer aussi un compte »).
   */
  async creerCompte(tx: Prisma.TransactionClient, personnelId: number, compte: CompteDto, auteur: UtilisateurConnecte) {
    const personnel = await tx.personnel.findUnique({
      where: { id: personnelId },
      include: { comptes: true, fonction: true },
    });
    if (!personnel) throw new NotFoundException('Membre du personnel introuvable.');
    if (personnel.comptes.length > 0) {
      throw new BadRequestException(
        `${personnel.nom} ${personnel.prenoms ?? ''} a déjà un compte (« ${personnel.comptes[0].login} »).`.replace('  ', ' '),
      );
    }
    await this.verifierRole(compte.roleId, auteur, tx);

    // Identifiant de connexion = matricule de la personne
    const login = await this.verifierIdentifiant(tx, personnel.matricule);

    const utilisateur = await tx.utilisateur.create({
      data: {
        login,
        motDePasseHash: await bcrypt.hash(compte.motDePasse, COUT_BCRYPT),
        roleId: compte.roleId,
        personnelId,
        // Identité recopiée depuis la fiche du personnel
        nom: personnel.nom,
        prenoms: personnel.prenoms,
        fonction: personnel.fonction?.libelle ?? null, // libellé de la fonction
        telephone: personnel.telephone,
        email: personnel.email,
        actif: personnel.actif,
      },
      select: CHAMPS_PUBLICS,
    });
    await this.audit.enregistrer(
      {
        utilisateurId: auteur.id,
        action: 'CREATION',
        entite: 'Utilisateur',
        entiteId: utilisateur.id,
        apres: utilisateur, // sans le mot de passe
      },
      tx,
    );
    return utilisateur;
  }

  /** Modification d'un compte : identifiant, profil, activation. */
  async modifier(id: number, dto: ModifierUtilisateurDto, auteur: UtilisateurConnecte) {
    const avant = await this.trouver(id);
    const changeDeProfil = dto.roleId !== undefined && dto.roleId !== avant.roleId;
    if (changeDeProfil) await this.verifierRole(dto.roleId!, auteur);

    // --- Règle : seul un administrateur peut RETIRER le profil Administrateur ---
    if (changeDeProfil && avant.role.code === ROLES.ADMIN && auteur.role !== ROLES.ADMIN) {
      throw new ForbiddenException('Seul un administrateur peut modifier le profil d\'un administrateur.');
    }

    // --- Règle : on ne peut pas se désactiver soi-même ---
    if (id === auteur.id && dto.actif === false) {
      throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte.');
    }

    // --- Règle : il doit rester au moins un administrateur actif ---
    const perdLeProfilAdmin = avant.role.code === ROLES.ADMIN && (dto.actif === false || changeDeProfil);
    if (perdLeProfilAdmin) {
      const autresAdminsActifs = await this.prisma.utilisateur.count({
        where: { actif: true, role: { code: ROLES.ADMIN }, id: { not: id } },
      });
      if (autresAdminsActifs === 0) {
        throw new BadRequestException(
          'Opération impossible : il doit toujours rester au moins un administrateur actif.',
        );
      }
    }

    try {
      const apres = await this.prisma.utilisateur.update({ where: { id }, data: dto, select: CHAMPS_PUBLICS });
      await this.audit.enregistrer({
        utilisateurId: auteur.id,
        action: dto.actif === false ? 'DESACTIVATION' : 'MODIFICATION',
        entite: 'Utilisateur',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'utilisateur');
    }
  }

  /**
   * Vérifie qu'un matricule peut servir d'identifiant de connexion (format et
   * pas déjà pris par un autre compte). Renvoie l'identifiant.
   * @param sauf  compte à ignorer (celui de la personne, lors d'un changement de matricule)
   */
  async verifierIdentifiant(base: Base, matricule: string, sauf?: number) {
    if (!REGLE_MATRICULE.test(matricule)) throw new BadRequestException(MESSAGE_MATRICULE);
    const pris = await base.utilisateur.findUnique({ where: { login: matricule } });
    if (pris && pris.id !== sauf) {
      throw new BadRequestException(`L'identifiant « ${matricule} » est déjà utilisé par un autre compte.`);
    }
    return matricule;
  }

  /**
   * Recopie la fiche d'un membre du personnel dans son compte utilisateur,
   * après une modification : nom, prénoms, fonction, contacts, et
   * l'identifiant (= matricule) SI le matricule vient d'être modifié.
   * (Un compte créé avant cette règle, ex. « admin », garde son identifiant
   *  tant que le matricule de la fiche n'est pas modifié.)
   */
  async synchroniserIdentite(base: Base, personnelId: number, matriculeModifie = false) {
    const personnel = await base.personnel.findUnique({
      where: { id: personnelId },
      include: { comptes: true, fonction: true },
    });
    if (!personnel) return;
    // Matricule modifié : l'identifiant de connexion suit
    const compte = personnel.comptes[0];
    const changerIdentifiant = matriculeModifie && compte && compte.login !== personnel.matricule;
    if (changerIdentifiant) await this.verifierIdentifiant(base, personnel.matricule, compte.id);
    await base.utilisateur.updateMany({
      where: { personnelId },
      data: {
        ...(changerIdentifiant ? { login: personnel.matricule } : {}),
        nom: personnel.nom,
        prenoms: personnel.prenoms,
        fonction: personnel.fonction?.libelle ?? null, // libellé de la fonction
        telephone: personnel.telephone,
        email: personnel.email,
      },
    });
  }

  /** L'administrateur définit un nouveau mot de passe pour un utilisateur. */
  async reinitialiserMotDePasse(id: number, nouveauMotDePasse: string, auteur: UtilisateurConnecte) {
    const cible = await this.trouver(id);
    // Seul un administrateur peut changer le mot de passe d'un administrateur
    // (sinon un autre profil pourrait prendre la main sur son compte)
    if (cible.role.code === ROLES.ADMIN && auteur.role !== ROLES.ADMIN) {
      throw new ForbiddenException("Seul un administrateur peut réinitialiser le mot de passe d'un administrateur.");
    }
    const auteurId = auteur.id;
    await this.prisma.utilisateur.update({
      where: { id },
      data: { motDePasseHash: await bcrypt.hash(nouveauMotDePasse, COUT_BCRYPT) },
    });
    await this.audit.enregistrer({
      utilisateurId: auteurId,
      action: 'REINITIALISATION_MOT_DE_PASSE',
      entite: 'Utilisateur',
      entiteId: id,
    });
    return { message: 'Mot de passe réinitialisé.' };
  }

  /** Un utilisateur change SON PROPRE mot de passe (il doit connaître l'ancien). */
  async changerMonMotDePasse(utilisateurId: number, ancien: string, nouveau: string) {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
    if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');

    const ancienCorrect = await bcrypt.compare(ancien, utilisateur.motDePasseHash);
    if (!ancienCorrect) {
      // ⚠ Erreur 400 (et non 401) : le frontend interprète 401 comme « session
      //   expirée » et déconnecterait l'utilisateur pour une simple faute de frappe.
      throw new BadRequestException("L'ancien mot de passe est incorrect.");
    }
    if (ancien === nouveau) {
      throw new BadRequestException("Le nouveau mot de passe doit être différent de l'ancien.");
    }

    await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { motDePasseHash: await bcrypt.hash(nouveau, COUT_BCRYPT) },
    });
    await this.audit.enregistrer({
      utilisateurId,
      action: 'CHANGEMENT_MOT_DE_PASSE',
      entite: 'Utilisateur',
      entiteId: utilisateurId,
    });
    return { message: 'Mot de passe modifié.' };
  }

  /**
   * Vérifie que le profil choisi existe, et que seul un administrateur
   * peut donner le profil Administrateur.
   */
  private async verifierRole(roleId: number, auteur: UtilisateurConnecte, base: Base = this.prisma) {
    const role = await base.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Profil introuvable.');
    if (role.code === ROLES.ADMIN && auteur.role !== ROLES.ADMIN) {
      throw new ForbiddenException('Seul un administrateur peut donner le profil Administrateur.');
    }
  }
}
