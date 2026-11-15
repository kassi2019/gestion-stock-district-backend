/**
 * =============================================================================
 * SERVICE DES COMMANDES FOURNISSEURS (module 03 Approvisionnements et achats)
 * =============================================================================
 * Cycle de vie d'une commande :
 *
 *   BROUILLON ──valider──► VALIDEE ──(réceptions)──► PARTIELLEMENT_RECUE ──► RECUE
 *       │                     │
 *       └──────annuler────────┴──► ANNULEE   (seulement si rien n'a été reçu)
 *
 *   - BROUILLON : modifiable (fournisseur, date, lignes) ;
 *   - VALIDEE   : le bon de commande peut être envoyé au fournisseur ;
 *                 la commande n'est plus modifiable ;
 *   - les quantités reçues sont mises à jour à la VALIDATION des réceptions
 *     (voir receptions.service.ts), qui fait passer la commande en
 *     PARTIELLEMENT_RECUE puis RECUE.
 *
 * Numéro automatique : BCF-2026-00001 (repart à 1 chaque année).
 * Chaque opération est inscrite dans le journal d'audit.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_COMMANDE_FOURNISSEUR, TYPE_COMPTEUR } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { CreerCommandeDto, LigneCommandeDto, ModifierCommandeDto } from './achats.dto';

const S = STATUT_COMMANDE_FOURNISSEUR;

/** Informations renvoyées pour une commande (avec ses lignes). */
const INCLURE_DETAIL = {
  fournisseur: true,
  utilisateur: { select: { id: true, nom: true, prenoms: true } },
  lignes: {
    include: {
      medicament: {
        select: { id: true, code: true, designation: true, dosage: true, suiviLot: true, uniteVente: { select: { libelle: true } } },
      },
    },
    orderBy: { id: 'asc' },
  },
  receptions: { select: { id: true, numero: true, dateReception: true, statut: true, montantTotal: true } },
} satisfies Prisma.CommandeFournisseurInclude;

export interface FiltresCommandes {
  fournisseurId?: number;
  statut?: string;
  du?: string;
  au?: string;
}

@Injectable()
export class CommandesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des commandes (les plus récentes d'abord), avec filtres. */
  async lister(filtres: FiltresCommandes) {
    const commandes = await this.prisma.commandeFournisseur.findMany({
      where: {
        ...(filtres.fournisseurId ? { fournisseurId: filtres.fournisseurId } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        ...(filtres.du || filtres.au
          ? {
              dateCommande: {
                ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}),
                ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}),
              },
            }
          : {}),
      },
      include: {
        fournisseur: { select: { id: true, code: true, raisonSociale: true } },
        lignes: { select: { quantite: true, quantiteRecue: true } },
      },
      orderBy: [{ dateCommande: 'desc' }, { id: 'desc' }],
    });
    // Résumé : nombre de lignes et taux de réception (en quantités)
    return commandes.map(({ lignes, ...commande }) => {
      const commandee = lignes.reduce((t, l) => t + l.quantite, 0);
      const recue = lignes.reduce((t, l) => t + l.quantiteRecue, 0);
      return { ...commande, nombreLignes: lignes.length, quantiteCommandee: commandee, quantiteRecue: recue };
    });
  }

  async trouver(id: number) {
    const commande = await this.prisma.commandeFournisseur.findUnique({ where: { id }, include: INCLURE_DETAIL });
    if (!commande) throw new NotFoundException('Commande introuvable.');
    return commande;
  }

  /** Création d'une commande en BROUILLON (numéro automatique). */
  async creer(dto: CreerCommandeDto, utilisateurId: number) {
    await this.verifierFournisseur(dto.fournisseurId);
    await this.verifierMedicaments(dto.lignes);
    const dateCommande = texteVersDate(dto.dateCommande);

    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.COMMANDE_FOURNISSEUR, dateCommande);
      const commande = await tx.commandeFournisseur.create({
        data: {
          numero,
          fournisseurId: dto.fournisseurId,
          dateCommande,
          observations: dto.observations,
          statut: S.BROUILLON,
          utilisateurId,
          montantTotal: montantTotal(dto.lignes),
          lignes: { create: dto.lignes.map(versLigne) },
        },
      });
      await this.audit.enregistrer(
        { utilisateurId, action: 'CREATION', entite: 'CommandeFournisseur', entiteId: commande.id, apres: { ...commande, lignes: dto.lignes } },
        tx,
      );
      return commande.id;
    });
    return this.trouver(id);
  }

  /** Modification d'une commande EN BROUILLON (les lignes sont remplacées). */
  async modifier(id: number, dto: ModifierCommandeDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) {
      throw new BadRequestException('Seule une commande en brouillon peut être modifiée.');
    }
    if (dto.fournisseurId) await this.verifierFournisseur(dto.fournisseurId);
    if (dto.lignes) await this.verifierMedicaments(dto.lignes);

    await this.prisma.$transaction(async (tx) => {
      if (dto.lignes) {
        await tx.ligneCommandeFournisseur.deleteMany({ where: { commandeId: id } });
        await tx.ligneCommandeFournisseur.createMany({ data: dto.lignes.map((l) => ({ ...versLigne(l), commandeId: id })) });
      }
      const apres = await tx.commandeFournisseur.update({
        where: { id },
        data: {
          ...(dto.fournisseurId ? { fournisseurId: dto.fournisseurId } : {}),
          ...(dto.dateCommande ? { dateCommande: texteVersDate(dto.dateCommande) } : {}),
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
          ...(dto.lignes ? { montantTotal: montantTotal(dto.lignes) } : {}),
        },
      });
      await this.audit.enregistrer(
        { utilisateurId, action: 'MODIFICATION', entite: 'CommandeFournisseur', entiteId: id, avant, apres: { ...apres, lignes: dto.lignes } },
        tx,
      );
    });
    return this.trouver(id);
  }

  /** Validation : la commande n'est plus modifiable et peut être reçue. */
  async valider(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une commande en brouillon peut être validée.');
    if (avant.lignes.length === 0) throw new BadRequestException('La commande ne contient aucun médicament.');
    await this.changerStatut(id, S.VALIDEE, 'VALIDATION', utilisateurId, avant);
    return this.trouver(id);
  }

  /** Annulation (seulement si aucune réception n'a été validée). */
  async annuler(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON && avant.statut !== S.VALIDEE) {
      throw new BadRequestException('Impossible d\'annuler : des médicaments ont déjà été reçus sur cette commande.');
    }
    if (avant.receptions.some((r) => r.statut !== 'ANNULEE')) {
      throw new BadRequestException("Impossible d'annuler : une réception est enregistrée sur cette commande (annulez-la d'abord).");
    }
    await this.changerStatut(id, S.ANNULEE, 'ANNULATION', utilisateurId, avant);
    return this.trouver(id);
  }

  private async changerStatut(id: number, statut: string, action: string, utilisateurId: number, avant: unknown) {
    await this.prisma.$transaction(async (tx) => {
      const apres = await tx.commandeFournisseur.update({ where: { id }, data: { statut } });
      await this.audit.enregistrer({ utilisateurId, action, entite: 'CommandeFournisseur', entiteId: id, avant, apres }, tx);
    });
  }

  private async verifierFournisseur(fournisseurId: number) {
    const fournisseur = await this.prisma.fournisseur.findUnique({ where: { id: fournisseurId } });
    if (!fournisseur) throw new NotFoundException('Fournisseur introuvable.');
    if (!fournisseur.actif) throw new BadRequestException(`Le fournisseur « ${fournisseur.raisonSociale} » est désactivé.`);
  }

  /** Vérifie que les médicaments existent, sont actifs et ne sont pas en double. */
  private async verifierMedicaments(lignes: LigneCommandeDto[]) {
    const ids = lignes.map((l) => l.medicamentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Un même médicament apparaît plusieurs fois : regroupez les quantités sur une seule ligne.');
    }
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      const med = medicaments.find((m) => m.id === id);
      if (!med) throw new NotFoundException('Médicament introuvable.');
      if (!med.actif) throw new BadRequestException(`Le médicament « ${med.designation} » est désactivé.`);
    }
  }
}

/** Ligne prête pour la base (montant = quantité × prix). */
function versLigne(l: LigneCommandeDto) {
  return { medicamentId: l.medicamentId, quantite: l.quantite, prixUnitaire: l.prixUnitaire, montant: arrondi(l.quantite * l.prixUnitaire) };
}

/** Montant total d'une liste de lignes. */
export function montantTotal(lignes: { quantite: number; prixUnitaire: number }[]) {
  return arrondi(lignes.reduce((total, l) => total + l.quantite * l.prixUnitaire, 0));
}

/** Arrondi à 2 décimales. */
export function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}
