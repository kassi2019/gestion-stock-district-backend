/**
 * =============================================================================
 * SERVICE DES FACTURES-SORTIES (spec nov. 2026, §4)
 * =============================================================================
 * Chaque facture enregistre une SORTIE du district vers un centre de santé.
 * Un centre peut recevoir plusieurs factures dans le mois.
 *
 * Deux origines :
 *   - RAPPORT  : générée par la validation du rapport centre (quantité validée) ;
 *   - MANUELLE : facture complémentaire en cours de mois (urgence, rupture).
 *
 * CRÉER une facture-sortie (dans UNE transaction) :
 *   1. pour chaque produit : le stock du district (lots NON périmés) doit
 *      suffire, sinon REFUS avec le stock restant ;
 *   2. la sortie se fait lot par lot, PÉREMPTION LA PLUS PROCHE D'ABORD
 *      (le stock sans lot en dernier) : une ligne de facture par lot ;
 *   3. prix de vente (applicable au centre à la date) et prix d'achat FIGÉS
 *      sur chaque ligne (consommable : prix de vente 0) ;
 *   4. stock du district diminué (mouvement SORTIE_LIVRAISON, source FACTURE)
 *      et stock théorique du centre augmenté (mouvement LIVRAISON) ;
 *   5. la quantité compte dans la colonne « Reçu » du rapport du centre pour
 *      le MOIS DE LA FACTURE (calculé par le module Rapport centre).
 *
 * SEUIL MAXIMUM DU CENTRE (facture MANUELLE) : un centre ne doit pas avoir
 * plus de N x CMM en stock (N = MOIS_STOCK_MAX, 2 par défaut ; CMM du dernier
 * rapport centre validé). On peut lui donner au plus N x CMM - stock du centre.
 * Ex. CMM 10, stock 20 -> rien. C'est aussi une « balise » contre les centres
 * qui sous-déclarent leur consommation : s'ils n'ont pas consommé, le produit
 * est toujours chez eux. (La facture générée respecte déjà ce seuil : QaC.)
 * Produit sans historique (pas dans le dernier rapport, ou CMM 0 et stock 0 :
 * produit nouveau) : pas de limite.
 *
 * Une facture validée ne se modifie pas : une erreur se corrige par
 * l'ANNULATION tracée de la facture (voir annulerSortie) ou un ajustement.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ORIGINE_FACTURE,
  PARAM_RAPPORT,
  STATUT_FACTURE as SF,
  STATUT_RAPPORT as SR,
  TYPE_COMPTEUR,
  TYPE_FACTURE,
  TYPE_MOUVEMENT_CENTRE,
  TYPE_MOUVEMENT_DEPOT,
} from '../common/constants';
import { aujourdhui } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { PrixService } from '../parametrage/prix/prix.service';
import { StockService } from '../stock/stock.service';

/** Arrondi au centime. */
function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

/** Données d'une facture-sortie à créer. */
export interface SortieACreer {
  centreId: number;
  dateEmission: Date;
  origine: string; // ORIGINE_FACTURE.RAPPORT ou MANUELLE
  rapportId?: number | null;
  observations?: string | null;
  /** Une ligne par produit (quantités > 0) */
  lignes: { medicamentId: number; quantite: number }[];
}

/** Seuil maximum d'un produit pour un centre (voir seuilsCentre). */
export interface SeuilCentre {
  n: number; // nombre de mois de stock maximum (MOIS_STOCK_MAX)
  cmm: number; // CMM du dernier rapport validé
  stockCentre: number; // stock théorique actuel du centre
  stockMax: number; // N x CMM
  maxDonnable: number; // quantité qu'on peut encore lui donner
}

@Injectable()
export class SortiesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private prix: PrixService,
    private stock: StockService,
  ) {}

  // ===========================================================================
  // INFORMATIONS POUR L'ÉCRAN DE SAISIE
  // ===========================================================================

  /**
   * Pour chaque produit : stock DISPONIBLE au district (lots non périmés) et
   * prix de vente applicable au centre à la date, quantité en lots périmés
   * (non servable), et seuil maximum du centre (voir seuilsCentre).
   * { medicamentId: { stock, perime, prixVente, seuil } }
   */
  async infos(medicamentIds: number[], centreId: number | undefined, date: Date) {
    const disponibles = await this.stockDisponible(this.prisma, medicamentIds);
    const perimes = await this.stockPerime(this.prisma, medicamentIds);
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: medicamentIds } }, select: { id: true, consommable: true } });
    const seuils = centreId ? await this.seuilsCentre(this.prisma, centreId, medicamentIds) : new Map<number, SeuilCentre>();
    const resultat: Record<number, { stock: number; perime: number; prixVente: number | null; seuil: SeuilCentre | null }> = {};
    for (const id of medicamentIds) {
      let prixVente: number | null = null;
      if (medicaments.find((m) => m.id === id)?.consommable) prixVente = 0;
      else if (centreId) {
        const p = await this.prix.prixVenteApplicable(id, centreId, date);
        prixVente = p === null ? null : Number(p);
      }
      resultat[id] = { stock: disponibles.get(id) ?? 0, perime: perimes.get(id) ?? 0, prixVente, seuil: seuils.get(id) ?? null };
    }
    return resultat;
  }

  /** Stock disponible au district (lots non périmés), par médicament. */
  async stockDisponible(tx: Prisma.TransactionClient, medicamentIds: number[]) {
    const lots = await this.lotsDisponibles(tx, medicamentIds);
    const total = new Map<number, number>();
    for (const l of lots) total.set(l.medicamentId, (total.get(l.medicamentId) ?? 0) + l.quantite);
    return total;
  }

  /**
   * Stock PÉRIMÉ encore présent au district (lots dont la date est passée),
   * par médicament. Ce stock ne peut PAS être servi : on l'affiche seulement
   * pour expliquer pourquoi le stock servable est faible (il faut le sortir
   * du stock comme périmé).
   */
  async stockPerime(tx: Prisma.TransactionClient, medicamentIds: number[]) {
    const lots = await tx.stockDepot.findMany({
      where: { medicamentId: { in: medicamentIds }, quantite: { gt: 0 }, lot: { datePeremption: { lt: aujourdhui() } } },
      select: { medicamentId: true, quantite: true },
    });
    const total = new Map<number, number>();
    for (const l of lots) total.set(l.medicamentId, (total.get(l.medicamentId) ?? 0) + l.quantite);
    return total;
  }

  // ===========================================================================
  // CRÉATION (utilisable dans la transaction d'un autre module : rapport centre)
  // ===========================================================================

  /** Crée et valide une facture-sortie dans sa propre transaction. */
  async creer(donnees: SortieACreer, utilisateurId: number) {
    const id = await this.prisma.$transaction((tx) => this.creerDansTransaction(tx, donnees, utilisateurId), { timeout: 60000 });
    return id;
  }

  /**
   * Crée la facture-sortie DANS la transaction fournie (voir l'en-tête).
   * Renvoie l'identifiant de la facture.
   */
  async creerDansTransaction(tx: Prisma.TransactionClient, donnees: SortieACreer, utilisateurId: number) {
    const { centreId, dateEmission } = donnees;
    if (dateEmission > aujourdhui()) throw new BadRequestException("La date de la facture ne peut pas être dans le futur.");

    const centre = await tx.centreSante.findUnique({ where: { id: centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    if (!centre.actif) throw new BadRequestException(`Le centre « ${centre.nom} » est désactivé.`);

    // Un produit une seule fois, quantités > 0
    const demandes = donnees.lignes.filter((l) => l.quantite > 0);
    if (demandes.length === 0) throw new BadRequestException('Ajoutez au moins un produit avec une quantité.');
    const ids = demandes.map((l) => l.medicamentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Un même produit apparaît plusieurs fois : regroupez les quantités.');

    const medicaments = await tx.medicament.findMany({ where: { id: { in: ids } } });
    const lots = await this.lotsDisponibles(tx, ids);

    // Facture MANUELLE : seuil maximum du centre (N x CMM) à ne pas dépasser
    if (donnees.origine === ORIGINE_FACTURE.MANUELLE) {
      const seuils = await this.seuilsCentre(tx, centreId, ids);
      for (const demande of demandes) {
        const seuil = seuils.get(demande.medicamentId);
        if (seuil && demande.quantite > seuil.maxDonnable) {
          const nom = medicaments.find((m) => m.id === demande.medicamentId)?.designation;
          throw new BadRequestException(
            `« ${nom} » : le centre a ${seuil.stockCentre} en stock pour un maximum de ${seuil.n} × CMM (${seuil.cmm}) = ${seuil.stockMax}. ` +
              (seuil.maxDonnable > 0 ? `On peut lui donner au plus ${seuil.maxDonnable}.` : 'On ne peut rien lui donner pour ce produit.'),
          );
        }
      }
    }

    // 1-3. Lignes de facture : lot par lot (péremption la plus proche d'abord), prix figés
    const lignes: { medicamentId: number; lotId: number | null; quantite: number; prixUnitaire: number; prixAchat: number | null; montant: number }[] = [];
    for (const demande of demandes) {
      const med = medicaments.find((m) => m.id === demande.medicamentId);
      if (!med) throw new NotFoundException('Médicament introuvable.');

      const lotsMed = lots.filter((l) => l.medicamentId === med.id);
      const disponible = lotsMed.reduce((t, l) => t + l.quantite, 0);
      if (demande.quantite > disponible) {
        // On précise la quantité périmée, pour ne pas croire à une simple rupture
        const perime = (await this.stockPerime(tx, [med.id])).get(med.id) ?? 0;
        const detailPerime = perime > 0 ? ` — ${perime} en lots PÉRIMÉS (non servables, à sortir du stock)` : '';
        throw new BadRequestException(
          `« ${med.designation} » : ${demande.quantite} demandé(s), stock servable au district : ${disponible}${detailPerime}.`,
        );
      }

      const prixVente = med.consommable ? 0 : await this.prix.prixVenteApplicable(med.id, centreId, dateEmission);
      if (prixVente === null) {
        throw new BadRequestException(`« ${med.designation} » n'a pas de prix de vente à cette date : définissez-le dans Paramétrage > Prix.`);
      }
      const prixAchat = await this.prix.prixAchatApplicable(med.id, dateEmission);

      let reste = demande.quantite;
      for (const lot of lotsMed) {
        if (reste === 0) break;
        const prise = Math.min(reste, lot.quantite);
        lignes.push({
          medicamentId: med.id,
          lotId: lot.lotId,
          quantite: prise,
          prixUnitaire: Number(prixVente),
          prixAchat: prixAchat === null ? null : Number(prixAchat),
          montant: arrondi(prise * Number(prixVente)),
        });
        reste -= prise;
      }
    }

    // Facture
    const montantTotal = arrondi(lignes.reduce((t, l) => t + l.montant, 0));
    const dateEcheance = new Date(dateEmission);
    dateEcheance.setUTCDate(dateEcheance.getUTCDate() + (await this.delaiPaiement(tx)));
    const numero = await prochainNumero(tx, TYPE_COMPTEUR.FACTURE, dateEmission);
    const facture = await tx.facture.create({
      data: {
        numero,
        type: TYPE_FACTURE.SORTIE,
        origine: donnees.origine,
        sortieStock: true,
        centreId,
        rapportId: donnees.rapportId ?? null,
        dateEmission,
        dateEcheance,
        montantTotal,
        // Rien à payer (uniquement des consommables) : facture soldée d'office
        statut: montantTotal > 0 ? SF.EMISE : SF.PAYEE,
        utilisateurId,
        lignes: { create: lignes },
      },
    });

    // 4a. Sortie du stock du DISTRICT, lot par lot
    for (const l of lignes) {
      await this.stock.appliquerMouvement(tx, {
        type: TYPE_MOUVEMENT_DEPOT.SORTIE_LIVRAISON,
        medicamentId: l.medicamentId,
        lotId: l.lotId,
        quantite: l.quantite,
        prixUnitaire: l.prixAchat,
        motif: `Facture ${numero} — ${centre.nom}`,
        pieceRef: numero,
        sourceType: 'FACTURE',
        sourceId: facture.id,
        utilisateurId,
      });
    }

    // 4b. Stock théorique du CENTRE augmenté (une fois par produit)
    for (const d of demandes) {
      await this.mouvementCentre(tx, centreId, d.medicamentId, d.quantite, TYPE_MOUVEMENT_CENTRE.LIVRAISON, `Facture ${numero}`, facture.id, utilisateurId);
    }

    await this.audit.enregistrer(
      { utilisateurId, action: 'CREATION', entite: 'Facture', entiteId: facture.id, apres: { ...facture, lignes } },
      tx,
    );
    return facture.id;
  }

  // ===========================================================================
  // ANNULATION D'UNE FACTURE-SORTIE
  // ===========================================================================

  /**
   * Annule une facture-sortie (motif obligatoire), dans la transaction fournie :
   *   - refusée si des paiements sont imputés ;
   *   - refusée si le rapport centre (nouveau circuit) du MOIS de la facture
   *     est déjà validé (sa colonne « Reçu » ne peut plus changer) ;
   *   - le stock revient au district (mêmes lots, mouvement REGULARISATION)
   *     et le stock théorique du centre diminue.
   * Le statut de la facture est mis à jour par l'appelant (FacturesService).
   */
  async annulerSortie(
    tx: Prisma.TransactionClient,
    facture: { id: number; numero: string; centreId: number; dateEmission: Date; lignes: { medicamentId: number; lotId: number | null; quantite: number; prixAchat: Prisma.Decimal | null }[] },
    motif: string,
    utilisateurId: number,
  ) {
    const annee = facture.dateEmission.getUTCFullYear();
    const mois = facture.dateEmission.getUTCMonth() + 1;
    const rapportValide = await tx.rapportConsommation.findFirst({
      // Seuls les rapports du NOUVEAU circuit utilisent les factures (colonne « Reçu »)
      where: { centreId: facture.centreId, annee, mois, nouveauCircuit: true, statut: { in: [SR.VALIDE, SR.FACTURE] } },
    });
    if (rapportValide) {
      throw new BadRequestException(
        `Le rapport ${rapportValide.numero} du centre pour ce mois est déjà validé : la facture ne peut plus être annulée (corrigez par un ajustement).`,
      );
    }

    // Retour au district, lot par lot
    for (const l of facture.lignes) {
      await this.stock.appliquerMouvement(tx, {
        type: TYPE_MOUVEMENT_DEPOT.REGULARISATION,
        medicamentId: l.medicamentId,
        lotId: l.lotId,
        quantite: l.quantite,
        prixUnitaire: l.prixAchat,
        motif: `Annulation facture ${facture.numero} : ${motif}`,
        pieceRef: facture.numero,
        sourceType: 'FACTURE',
        sourceId: facture.id,
        utilisateurId,
      });
    }

    // Stock théorique du centre diminué (une fois par produit)
    const parMedicament = new Map<number, number>();
    for (const l of facture.lignes) parMedicament.set(l.medicamentId, (parMedicament.get(l.medicamentId) ?? 0) + l.quantite);
    for (const [medicamentId, quantite] of parMedicament) {
      await this.mouvementCentre(tx, facture.centreId, medicamentId, -quantite, TYPE_MOUVEMENT_CENTRE.REGULARISATION, `Annulation facture ${facture.numero}`, facture.id, utilisateurId);
    }
  }

  // ===========================================================================
  // OUTILS
  // ===========================================================================

  /**
   * SEUIL MAXIMUM du centre, par produit : stockMax = N x CMM (CMM du dernier
   * rapport centre VALIDÉ), stock du centre = stock théorique actuel
   * (SDU du dernier rapport + factures reçues depuis), maxDonnable =
   * max(0, N x CMM - stock du centre) arrondi au-dessus (comme la QaC).
   * Pas d'entrée (= pas de limite) si le produit n'est pas dans le dernier
   * rapport, ou s'il a une CMM 0 et un stock 0 (produit nouveau au centre).
   */
  async seuilsCentre(tx: Prisma.TransactionClient, centreId: number, medicamentIds: number[]) {
    const seuils = new Map<number, SeuilCentre>();
    const rapport = await tx.rapportConsommation.findFirst({
      where: { centreId, nouveauCircuit: true, statut: { in: [SR.VALIDE, SR.FACTURE] } },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
      include: { lignes: { where: { medicamentId: { in: medicamentIds } }, select: { medicamentId: true, cmm: true } } },
    });
    if (!rapport) return seuils; // aucun rapport validé : pas de limite

    const p = await tx.parametre.findUnique({ where: { cle: PARAM_RAPPORT.MOIS_STOCK_MAX } });
    const lu = Number((p?.valeur ?? '').replace(',', '.'));
    const n = Number.isFinite(lu) && lu > 0 ? lu : 2;

    const stocks = await tx.stockCentre.findMany({ where: { centreId, medicamentId: { in: medicamentIds } } });
    for (const ligne of rapport.lignes) {
      const cmm = Number(ligne.cmm);
      const stockCentre = stocks.find((s) => s.medicamentId === ligne.medicamentId)?.quantiteTheorique ?? 0;
      if (cmm <= 0 && stockCentre <= 0) continue; // produit nouveau : pas de limite
      const stockMax = Math.ceil(n * cmm);
      seuils.set(ligne.medicamentId, {
        n,
        cmm: arrondi(cmm),
        stockCentre,
        stockMax,
        maxDonnable: Math.max(0, Math.ceil(n * cmm - stockCentre)),
      });
    }
    return seuils;
  }

  /**
   * Lignes de stock du district utilisables : quantité > 0 et lot non périmé
   * (ou sans lot / sans date), péremption la plus proche d'abord, sans lot en dernier.
   */
  private async lotsDisponibles(tx: Prisma.TransactionClient, medicamentIds: number[]) {
    const stocks = await tx.stockDepot.findMany({
      where: {
        medicamentId: { in: medicamentIds },
        quantite: { gt: 0 },
        OR: [{ lotId: null }, { lot: { datePeremption: null } }, { lot: { datePeremption: { gte: aujourdhui() } } }],
      },
      include: { lot: true },
    });
    return stocks
      .map((s) => ({ medicamentId: s.medicamentId, lotId: s.lotId, quantite: s.quantite, peremption: s.lot?.datePeremption?.getTime() ?? Infinity }))
      .sort((a, b) => a.peremption - b.peremption);
  }

  /** Mouvement du stock THÉORIQUE d'un centre (quantité signée). */
  private async mouvementCentre(
    tx: Prisma.TransactionClient,
    centreId: number,
    medicamentId: number,
    quantite: number,
    type: string,
    motif: string,
    factureId: number,
    utilisateurId: number,
  ) {
    const existant = await tx.stockCentre.findUnique({ where: { centreId_medicamentId: { centreId, medicamentId } } });
    const avant = existant?.quantiteTheorique ?? 0;
    await tx.stockCentre.upsert({
      where: { centreId_medicamentId: { centreId, medicamentId } },
      create: { centreId, medicamentId, quantiteTheorique: quantite },
      update: { quantiteTheorique: { increment: quantite } },
    });
    await tx.mouvementStockCentre.create({
      data: { type, centreId, medicamentId, quantite, stockAvant: avant, stockApres: avant + quantite, motif, sourceType: 'FACTURE', sourceId: factureId, utilisateurId },
    });
  }

  private async delaiPaiement(tx: Prisma.TransactionClient) {
    const p = await tx.parametre.findUnique({ where: { cle: 'DELAI_PAIEMENT_JOURS' } });
    const jours = Number(p?.valeur);
    return Number.isFinite(jours) && jours >= 0 ? Math.round(jours) : 30;
  }
}

/** Origines possibles (pour la validation des données reçues). */
export const ORIGINES_FACTURE = Object.values(ORIGINE_FACTURE) as string[];
