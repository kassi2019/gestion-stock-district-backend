/**
 * =============================================================================
 * SERVICE DES RÉCEPTIONS (module 03 Approvisionnements et achats)
 * =============================================================================
 * Une réception enregistre les médicaments réellement livrés par un
 * fournisseur : quantités reçues, prix unitaires, n° de lot et péremption.
 * Elle peut être liée à une COMMANDE (réception totale ou partielle) ou être
 * DIRECTE (achat sans commande préalable).
 *
 * Cycle de vie :
 *   BROUILLON ──valider──► VALIDEE        (le STOCK du dépôt augmente)
 *       └──────annuler───► ANNULEE        (seulement en brouillon)
 *
 * ⚠ Le stock ne bouge QU'À LA VALIDATION. Pour chaque ligne :
 *   1. le LOT est retrouvé ou créé (médicament + n° de lot) ;
 *   2. la ligne de STOCK du dépôt (médicament + lot) est augmentée ;
 *   3. un MOUVEMENT de stock « ENTREE_RECEPTION » est enregistré (stock avant
 *      / après du médicament, prix, n° du bon) : c'est une entrée RÉELLE,
 *      distincte d'un ajustement (cahier des charges §3.3) ;
 *   4. si la réception est liée à une commande : la quantité reçue de la
 *      ligne de commande augmente, et la commande passe en
 *      PARTIELLEMENT_RECUE ou RECUE.
 * Tout est fait dans UNE transaction : soit tout, soit rien.
 *
 * Une réception VALIDÉE n'est ni modifiée ni supprimée : une erreur se
 * corrige par une régularisation de stock traçable (module Stock).
 *
 * Règles :
 *   - médicament « suivi par lot » : n° de lot ET date de péremption
 *     obligatoires (vérifié à la validation) ;
 *   - avec une commande : on ne reçoit que des médicaments de la commande, et
 *     pas plus que la quantité restant à recevoir.
 *
 * Numéro automatique : BR-2026-00001 (repart à 1 chaque année).
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_COMMANDE_FOURNISSEUR, STATUT_PIECE, TYPE_COMPTEUR, TYPE_MOUVEMENT_DEPOT } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { CreerReceptionDto, LigneReceptionDto, ModifierReceptionDto } from './achats.dto';
import { arrondi, montantTotal } from './commandes.service';

const S = STATUT_PIECE;

/** Informations renvoyées pour une réception (avec ses lignes). */
const INCLURE_DETAIL = {
  fournisseur: true,
  commande: { select: { id: true, numero: true, dateCommande: true, statut: true } },
  utilisateur: { select: { id: true, nom: true, prenoms: true } },
  validateur: { select: { id: true, nom: true, prenoms: true } },
  lignes: {
    include: {
      medicament: {
        select: { id: true, code: true, designation: true, dosage: true, suiviLot: true, uniteVente: { select: { libelle: true } } },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.ReceptionInclude;

export interface FiltresReceptions {
  fournisseurId?: number;
  commandeId?: number;
  statut?: string;
  du?: string;
  au?: string;
}

export interface FiltresHistorique {
  fournisseurId?: number;
  medicamentId?: number;
  du?: string;
  au?: string;
}

@Injectable()
export class ReceptionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des réceptions (les plus récentes d'abord), avec filtres. */
  lister(filtres: FiltresReceptions) {
    return this.prisma.reception.findMany({
      where: {
        ...(filtres.fournisseurId ? { fournisseurId: filtres.fournisseurId } : {}),
        ...(filtres.commandeId ? { commandeId: filtres.commandeId } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        ...(filtres.du || filtres.au
          ? {
              dateReception: {
                ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}),
                ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}),
              },
            }
          : {}),
      },
      include: {
        fournisseur: { select: { id: true, code: true, raisonSociale: true } },
        commande: { select: { id: true, numero: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: [{ dateReception: 'desc' }, { id: 'desc' }],
    });
  }

  async trouver(id: number) {
    const reception = await this.prisma.reception.findUnique({ where: { id }, include: INCLURE_DETAIL });
    if (!reception) throw new NotFoundException('Réception introuvable.');
    return reception;
  }

  /** Création d'une réception en BROUILLON (le stock ne bouge pas encore). */
  async creer(dto: CreerReceptionDto, utilisateurId: number) {
    const fournisseurId = await this.preparer(dto.commandeId ?? null, dto.fournisseurId, dto.lignes);
    const dateReception = texteVersDate(dto.dateReception);

    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.BON_RECEPTION, dateReception);
      const reception = await tx.reception.create({
        data: {
          numero,
          commandeId: dto.commandeId ?? null,
          fournisseurId,
          dateReception,
          numFactureFourn: dto.numFactureFourn,
          numBonLivraison: dto.numBonLivraison,
          observations: dto.observations,
          statut: S.BROUILLON,
          utilisateurId,
          montantTotal: montantTotal(dto.lignes),
          lignes: { create: dto.lignes.map(versLigne) },
        },
      });
      await this.audit.enregistrer(
        { utilisateurId, action: 'CREATION', entite: 'Reception', entiteId: reception.id, apres: { ...reception, lignes: dto.lignes } },
        tx,
      );
      return reception.id;
    });
    return this.trouver(id);
  }

  /** Modification d'une réception EN BROUILLON (les lignes sont remplacées). */
  async modifier(id: number, dto: ModifierReceptionDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une réception en brouillon peut être modifiée.');

    const commandeId = dto.commandeId !== undefined ? dto.commandeId ?? null : avant.commandeId;
    const lignes = dto.lignes ?? avant.lignes.map((l) => ({
      medicamentId: l.medicamentId,
      quantite: l.quantite,
      prixUnitaire: Number(l.prixUnitaire),
      numeroLot: l.numeroLot ?? undefined,
      datePeremption: l.datePeremption ? l.datePeremption.toISOString().substring(0, 10) : undefined,
    }));
    const fournisseurId = await this.preparer(commandeId, dto.fournisseurId ?? avant.fournisseurId, lignes, id);

    await this.prisma.$transaction(async (tx) => {
      if (dto.lignes) {
        await tx.ligneReception.deleteMany({ where: { receptionId: id } });
        await tx.ligneReception.createMany({ data: dto.lignes.map((l) => ({ ...versLigne(l), receptionId: id })) });
      }
      const apres = await tx.reception.update({
        where: { id },
        data: {
          commandeId,
          fournisseurId,
          ...(dto.dateReception ? { dateReception: texteVersDate(dto.dateReception) } : {}),
          ...(dto.numFactureFourn !== undefined ? { numFactureFourn: dto.numFactureFourn } : {}),
          ...(dto.numBonLivraison !== undefined ? { numBonLivraison: dto.numBonLivraison } : {}),
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
          ...(dto.lignes ? { montantTotal: montantTotal(dto.lignes) } : {}),
        },
      });
      await this.audit.enregistrer(
        { utilisateurId, action: 'MODIFICATION', entite: 'Reception', entiteId: id, avant, apres: { ...apres, lignes: dto.lignes } },
        tx,
      );
    });
    return this.trouver(id);
  }

  /**
   * VALIDATION : entrée en stock (lots, stock du dépôt, mouvements) et mise à
   * jour de la commande. Irréversible (correction = régularisation).
   */
  async valider(id: number, utilisateurId: number) {
    const reception = await this.trouver(id);
    if (reception.statut !== S.BROUILLON) throw new BadRequestException('Seule une réception en brouillon peut être validée.');
    if (reception.lignes.length === 0) throw new BadRequestException('La réception ne contient aucun médicament.');

    // Lots obligatoires pour les médicaments suivis par lot
    for (const ligne of reception.lignes) {
      if (ligne.medicament.suiviLot && (!ligne.numeroLot?.trim() || !ligne.datePeremption)) {
        throw new BadRequestException(
          `« ${ligne.medicament.designation} » est suivi par lot : indiquez le n° de lot et la date de péremption.`,
        );
      }
    }
    // Quantités restant à recevoir (revérifiées : une autre réception a pu être validée entre-temps)
    if (reception.commandeId) await this.verifierRestes(reception.commandeId, reception.lignes, id);

    await this.prisma.$transaction(async (tx) => {
      for (const ligne of reception.lignes) {
        // 1. Lot (retrouvé ou créé)
        let lotId: number | null = null;
        const numeroLot = ligne.numeroLot?.trim();
        if (numeroLot) {
          const lot = await tx.lot.upsert({
            where: { medicamentId_numeroLot: { medicamentId: ligne.medicamentId, numeroLot } },
            create: { medicamentId: ligne.medicamentId, numeroLot, datePeremption: ligne.datePeremption },
            // Lot déjà connu : on complète la péremption si elle manquait
            update: ligne.datePeremption ? { datePeremption: ligne.datePeremption } : {},
          });
          lotId = lot.id;
          await tx.ligneReception.update({ where: { id: ligne.id }, data: { lotId } });
        }

        // 2. Stock du médicament AVANT (tous lots confondus), pour le mouvement
        const avant = await tx.stockDepot.aggregate({ where: { medicamentId: ligne.medicamentId }, _sum: { quantite: true } });
        const stockAvant = avant._sum.quantite ?? 0;

        // 3. Ligne de stock (médicament + lot) augmentée
        const existante = await tx.stockDepot.findFirst({ where: { medicamentId: ligne.medicamentId, lotId } });
        const stockLotAvant = existante?.quantite ?? 0;
        if (existante) {
          await tx.stockDepot.update({ where: { id: existante.id }, data: { quantite: { increment: ligne.quantite } } });
        } else {
          await tx.stockDepot.create({ data: { medicamentId: ligne.medicamentId, lotId, quantite: ligne.quantite } });
        }

        // 4. Mouvement de stock : ENTRÉE RÉELLE (réception)
        await tx.mouvementStock.create({
          data: {
            type: TYPE_MOUVEMENT_DEPOT.ENTREE_RECEPTION,
            medicamentId: ligne.medicamentId,
            lotId,
            quantite: ligne.quantite,
            stockAvant,
            stockApres: stockAvant + ligne.quantite,
            stockLotAvant,
            stockLotApres: stockLotAvant + ligne.quantite,
            prixUnitaire: ligne.prixUnitaire,
            motif: `Réception fournisseur ${reception.fournisseur.raisonSociale}`,
            pieceRef: reception.numero,
            sourceType: 'RECEPTION',
            sourceId: reception.id,
            utilisateurId,
          },
        });

        // 5. Commande : quantité reçue de la ligne
        if (reception.commandeId) {
          await tx.ligneCommandeFournisseur.updateMany({
            where: { commandeId: reception.commandeId, medicamentId: ligne.medicamentId },
            data: { quantiteRecue: { increment: ligne.quantite } },
          });
        }
      }

      // 6. Statut de la commande : tout reçu -> RECUE, sinon PARTIELLEMENT_RECUE
      if (reception.commandeId) {
        const lignesCommande = await tx.ligneCommandeFournisseur.findMany({ where: { commandeId: reception.commandeId } });
        const toutRecu = lignesCommande.every((l) => l.quantiteRecue >= l.quantite);
        await tx.commandeFournisseur.update({
          where: { id: reception.commandeId },
          data: { statut: toutRecu ? STATUT_COMMANDE_FOURNISSEUR.RECUE : STATUT_COMMANDE_FOURNISSEUR.PARTIELLEMENT_RECUE },
        });
      }

      // 7. Réception validée
      const apres = await tx.reception.update({
        where: { id },
        data: { statut: S.VALIDEE, validePar: utilisateurId, dateValidation: new Date() },
      });
      await this.audit.enregistrer(
        { utilisateurId, action: 'VALIDATION', entite: 'Reception', entiteId: id, avant: { statut: reception.statut }, apres },
        tx,
      );
    });
    return this.trouver(id);
  }

  /** Annulation d'une réception EN BROUILLON (le stock n'a pas bougé). */
  async annuler(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) {
      throw new BadRequestException(
        'Une réception validée ne peut pas être annulée : corrigez le stock par une régularisation (module Stock).',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const apres = await tx.reception.update({ where: { id }, data: { statut: S.ANNULEE } });
      await this.audit.enregistrer({ utilisateurId, action: 'ANNULATION', entite: 'Reception', entiteId: id, avant, apres }, tx);
    });
    return this.trouver(id);
  }

  /**
   * HISTORIQUE DES ACHATS : lignes des réceptions VALIDÉES, filtrées par
   * fournisseur, médicament et période (cahier des charges §3.2).
   */
  historique(filtres: FiltresHistorique) {
    return this.prisma.ligneReception.findMany({
      where: {
        ...(filtres.medicamentId ? { medicamentId: filtres.medicamentId } : {}),
        reception: {
          statut: S.VALIDEE,
          ...(filtres.fournisseurId ? { fournisseurId: filtres.fournisseurId } : {}),
          ...(filtres.du || filtres.au
            ? {
                dateReception: {
                  ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}),
                  ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        medicament: { select: { id: true, code: true, designation: true, uniteVente: { select: { libelle: true } } } },
        reception: {
          select: {
            id: true,
            numero: true,
            dateReception: true,
            numFactureFourn: true,
            fournisseur: { select: { id: true, raisonSociale: true } },
            commande: { select: { numero: true } },
          },
        },
      },
      orderBy: [{ reception: { dateReception: 'desc' } }, { id: 'asc' }],
    });
  }

  // ===========================================================================
  // VÉRIFICATIONS
  // ===========================================================================

  /**
   * Vérifie la réception avant enregistrement et renvoie le fournisseur :
   *   - avec commande : commande validée (ou partiellement reçue), fournisseur
   *     de la commande, médicaments de la commande, quantités ≤ restes ;
   *   - sans commande : fournisseur obligatoire et actif.
   */
  private async preparer(commandeId: number | null, fournisseurId: number | undefined, lignes: LigneReceptionDto[], receptionId?: number) {
    const ids = lignes.map((l) => l.medicamentId);
    if (new Set(ids).size !== ids.length) {
      // Un même médicament peut arriver en plusieurs lots : on l'autorise s'ils ont des lots différents
      const cles = lignes.map((l) => `${l.medicamentId}|${(l.numeroLot || '').trim().toUpperCase()}`);
      if (new Set(cles).size !== cles.length) {
        throw new BadRequestException('Un même médicament (et même lot) apparaît plusieurs fois : regroupez les quantités.');
      }
    }
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      if (!medicaments.some((m) => m.id === id)) throw new NotFoundException('Médicament introuvable.');
    }

    if (commandeId) {
      const commande = await this.prisma.commandeFournisseur.findUnique({ where: { id: commandeId } });
      if (!commande) throw new NotFoundException('Commande introuvable.');
      if (commande.statut !== STATUT_COMMANDE_FOURNISSEUR.VALIDEE && commande.statut !== STATUT_COMMANDE_FOURNISSEUR.PARTIELLEMENT_RECUE) {
        throw new BadRequestException(`La commande ${commande.numero} n'est pas en attente de réception (statut : ${commande.statut}).`);
      }
      await this.verifierRestes(commandeId, lignes, receptionId);
      return commande.fournisseurId;
    }

    if (!fournisseurId) throw new BadRequestException('Choisissez le fournisseur (ou la commande).');
    const fournisseur = await this.prisma.fournisseur.findUnique({ where: { id: fournisseurId } });
    if (!fournisseur) throw new NotFoundException('Fournisseur introuvable.');
    if (!fournisseur.actif) throw new BadRequestException(`Le fournisseur « ${fournisseur.raisonSociale} » est désactivé.`);
    return fournisseurId;
  }

  /**
   * Vérifie, pour une commande, que chaque médicament reçu est commandé et
   * que la quantité ne dépasse pas le reste à recevoir (en tenant compte des
   * autres réceptions EN BROUILLON de la même commande).
   */
  private async verifierRestes(commandeId: number, lignes: { medicamentId: number; quantite: number }[], receptionId?: number) {
    const lignesCommande = await this.prisma.ligneCommandeFournisseur.findMany({
      where: { commandeId },
      include: { medicament: { select: { designation: true } } },
    });
    // Quantités déjà saisies dans d'autres réceptions en brouillon de cette commande
    const autresBrouillons = await this.prisma.ligneReception.findMany({
      where: { reception: { commandeId, statut: S.BROUILLON, ...(receptionId ? { id: { not: receptionId } } : {}) } },
      select: { medicamentId: true, quantite: true },
    });

    // Total reçu dans CETTE réception, par médicament (plusieurs lots possibles)
    const totaux = new Map<number, number>();
    for (const l of lignes) totaux.set(l.medicamentId, (totaux.get(l.medicamentId) ?? 0) + l.quantite);

    for (const [medicamentId, quantite] of totaux) {
      const ligneCommande = lignesCommande.find((l) => l.medicamentId === medicamentId);
      if (!ligneCommande) throw new BadRequestException("Un médicament reçu ne figure pas sur la commande.");
      const enBrouillon = autresBrouillons.filter((l) => l.medicamentId === medicamentId).reduce((t, l) => t + l.quantite, 0);
      const reste = ligneCommande.quantite - ligneCommande.quantiteRecue - enBrouillon;
      if (quantite > reste) {
        throw new BadRequestException(
          `« ${ligneCommande.medicament.designation} » : ${quantite} reçu(s) pour ${Math.max(reste, 0)} restant(s) à recevoir sur la commande.`,
        );
      }
    }
  }
}

/** Ligne prête pour la base (montant = quantité × prix). */
function versLigne(l: LigneReceptionDto) {
  return {
    medicamentId: l.medicamentId,
    quantite: l.quantite,
    prixUnitaire: l.prixUnitaire,
    montant: arrondi(l.quantite * l.prixUnitaire),
    numeroLot: l.numeroLot?.trim() || null,
    datePeremption: l.datePeremption ? texteVersDate(l.datePeremption) : null,
  };
}
