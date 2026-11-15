/**
 * =============================================================================
 * SERVICE DU PERSONNEL (module 02 Utilisateurs)
 * =============================================================================
 * Fiche de chaque membre du personnel du district et des centres :
 * matricule (OBLIGATOIRE : c'est l'identifiant de connexion), nom, prénoms,
 * fonction (table fonctions), lieu d'affectation, contacts.
 *
 * - CRÉATION : le matricule est obligatoire et unique ; un compte
 *   utilisateur peut être créé EN MÊME TEMPS (champ « compte ») : tout est
 *   enregistré dans une seule transaction (soit tout, soit rien).
 * - MODIFICATION : le nom, la fonction et les contacts sont recopiés dans le
 *   compte utilisateur de la personne (s'il existe) ; si le MATRICULE change,
 *   l'identifiant de connexion change aussi (identifiant = matricule).
 * - DÉSACTIVATION : le compte utilisateur est désactivé aussi (et réactivé
 *   avec la fiche). Un membre du personnel n'est jamais supprimé.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { traduireErreurPrisma } from '../common/prisma-erreurs';
import { ROLES } from '../common/constants';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { CompteDto } from './utilisateurs.dto';
import { CreerPersonnelDto, ModifierPersonnelDto } from './personnel.dto';
import { UtilisateursService } from './utilisateurs.service';

/** Informations renvoyées pour chaque membre du personnel. */
const INCLURE = {
  centre: { select: { id: true, nom: true } },
  fonction: { select: { id: true, code: true, libelle: true } },
  comptes: {
    select: { id: true, login: true, actif: true, role: { select: { id: true, code: true, libelle: true } } },
  },
} as const;

@Injectable()
export class PersonnelService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private utilisateursService: UtilisateursService,
  ) {}

  /** Liste du personnel, triée par nom (avec affectation et compte). */
  lister() {
    return this.prisma.personnel.findMany({
      include: INCLURE,
      orderBy: [{ nom: 'asc' }, { prenoms: 'asc' }],
    });
  }

  async trouver(id: number) {
    const personnel = await this.prisma.personnel.findUnique({ where: { id }, include: INCLURE });
    if (!personnel) throw new NotFoundException('Membre du personnel introuvable.');
    return personnel;
  }

  /** Création d'une fiche (+ compte utilisateur si « compte » est rempli). */
  async creer(dto: CreerPersonnelDto, auteur: UtilisateurConnecte) {
    const { compte, ...donnees } = dto;
    try {
      // Matricule obligatoire et unique (message clair s'il est déjà pris)
      const matricule = donnees.matricule.trim();
      if (await this.prisma.personnel.findUnique({ where: { matricule } })) {
        throw new BadRequestException(`Le matricule « ${matricule} » est déjà attribué à une autre personne.`);
      }

      const id = await this.prisma.$transaction(async (tx) => {
        const personnel = await tx.personnel.create({ data: { ...donnees, matricule } });
        await this.audit.enregistrer(
          { utilisateurId: auteur.id, action: 'CREATION', entite: 'Personnel', entiteId: personnel.id, apres: personnel },
          tx,
        );
        // Compte utilisateur créé en même temps (même transaction)
        if (compte) await this.utilisateursService.creerCompte(tx, personnel.id, compte, auteur);
        return personnel.id;
      });
      return this.trouver(id);
    } catch (erreur) {
      traduireErreurPrisma(erreur, compte ? 'personnel ou identifiant' : 'personnel');
    }
  }

  /** Modification d'une fiche (l'identité est recopiée dans le compte). */
  async modifier(id: number, dto: ModifierPersonnelDto, auteur: UtilisateurConnecte) {
    const avant = await this.trouver(id);
    const compte = avant.comptes[0];

    // Matricule effacé : on garde l'ancien (il est obligatoire)
    if (dto.matricule !== undefined && !dto.matricule?.trim()) delete dto.matricule;
    // Matricule changé : il ne doit pas déjà appartenir à quelqu'un d'autre
    if (dto.matricule && dto.matricule !== avant.matricule) {
      const pris = await this.prisma.personnel.findUnique({ where: { matricule: dto.matricule } });
      if (pris) throw new BadRequestException(`Le matricule « ${dto.matricule} » est déjà attribué à une autre personne.`);
    }

    // Désactivation de la fiche = désactivation du compte : mêmes règles que pour un compte
    if (dto.actif === false && compte?.actif) {
      if (compte.id === auteur.id) {
        throw new BadRequestException('Vous ne pouvez pas désactiver votre propre fiche (votre compte serait désactivé).');
      }
      if (compte.role.code === ROLES.ADMIN) {
        const autresAdminsActifs = await this.prisma.utilisateur.count({
          where: { actif: true, role: { code: ROLES.ADMIN }, id: { not: compte.id } },
        });
        if (autresAdminsActifs === 0) {
          throw new BadRequestException(
            'Opération impossible : cette personne est le dernier administrateur actif.',
          );
        }
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const apres = await tx.personnel.update({ where: { id }, data: dto });
        // Nom, fonction, contacts (et identifiant si le matricule change) recopiés dans le compte
        const matriculeModifie = dto.matricule !== undefined && dto.matricule !== avant.matricule;
        await this.utilisateursService.synchroniserIdentite(tx, id, matriculeModifie);
        // Activation / désactivation du compte avec la fiche
        if (dto.actif !== undefined && compte && compte.actif !== dto.actif) {
          await tx.utilisateur.update({ where: { id: compte.id }, data: { actif: dto.actif } });
        }
        await this.audit.enregistrer(
          {
            utilisateurId: auteur.id,
            action: dto.actif === false ? 'DESACTIVATION' : 'MODIFICATION',
            entite: 'Personnel',
            entiteId: id,
            avant,
            apres,
          },
          tx,
        );
      });
      return this.trouver(id);
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'personnel');
    }
  }

  /** Crée un compte utilisateur pour une personne qui n'en a pas encore. */
  async creerCompte(id: number, compte: CompteDto, auteur: UtilisateurConnecte) {
    await this.trouver(id);
    try {
      await this.prisma.$transaction((tx) => this.utilisateursService.creerCompte(tx, id, compte, auteur));
      return this.trouver(id);
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'identifiant');
    }
  }
}
