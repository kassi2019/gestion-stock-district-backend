/**
 * =============================================================================
 * SERVICE DES ÉTATS ET DU TABLEAU DE BORD (module 09, cahier des charges §3.8)
 * =============================================================================
 * Lecture seule : rassemble les données des autres modules pour les ÉTATS
 * (tableaux filtrables, exportables en PDF / Excel) et le TABLEAU DE BORD.
 *
 *   tableauDeBord  chiffres clés + séries mensuelles + classements
 *   stock          stock du dépôt valorisé (prix d'achat / prix de vente)
 *   receptions     historique des achats reçus (lignes de réceptions validées)
 *   livraisons     historique des livraisons aux centres (lignes validées)
 *   mouvements     mouvements du stock du dépôt
 *   consommations  consommations validées par centre, médicament, période
 *   factures       factures émises ; encaissements ; créances (+ retards)
 *   produits       plus consommés ; ruptures, sous le seuil, péremptions
 *   ecarts         écarts relevés en supervision
 *
 * Filtres communs : du, au (AAAA-MM-JJ), centreId, fournisseurId, medicamentId.
 * Montants : nombres (FCFA). Seuls les documents VALIDÉS sont comptés
 * (brouillons et annulés exclus), sauf mention contraire.
 * =============================================================================
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { STATUT_FACTURE as SF, STATUT_PIECE as SP, STATUT_RAPPORT as SR, STATUT_SUPERVISION as SS } from '../common/constants';
import { aujourdhui, texteVersDate } from '../common/dates';

export interface FiltresEtat {
  du?: string;
  au?: string;
  centreId?: number;
  fournisseurId?: number;
  medicamentId?: number;
}

function arrondi(v: number) {
  return Math.round(v * 100) / 100;
}

/** Filtre de dates Prisma { gte, lte } (au = fin de journée incluse). */
function plage(f: FiltresEtat) {
  if (!f.du && !f.au) return undefined;
  const fin = f.au ? texteVersDate(f.au) : undefined;
  if (fin) fin.setUTCDate(fin.getUTCDate() + 1);
  return { ...(f.du ? { gte: texteVersDate(f.du) } : {}), ...(fin ? { lt: fin } : {}) };
}

/** Période des rapports mensuels (annee*100+mois) correspondant à du / au. */
function plageMois(f: FiltresEtat) {
  const deb = f.du ? Number(f.du.substring(0, 4)) * 100 + Number(f.du.substring(5, 7)) : 0;
  const fin = f.au ? Number(f.au.substring(0, 4)) * 100 + Number(f.au.substring(5, 7)) : 999999;
  return { deb, fin };
}

/** « 2026-11 » */
function cleMois(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MEDICAMENT = { select: { id: true, code: true, designation: true, uniteVente: { select: { libelle: true } }, famille: { select: { libelle: true } } } };

@Injectable()
export class EtatsService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
  ) {}

  // ===========================================================================
  // TABLEAU DE BORD
  // ===========================================================================

  /**
   * Chiffres clés + séries mensuelles sur la période (12 derniers mois par
   * défaut) : consommation validée, facturé, encaissé ; classements.
   */
  async tableauDeBord(f: FiltresEtat) {
    // Période par défaut : les 12 derniers mois (mois en cours compris)
    const jour = aujourdhui();
    const debutDefaut = new Date(Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth() - 11, 1));
    const filtres: FiltresEtat = { ...f, du: f.du || debutDefaut.toISOString().substring(0, 10), au: f.au || jour.toISOString().substring(0, 10) };

    const [etat, alertes, consommations, factures, paiements, livraisons, receptions, creances, ecarts] = await Promise.all([
      this.stockService.etat(),
      this.stockService.resumeAlertes(),
      this.consommations(filtres),
      this.factures(filtres),
      this.encaissements(filtres),
      this.livraisons(filtres),
      this.receptions(filtres),
      this.creances({ centreId: f.centreId }),
      this.ecarts(filtres),
    ]);

    // Mois de la période (axe des graphiques)
    const mois: string[] = [];
    const d = new Date(Date.UTC(Number(filtres.du!.substring(0, 4)), Number(filtres.du!.substring(5, 7)) - 1, 1));
    const finPeriode = texteVersDate(filtres.au!);
    while (d <= finPeriode && mois.length < 36) {
      mois.push(cleMois(d));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    const parMois = <T>(lignes: T[], cle: (l: T) => string, valeur: (l: T) => number) => {
      const m = new Map(mois.map((x) => [x, 0]));
      for (const l of lignes) {
        const k = cle(l);
        if (m.has(k)) m.set(k, arrondi(m.get(k)! + valeur(l)));
      }
      return mois.map((x) => m.get(x)!);
    };

    // Classements
    const topProduits = this.regrouper(consommations, (c) => c.medicament.id, (c) => ({ libelle: c.medicament.designation, quantite: c.quantite, montant: c.montant }))
      .sort((a, b) => b.quantite - a.quantite)
      .slice(0, 10);
    const topCentres = this.regrouper(consommations, (c) => c.centre.id, (c) => ({ libelle: c.centre.nom, quantite: c.quantite, montant: c.montant }))
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 10);

    const facturesValides = factures.filter((x) => x.statut !== SF.ANNULEE);
    return {
      periode: { du: filtres.du, au: filtres.au },
      indicateurs: {
        valeurStockAchat: arrondi(etat.reduce((t, m) => t + (m.valeurAchat ?? 0), 0)),
        valeurStockVente: arrondi(etat.reduce((t, m) => t + (m.valeurVente ?? 0), 0)),
        medicamentsEnStock: etat.filter((m) => m.stock > 0).length,
        ruptures: alertes.ruptures,
        sousSeuil: alertes.sousSeuil,
        lotsPerimes: alertes.lotsPerimes,
        lotsProches: alertes.lotsProches,
        delaiPeremption: alertes.delai,
        achats: arrondi(receptions.reduce((t, r) => t + r.montant, 0)),
        livre: arrondi(livraisons.reduce((t, l) => t + l.montant, 0)),
        consommation: arrondi(consommations.reduce((t, c) => t + c.montant, 0)),
        facture: arrondi(facturesValides.reduce((t, x) => t + x.montantTotal, 0)),
        encaisse: arrondi(paiements.reduce((t, p) => t + p.montant, 0)),
        creances: arrondi(creances.reduce((t, c) => t + c.solde, 0)),
        creancesEnRetard: arrondi(creances.filter((c) => c.joursRetard > 0).reduce((t, c) => t + c.solde, 0)),
        centresEnRetard: new Set(creances.filter((c) => c.joursRetard > 0).map((c) => c.centre.id)).size,
        valeurManquants: arrondi(-ecarts.filter((e) => e.ecart < 0).reduce((t, e) => t + (e.valeurEcart ?? 0), 0)),
      },
      series: {
        mois,
        consommation: parMois(consommations, (c) => c.periode, (c) => c.montant),
        facture: parMois(facturesValides, (x) => cleMois(x.dateEmission), (x) => x.montantTotal),
        encaisse: parMois(paiements, (p) => cleMois(p.datePaiement), (p) => p.montant),
      },
      topProduits,
      topCentres,
    };
  }

  // ===========================================================================
  // STOCK DU DÉPÔT
  // ===========================================================================

  async stock(f: FiltresEtat) {
    const etat = await this.stockService.etat();
    return etat
      .filter((m) => (!f.medicamentId || m.id === f.medicamentId) && (m.actif || m.stock > 0))
      .map((m) => ({
        id: m.id,
        code: m.code,
        designation: m.designation,
        famille: m.famille?.libelle ?? '',
        unite: m.uniteVente?.libelle ?? '',
        stock: m.stock,
        seuilAlerte: m.seuilAlerte,
        prixAchat: m.prixAchat,
        prixVente: m.prixVente,
        valeurAchat: m.valeurAchat,
        valeurVente: m.valeurVente,
        lots: m.lots.length,
        prochainePeremption: m.lots.find((l) => l.datePeremption)?.datePeremption ?? null,
      }));
  }

  // ===========================================================================
  // HISTORIQUES : RÉCEPTIONS, LIVRAISONS, MOUVEMENTS
  // ===========================================================================

  async receptions(f: FiltresEtat) {
    const lignes = await this.prisma.ligneReception.findMany({
      where: {
        ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}),
        reception: { statut: SP.VALIDEE, ...(f.fournisseurId ? { fournisseurId: f.fournisseurId } : {}), ...(plage(f) ? { dateReception: plage(f) } : {}) },
      },
      include: {
        medicament: MEDICAMENT,
        reception: { select: { numero: true, dateReception: true, numBonLivraison: true, fournisseur: { select: { id: true, raisonSociale: true } } } },
      },
      orderBy: [{ reception: { dateReception: 'desc' } }, { id: 'asc' }],
    });
    return lignes.map((l) => ({
      date: l.reception.dateReception,
      numero: l.reception.numero,
      bonLivraison: l.reception.numBonLivraison ?? '',
      fournisseur: l.reception.fournisseur,
      medicament: l.medicament,
      lot: l.numeroLot ?? '',
      datePeremption: l.datePeremption,
      quantite: l.quantite,
      prixUnitaire: Number(l.prixUnitaire),
      montant: Number(l.montant),
    }));
  }

  /**
   * LIVRAISONS AUX CENTRES : anciens bons de livraison validés (BL-...) +
   * factures-sorties non annulées (FAC-..., spec nov. 2026), ligne par lot.
   */
  async livraisons(f: FiltresEtat) {
    const [anciens, factures] = await Promise.all([
      this.prisma.ligneLivraison.findMany({
        where: {
          quantiteLivree: { gt: 0 },
          ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}),
          livraison: { statut: SP.VALIDEE, ...(f.centreId ? { centreId: f.centreId } : {}), ...(plage(f) ? { dateLivraison: plage(f) } : {}) },
        },
        include: {
          medicament: MEDICAMENT,
          lot: { select: { numeroLot: true } },
          livraison: { select: { numero: true, dateLivraison: true, centre: { select: { id: true, nom: true } } } },
        },
      }),
      this.prisma.ligneFacture.findMany({
        where: {
          ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}),
          facture: { sortieStock: true, statut: { not: SF.ANNULEE }, ...(f.centreId ? { centreId: f.centreId } : {}), ...(plage(f) ? { dateEmission: plage(f) } : {}) },
        },
        include: {
          medicament: MEDICAMENT,
          lot: { select: { numeroLot: true } },
          facture: { select: { numero: true, dateEmission: true, centre: { select: { id: true, nom: true } } } },
        },
      }),
    ]);
    return [
      ...anciens.map((l) => ({
        date: l.livraison.dateLivraison,
        numero: l.livraison.numero,
        centre: l.livraison.centre,
        medicament: l.medicament,
        lot: l.lot?.numeroLot ?? '',
        quantite: l.quantiteLivree,
        prixUnitaire: Number(l.prixUnitaire),
        montant: Number(l.montant),
      })),
      ...factures.map((l) => ({
        date: l.facture.dateEmission,
        numero: l.facture.numero,
        centre: l.facture.centre,
        medicament: l.medicament,
        lot: l.lot?.numeroLot ?? '',
        quantite: l.quantite,
        prixUnitaire: Number(l.prixUnitaire),
        montant: Number(l.montant),
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async mouvements(f: FiltresEtat) {
    const lignes = await this.prisma.mouvementStock.findMany({
      where: { ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}), ...(plage(f) ? { dateMouvement: plage(f) } : {}) },
      include: { medicament: MEDICAMENT, lot: { select: { numeroLot: true } }, utilisateur: { select: { nom: true, prenoms: true } } },
      orderBy: [{ dateMouvement: 'desc' }, { id: 'desc' }],
      take: 5000,
    });
    return lignes.map((m) => ({
      date: m.dateMouvement,
      type: m.type,
      pieceRef: m.pieceRef ?? '',
      medicament: m.medicament,
      lot: m.lot?.numeroLot ?? '',
      quantite: m.quantite,
      stockAvant: m.stockAvant,
      stockApres: m.stockApres,
      motif: m.motif ?? '',
      utilisateur: `${m.utilisateur.prenoms ?? ''} ${m.utilisateur.nom}`.trim(),
    }));
  }

  // ===========================================================================
  // CONSOMMATIONS (rapports validés ou facturés)
  // ===========================================================================

  async consommations(f: FiltresEtat) {
    const { deb, fin } = plageMois(f);
    const lignes = await this.prisma.ligneConsommation.findMany({
      where: {
        ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}),
        rapport: { statut: { in: [SR.VALIDE, SR.FACTURE] }, ...(f.centreId ? { centreId: f.centreId } : {}) },
      },
      include: {
        medicament: MEDICAMENT,
        rapport: { select: { numero: true, annee: true, mois: true, statut: true, centre: { select: { id: true, nom: true } } } },
      },
    });
    return lignes
      .filter((l) => {
        const p = l.rapport.annee * 100 + l.rapport.mois;
        return p >= deb && p <= fin;
      })
      .map((l) => {
        const quantite = l.quantiteVerifiee ?? l.quantite;
        return {
          periode: `${l.rapport.annee}-${String(l.rapport.mois).padStart(2, '0')}`,
          rapport: l.rapport.numero,
          statut: l.rapport.statut,
          centre: l.rapport.centre,
          medicament: l.medicament,
          quantiteDeclaree: l.quantite,
          quantite,
          prixUnitaire: Number(l.prixUnitaire),
          montant: arrondi(quantite * Number(l.prixUnitaire)),
        };
      })
      .sort((a, b) => b.periode.localeCompare(a.periode) || a.centre.nom.localeCompare(b.centre.nom));
  }

  // ===========================================================================
  // FINANCES : FACTURES, ENCAISSEMENTS, CRÉANCES
  // ===========================================================================

  async factures(f: FiltresEtat) {
    const factures = await this.prisma.facture.findMany({
      where: { ...(f.centreId ? { centreId: f.centreId } : {}), ...(plage(f) ? { dateEmission: plage(f) } : {}) },
      include: {
        centre: { select: { id: true, nom: true } },
        rapport: { select: { annee: true, mois: true } },
        supervision: { select: { numero: true } },
      },
      orderBy: [{ dateEmission: 'desc' }, { id: 'desc' }],
    });
    return factures.map((x) => ({
      id: x.id,
      numero: x.numero,
      type: x.type,
      objet: x.rapport ? `Consommation ${String(x.rapport.mois).padStart(2, '0')}/${x.rapport.annee}` : x.supervision ? `Écart supervision ${x.supervision.numero}` : x.type,
      dateEmission: x.dateEmission,
      dateEcheance: x.dateEcheance,
      centre: x.centre,
      montantTotal: Number(x.montantTotal),
      montantPaye: Number(x.montantPaye),
      solde: x.statut === SF.ANNULEE ? 0 : arrondi(Number(x.montantTotal) - Number(x.montantPaye)),
      statut: x.statut,
    }));
  }

  async encaissements(f: FiltresEtat) {
    const paiements = await this.prisma.paiement.findMany({
      where: { annule: false, ...(f.centreId ? { centreId: f.centreId } : {}), ...(plage(f) ? { datePaiement: plage(f) } : {}) },
      include: { centre: { select: { id: true, nom: true } }, imputations: { select: { facture: { select: { numero: true } } } } },
      orderBy: [{ datePaiement: 'desc' }, { id: 'desc' }],
    });
    return paiements.map((p) => ({
      numero: p.numero,
      datePaiement: p.datePaiement,
      centre: p.centre,
      type: p.type,
      mode: p.mode,
      reference: p.reference ?? '',
      factures: p.imputations.map((i) => i.facture.numero).join(', '),
      montant: Number(p.montant),
      avance: Number(p.montantNonImpute),
    }));
  }

  /** Factures non soldées (créances), avec le nombre de jours de retard. */
  async creances(f: FiltresEtat) {
    const jour = aujourdhui();
    const factures = await this.prisma.facture.findMany({
      where: { statut: { in: [SF.EMISE, SF.PARTIELLEMENT_PAYEE] }, ...(f.centreId ? { centreId: f.centreId } : {}) },
      include: { centre: { select: { id: true, nom: true, responsable: true, telephone: true } } },
      orderBy: [{ dateEcheance: 'asc' }, { id: 'asc' }],
    });
    return factures.map((x) => ({
      numero: x.numero,
      dateEmission: x.dateEmission,
      dateEcheance: x.dateEcheance,
      centre: x.centre,
      montantTotal: Number(x.montantTotal),
      montantPaye: Number(x.montantPaye),
      solde: arrondi(Number(x.montantTotal) - Number(x.montantPaye)),
      joursRetard: x.dateEcheance && x.dateEcheance < jour ? Math.round((jour.getTime() - x.dateEcheance.getTime()) / 86400000) : 0,
    }));
  }

  // ===========================================================================
  // PRODUITS : PLUS CONSOMMÉS, RUPTURES, PÉREMPTIONS
  // ===========================================================================

  async produits(f: FiltresEtat) {
    const [consommations, etat, parametre] = await Promise.all([
      this.consommations(f),
      this.stockService.etat(),
      this.prisma.parametre.findUnique({ where: { cle: 'ALERTE_PEREMPTION_JOURS' } }),
    ]);
    const delai = Number(parametre?.valeur) > 0 ? Number(parametre!.valeur) : 90;
    const jour = aujourdhui().getTime();
    const limite = jour + delai * 86400000;

    const plusConsommes = this.regrouper(consommations, (c) => c.medicament.id, (c) => ({
      code: c.medicament.code,
      libelle: c.medicament.designation,
      unite: c.medicament.uniteVente?.libelle ?? '',
      quantite: c.quantite,
      montant: c.montant,
      centres: 0,
    })).sort((a, b) => b.quantite - a.quantite);
    // Nombre de centres consommateurs par médicament
    for (const p of plusConsommes) {
      p.centres = new Set(consommations.filter((c) => c.medicament.designation === p.libelle).map((c) => c.centre.id)).size;
    }

    const actifs = etat.filter((m) => m.actif);
    const alertesStock = actifs
      .filter((m) => m.stock <= 0 || (m.seuilAlerte > 0 && m.stock <= m.seuilAlerte))
      .map((m) => ({ code: m.code, libelle: m.designation, stock: m.stock, seuilAlerte: m.seuilAlerte, etat: m.stock <= 0 ? 'RUPTURE' : 'SOUS_SEUIL' }))
      .sort((a, b) => a.stock - b.stock);
    const peremptions = etat
      .flatMap((m) => m.lots.filter((l) => l.datePeremption && l.datePeremption.getTime() <= limite).map((l) => ({ code: m.code, libelle: m.designation, ...l })))
      .map((l) => ({
        code: l.code,
        libelle: l.libelle,
        numeroLot: l.numeroLot,
        datePeremption: l.datePeremption,
        quantite: l.quantite,
        jours: Math.round((l.datePeremption!.getTime() - jour) / 86400000),
        etat: l.datePeremption!.getTime() < jour ? 'PERIME' : 'PROCHE',
      }))
      .sort((a, b) => a.jours - b.jours);
    return { delai, plusConsommes, alertesStock, peremptions };
  }

  // ===========================================================================
  // ÉCARTS DE SUPERVISION
  // ===========================================================================

  async ecarts(f: FiltresEtat) {
    const lignes = await this.prisma.ligneSupervision.findMany({
      where: {
        ecart: { not: 0 },
        ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}),
        supervision: {
          statut: { in: [SS.VALIDEE, SS.CLOTUREE] },
          ...(f.centreId ? { centreId: f.centreId } : {}),
          ...(plage(f) ? { dateSupervision: plage(f) } : {}),
        },
      },
      include: {
        medicament: MEDICAMENT,
        supervision: { select: { numero: true, dateSupervision: true, decision: true, centre: { select: { id: true, nom: true } } } },
      },
      orderBy: [{ supervision: { dateSupervision: 'desc' } }, { id: 'asc' }],
    });
    return lignes.map((l) => ({
      date: l.supervision.dateSupervision,
      numero: l.supervision.numero,
      centre: l.supervision.centre,
      medicament: l.medicament,
      stockTheorique: l.stockTheorique,
      stockPhysique: l.stockPhysique,
      ecart: l.ecart,
      valeurEcart: l.valeurEcart === null ? null : Number(l.valeurEcart),
      decision: l.supervision.decision ?? '',
    }));
  }

  // ===========================================================================
  // OUTILS
  // ===========================================================================

  /** Regroupe des lignes par clé en additionnant quantite et montant. */
  private regrouper<T, R extends { quantite: number; montant: number }>(lignes: T[], cle: (l: T) => number | string, init: (l: T) => R) {
    const m = new Map<number | string, R>();
    for (const l of lignes) {
      const k = cle(l);
      const base = init(l);
      const existant = m.get(k);
      if (existant) {
        existant.quantite += base.quantite;
        existant.montant = arrondi(existant.montant + base.montant);
      } else m.set(k, { ...base });
    }
    return [...m.values()];
  }
}
