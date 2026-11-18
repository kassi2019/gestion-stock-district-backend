/**
 * =============================================================================
 * SERVICE DES RÉCEPTIONS FOURNISSEURS (spec nov. 2026, §3)
 * =============================================================================
 * Une réception enregistre une livraison reçue d'un fournisseur du district :
 * fournisseur, date, n° de bon de livraison / facture fournisseur, et pour
 * chaque produit la quantité reçue, le n° de lot et la date de péremption.
 *
 * Il n'y a plus de commande : le district commande dans l'application
 * nationale.
 *
 * PRIX D'ACHAT : SAISI sur chaque ligne (retours de recette nov. 2026).
 *   - l'écran propose par défaut le DERNIER PRIX D'ACHAT du médicament
 *     (voir prixAchat() : dernière réception validée, sinon Paramétrage > Prix) ;
 *   - l'utilisateur peut le modifier à chaque réception (le prix varie selon
 *     le fournisseur et d'une livraison à l'autre) ;
 *   - il est enregistré sur la LIGNE DE RÉCEPTION uniquement : la fiche du
 *     médicament et les prix du Paramétrage ne changent pas.
 *
 * OBSERVATIONS : une observation générale (toute la réception / la facture)
 * et une observation facultative par ligne.
 *
 * Cycle de vie :
 *   BROUILLON ──valider──► VALIDEE        (le STOCK du district augmente)
 *       └──────annuler───► ANNULEE        (seulement en brouillon)
 *
 * ⚠ Le stock ne bouge QU'À LA VALIDATION. Pour chaque ligne :
 *   1. le LOT est retrouvé ou créé (médicament + n° de lot) ;
 *   2. la ligne de STOCK du dépôt (médicament + lot) est augmentée ;
 *   3. un MOUVEMENT de stock « ENTREE_RECEPTION » est enregistré (stock avant
 *      / après, prix, n° du bon) : c'est une entrée RÉELLE, distincte d'un
 *      ajustement.
 * Tout est fait dans UNE transaction : soit tout, soit rien.
 *
 * Une réception VALIDÉE n'est ni modifiée ni supprimée : une erreur se
 * corrige par un ajustement tracé (module Stock > mouvement manuel).
 *
 * Règle : médicament « suivi par lot » -> n° de lot ET date de péremption
 * obligatoires (vérifié à la validation). Pour les autres, ils sont facultatifs.
 *
 * Numéro automatique : BR-2026-00001 (repart à 1 chaque année).
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_PIECE, TYPE_COMPTEUR, TYPE_MOUVEMENT_DEPOT } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { PrixService } from '../parametrage/prix/prix.service';
import { CreerReceptionDto, LigneReceptionDto, ModifierReceptionDto } from './achats.dto';

/** Arrondi à 2 décimales. */
function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

/** Montant total des lignes (quantité × prix). */
function montantTotal(lignes: { quantite: number; prixUnitaire: number }[]) {
  return arrondi(lignes.reduce((total, l) => total + l.quantite * l.prixUnitaire, 0));
}

const S = STATUT_PIECE;

/** Informations renvoyées pour une réception (avec ses lignes). */
const INCLURE_DETAIL = {
  fournisseur: true,
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
    private prix: PrixService,
  ) {}

  /** Liste des réceptions (les plus récentes d'abord), avec filtres. */
  lister(filtres: FiltresReceptions) {
    return this.prisma.reception.findMany({
      where: {
        ...(filtres.fournisseurId ? { fournisseurId: filtres.fournisseurId } : {}),
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
    await this.preparer(dto.fournisseurId, dto.lignes);
    const dateReception = texteVersDate(dto.dateReception);
    const lignes = dto.lignes; // chaque ligne porte son prix d'achat saisi

    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.BON_RECEPTION, dateReception);
      const reception = await tx.reception.create({
        data: {
          numero,
          fournisseurId: dto.fournisseurId,
          dateReception,
          numFactureFourn: dto.numFactureFourn,
          numBonLivraison: dto.numBonLivraison,
          observations: dto.observations,
          statut: S.BROUILLON,
          utilisateurId,
          montantTotal: montantTotal(lignes),
          lignes: { create: lignes.map(versLigne) },
        },
      });
      await this.audit.enregistrer(
        { utilisateurId, action: 'CREATION', entite: 'Reception', entiteId: reception.id, apres: { ...reception, lignes } },
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

    // Lignes : celles envoyées, sinon celles déjà enregistrées (avec leur prix saisi).
    const lignes: LigneReceptionDto[] =
      dto.lignes ??
      avant.lignes.map((l) => ({
        medicamentId: l.medicamentId,
        quantite: l.quantite,
        prixUnitaire: Number(l.prixUnitaire),
        numeroLot: l.numeroLot ?? undefined,
        datePeremption: l.datePeremption ? l.datePeremption.toISOString().substring(0, 10) : undefined,
        observation: l.observation ?? undefined,
      }));
    const fournisseurId = dto.fournisseurId ?? avant.fournisseurId;
    const dateReception = dto.dateReception ? texteVersDate(dto.dateReception) : avant.dateReception;
    await this.preparer(fournisseurId, lignes);

    await this.prisma.$transaction(async (tx) => {
      await tx.ligneReception.deleteMany({ where: { receptionId: id } });
      await tx.ligneReception.createMany({ data: lignes.map((l) => ({ ...versLigne(l), receptionId: id })) });
      const apres = await tx.reception.update({
        where: { id },
        data: {
          fournisseurId,
          dateReception,
          ...(dto.numFactureFourn !== undefined ? { numFactureFourn: dto.numFactureFourn } : {}),
          ...(dto.numBonLivraison !== undefined ? { numBonLivraison: dto.numBonLivraison } : {}),
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
          montantTotal: montantTotal(lignes),
        },
      });
      await this.audit.enregistrer(
        { utilisateurId, action: 'MODIFICATION', entite: 'Reception', entiteId: id, avant, apres: { ...apres, lignes } },
        tx,
      );
    });
    return this.trouver(id);
  }

  /**
   * VALIDATION : entrée en stock (lots, stock du dépôt, mouvements), au prix
   * d'achat SAISI sur chaque ligne. Irréversible (correction = ajustement tracé).
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

    await this.prisma.$transaction(async (tx) => {
      let total = 0;
      for (const ligne of reception.lignes) {
        // 0. Prix d'achat saisi sur la ligne (déjà enregistré avec le brouillon)
        const prixUnitaire = Number(ligne.prixUnitaire);
        total += arrondi(ligne.quantite * prixUnitaire);

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
            prixUnitaire,
            motif: `Réception fournisseur ${reception.fournisseur.raisonSociale}`,
            pieceRef: reception.numero,
            sourceType: 'RECEPTION',
            sourceId: reception.id,
            utilisateurId,
          },
        });
      }

      // 5. Réception validée (montant total recalculé par sécurité)
      const apres = await tx.reception.update({
        where: { id },
        data: { statut: S.VALIDEE, validePar: utilisateurId, dateValidation: new Date(), montantTotal: arrondi(total) },
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
        'Une réception validée ne peut pas être annulée : corrigez le stock par un ajustement (module Stock).',
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
   * fournisseur, médicament et période.
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
            numBonLivraison: true,
            fournisseur: { select: { id: true, raisonSociale: true } },
          },
        },
      },
      orderBy: [{ reception: { dateReception: 'desc' } }, { id: 'asc' }],
    });
  }

  /**
   * Prix d'achat PROPOSÉS par défaut dans l'écran de saisie (modifiables).
   * Pour chaque médicament, on prend le DERNIER PRIX D'ACHAT, dans cet ordre :
   *   1. dernière réception validée de ce médicament chez CE fournisseur ;
   *   2. sinon, dernière réception validée chez n'importe quel fournisseur ;
   *   3. sinon, le prix d'achat de Paramétrage > Prix à cette date ;
   *   4. sinon null (l'utilisateur saisit le prix).
   * Renvoie { medicamentId: prix | null }.
   */
  async prixAchat(medicamentIds: number[], fournisseurId?: number, date?: string) {
    const jour = date ? texteVersDate(date) : new Date();
    const resultat: Record<number, number | null> = {};
    for (const id of medicamentIds) {
      const dernier = await this.dernierPrixReception(id, fournisseurId);
      if (dernier !== null) {
        resultat[id] = dernier;
        continue;
      }
      const p = await this.prix.prixAchatApplicable(id, jour, fournisseurId);
      resultat[id] = p === null ? null : Number(p);
    }
    return resultat;
  }

  /** Prix de la dernière réception VALIDÉE du médicament (chez ce fournisseur d'abord), sinon null. */
  private async dernierPrixReception(medicamentId: number, fournisseurId?: number) {
    const plusRecente = [{ reception: { dateReception: 'desc' as const } }, { id: 'desc' as const }];
    if (fournisseurId) {
      const chezFournisseur = await this.prisma.ligneReception.findFirst({
        where: { medicamentId, reception: { statut: S.VALIDEE, fournisseurId } },
        orderBy: plusRecente,
        select: { prixUnitaire: true },
      });
      if (chezFournisseur) return Number(chezFournisseur.prixUnitaire);
    }
    const tousFournisseurs = await this.prisma.ligneReception.findFirst({
      where: { medicamentId, reception: { statut: S.VALIDEE } },
      orderBy: plusRecente,
      select: { prixUnitaire: true },
    });
    return tousFournisseurs ? Number(tousFournisseurs.prixUnitaire) : null;
  }

  // ===========================================================================
  // VÉRIFICATIONS
  // ===========================================================================

  /**
   * Vérifie la réception avant enregistrement :
   *   - médicaments existants, sans doublon (même médicament + même lot) ;
   *   - fournisseur existant et actif.
   */
  private async preparer(fournisseurId: number, lignes: LigneReceptionDto[]) {
    // Un même médicament peut arriver en plusieurs lots : on l'autorise s'ils ont des lots différents
    const cles = lignes.map((l) => `${l.medicamentId}|${(l.numeroLot || '').trim().toUpperCase()}`);
    if (new Set(cles).size !== cles.length) {
      throw new BadRequestException('Un même médicament (et même lot) apparaît plusieurs fois : regroupez les quantités.');
    }
    const ids = lignes.map((l) => l.medicamentId);
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      if (!medicaments.some((m) => m.id === id)) throw new NotFoundException('Médicament introuvable.');
    }

    const fournisseur = await this.prisma.fournisseur.findUnique({ where: { id: fournisseurId } });
    if (!fournisseur) throw new NotFoundException('Fournisseur introuvable.');
    if (!fournisseur.actif) throw new BadRequestException(`Le fournisseur « ${fournisseur.raisonSociale} » est désactivé.`);
  }
}

/** Ligne prête pour la base (montant = quantité × prix d'achat saisi). */
function versLigne(l: LigneReceptionDto) {
  return {
    medicamentId: l.medicamentId,
    quantite: l.quantite,
    prixUnitaire: arrondi(l.prixUnitaire),
    montant: arrondi(l.quantite * l.prixUnitaire),
    numeroLot: l.numeroLot?.trim() || null,
    datePeremption: l.datePeremption ? texteVersDate(l.datePeremption) : null,
    observation: l.observation?.trim() || null,
  };
}
