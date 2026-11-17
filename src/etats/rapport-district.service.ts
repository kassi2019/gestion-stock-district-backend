/**
 * =============================================================================
 * SERVICE DU RAPPORT DISTRICT (spec nov. 2026, §6)
 * =============================================================================
 * Regroupe les rapports centre VALIDÉS et le stock du district sur une période,
 * puis valorise la consommation (marge du district, dette fournisseurs).
 * Il remplace la commande du district : la vue « quantités » est à reporter
 * dans l'application nationale. Lecture seule.
 *
 * Filtres : période (du / au -> mois des rapports), centre, produit.
 *
 * VUE QUANTITÉS (par produit) :
 *   consommeCentres  somme des C des rapports validés de la période
 *   restantCentres   somme des SDU au dernier rapport validé de chaque centre
 *                    (jusqu'à la fin de la période)
 *   restantDistrict  stock du district en fin de période (dernier mouvement)
 *   stockGlobal      restant centres + restant district
 *   recuFournisseurs somme des réceptions validées de la période
 *   cmmDistrict      consommation des centres sur les 3 derniers mois de la
 *                    période, divisée par le nombre de mois ayant des rapports (max 3)
 *
 * VUE VALORISATION (par produit, prix FIGÉS sur les lignes de rapport) :
 *   valeurAchat = C x prix d'achat ; valeurVente = C x prix de vente ;
 *   marge = vente - achat ; pertes (P) valorisées au prix d'achat, À PART,
 *   car elles réduisent la marge : margeNette = marge - valeur des pertes.
 *
 * DÛ AUX FOURNISSEURS (« premier entré, premier sorti ») :
 *   pour chaque produit, les quantités consommées sont imputées aux entrées
 *   dans l'ordre : d'abord le stock initial (inventaire, sans fournisseur),
 *   puis les réceptions par date. La consommation AVANT la période « use »
 *   les premières entrées ; celle de la période est imputée aux suivantes,
 *   au prix d'achat de chaque réception.
 *   Avec un filtre centre : la répartition est calculée sur tous les centres,
 *   puis ramenée à la part du centre choisi.
 * =============================================================================
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STATUT_PIECE as SP, STATUT_RAPPORT as SR } from '../common/constants';
import { aujourdhui, texteVersDate } from '../common/dates';
import { FiltresEtat } from './etats.service';

function arrondi(v: number) {
  return Math.round(v * 100) / 100;
}
const rang = (annee: number, mois: number) => annee * 12 + (mois - 1);

const MEDICAMENT = { select: { id: true, code: true, designation: true, uniteVente: { select: { libelle: true } }, famille: { select: { libelle: true } } } };

/** Ligne par produit du rapport district. */
interface LigneProduit {
  medicamentId: number;
  consommeCentres: number;
  pertes: number;
  restantCentres: number;
  restantDistrict: number;
  stockGlobal: number;
  recuFournisseurs: number;
  cmmDistrict: number;
  valeurAchat: number;
  valeurVente: number;
  marge: number;
  valeurPertes: number;
  margeNette: number;
}

@Injectable()
export class RapportDistrictService {
  constructor(private prisma: PrismaService) {}

  async rapport(f: FiltresEtat) {
    // ---- Période en mois (rapports) et en dates (réceptions, stock) ----
    const jour = aujourdhui();
    const du = f.du ? texteVersDate(f.du) : null;
    const au = f.au ? texteVersDate(f.au) : jour;
    const rangDebut = du ? rang(du.getUTCFullYear(), du.getUTCMonth() + 1) : 0;
    const rangFin = rang(au.getUTCFullYear(), au.getUTCMonth() + 1);
    const finJournee = new Date(au);
    finJournee.setUTCDate(finJournee.getUTCDate() + 1); // « au » inclus

    // ---- Lignes des rapports centre validés (toutes périodes : utiles pour le FIFO) ----
    const lignesRapports = await this.prisma.ligneConsommation.findMany({
      where: {
        ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}),
        rapport: { nouveauCircuit: true, statut: SR.VALIDE },
      },
      select: {
        medicamentId: true,
        quantite: true,
        pertes: true,
        stockDisponible: true,
        prixUnitaire: true,
        prixAchat: true,
        rapport: { select: { centreId: true, annee: true, mois: true } },
      },
    });
    const rangDe = (l: (typeof lignesRapports)[number]) => rang(l.rapport.annee, l.rapport.mois);
    const duCentre = (l: (typeof lignesRapports)[number]) => !f.centreId || l.rapport.centreId === f.centreId;
    const dansPeriode = lignesRapports.filter((l) => rangDe(l) >= rangDebut && rangDe(l) <= rangFin);

    const produits = new Map<number, LigneProduit>();
    const ligne = (medicamentId: number) => {
      if (!produits.has(medicamentId)) {
        produits.set(medicamentId, {
          medicamentId, consommeCentres: 0, pertes: 0, restantCentres: 0, restantDistrict: 0, stockGlobal: 0,
          recuFournisseurs: 0, cmmDistrict: 0, valeurAchat: 0, valeurVente: 0, marge: 0, valeurPertes: 0, margeNette: 0,
        });
      }
      return produits.get(medicamentId)!;
    };

    // ---- Consommation, pertes et valorisation de la période ----
    for (const l of dansPeriode.filter(duCentre)) {
      const p = ligne(l.medicamentId);
      const prixAchat = Number(l.prixAchat ?? 0);
      p.consommeCentres += l.quantite;
      p.pertes += l.pertes;
      p.valeurAchat += l.quantite * prixAchat;
      p.valeurVente += l.quantite * Number(l.prixUnitaire);
      p.valeurPertes += l.pertes * prixAchat;
    }

    // ---- Restant dans les centres : SDU du DERNIER rapport validé de chaque centre ----
    // (jusqu'à la fin de la période ; un produit absent de ce rapport compte pour 0)
    const dernierRangCentre = new Map<number, number>();
    for (const l of lignesRapports.filter(duCentre)) {
      if (rangDe(l) <= rangFin) dernierRangCentre.set(l.rapport.centreId, Math.max(dernierRangCentre.get(l.rapport.centreId) ?? 0, rangDe(l)));
    }
    for (const l of lignesRapports.filter(duCentre)) {
      if (rangDe(l) === dernierRangCentre.get(l.rapport.centreId)) ligne(l.medicamentId).restantCentres += l.stockDisponible;
    }

    // ---- CMM district : 3 derniers mois de la période ----
    const lignesCmm = lignesRapports.filter((l) => duCentre(l) && rangDe(l) <= rangFin && rangDe(l) > rangFin - 3);
    const moisCmm = new Set(lignesCmm.map(rangDe)).size || 1;
    for (const l of lignesCmm) ligne(l.medicamentId).cmmDistrict += l.quantite / moisCmm;

    // ---- Reçu des fournisseurs (réceptions validées de la période) ----
    const recus = await this.prisma.ligneReception.groupBy({
      by: ['medicamentId'],
      where: {
        ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}),
        reception: { statut: SP.VALIDEE, dateReception: { ...(du ? { gte: du } : {}), lt: finJournee } },
      },
      _sum: { quantite: true },
    });
    for (const r of recus) ligne(r.medicamentId).recuFournisseurs += r._sum.quantite ?? 0;

    // ---- Restant au district en fin de période : stock après le dernier mouvement ----
    // (sans filtre centre : le stock du district ne dépend pas d'un centre)
    const idsAvecStock = await this.prisma.mouvementStock.findMany({
      where: { dateMouvement: { lt: finJournee }, ...(f.medicamentId ? { medicamentId: f.medicamentId } : {}) },
      distinct: ['medicamentId'],
      select: { medicamentId: true },
    });
    for (const { medicamentId } of idsAvecStock) {
      const m = await this.prisma.mouvementStock.findFirst({
        where: { medicamentId, dateMouvement: { lt: finJournee } },
        orderBy: [{ dateMouvement: 'desc' }, { id: 'desc' }],
        select: { stockApres: true },
      });
      if (m && m.stockApres !== 0) ligne(medicamentId).restantDistrict = m.stockApres;
    }

    // ---- Totaux par produit ----
    for (const p of produits.values()) {
      p.stockGlobal = p.restantCentres + p.restantDistrict;
      p.cmmDistrict = arrondi(p.cmmDistrict);
      p.valeurAchat = arrondi(p.valeurAchat);
      p.valeurVente = arrondi(p.valeurVente);
      p.valeurPertes = arrondi(p.valeurPertes);
      p.marge = arrondi(p.valeurVente - p.valeurAchat);
      p.margeNette = arrondi(p.marge - p.valeurPertes);
    }

    // ---- Dû aux fournisseurs (FIFO) ----
    const fournisseurs = await this.duAuxFournisseurs(lignesRapports, rangDebut, rangFin, f);

    // ---- Libellés des produits ----
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: [...produits.keys()] } }, ...MEDICAMENT });
    const lignesProduits = [...produits.values()]
      .filter((p) => Object.entries(p).some(([k, v]) => k !== 'medicamentId' && v !== 0))
      .map((p) => ({ ...p, medicament: medicaments.find((m) => m.id === p.medicamentId)! }))
      .sort((a, b) => a.medicament.designation.localeCompare(b.medicament.designation));

    return { produits: lignesProduits, fournisseurs };
  }

  /**
   * Montant dû aux fournisseurs pour la consommation de la période, réparti
   * en « premier entré, premier sorti » (voir l'en-tête).
   * Renvoie une ligne par fournisseur ET par produit.
   */
  private async duAuxFournisseurs(
    lignesRapports: { medicamentId: number; quantite: number; rapport: { centreId: number; annee: number; mois: number } }[],
    rangDebut: number,
    rangFin: number,
    f: FiltresEtat,
  ) {
    const rangDe = (l: { rapport: { annee: number; mois: number } }) => rang(l.rapport.annee, l.rapport.mois);
    const ids = [...new Set(lignesRapports.map((l) => l.medicamentId))];
    if (ids.length === 0) return [];

    const [inventaires, receptions, fournisseursListe, medicaments] = await Promise.all([
      this.prisma.inventaireInitial.groupBy({ by: ['medicamentId'], where: { medicamentId: { in: ids } }, _sum: { quantite: true } }),
      this.prisma.ligneReception.findMany({
        where: { medicamentId: { in: ids }, reception: { statut: SP.VALIDEE } },
        select: { medicamentId: true, quantite: true, prixUnitaire: true, reception: { select: { fournisseurId: true, dateReception: true, id: true } } },
        orderBy: [{ reception: { dateReception: 'asc' } }, { id: 'asc' }],
      }),
      this.prisma.fournisseur.findMany({ select: { id: true, raisonSociale: true } }),
      this.prisma.medicament.findMany({ where: { id: { in: ids } }, ...MEDICAMENT }),
    ]);

    const resultat = new Map<string, { fournisseur: string; medicament: (typeof medicaments)[number]; quantite: number; montant: number }>();
    const ajouter = (fournisseur: string, medicamentId: number, quantite: number, prix: number) => {
      if (quantite <= 0) return;
      const cle = `${fournisseur}|${medicamentId}`;
      if (!resultat.has(cle)) resultat.set(cle, { fournisseur, medicament: medicaments.find((m) => m.id === medicamentId)!, quantite: 0, montant: 0 });
      const r = resultat.get(cle)!;
      r.quantite += quantite;
      r.montant += quantite * prix;
    };

    for (const medicamentId of ids) {
      const lignesMed = lignesRapports.filter((l) => l.medicamentId === medicamentId);
      const avant = lignesMed.filter((l) => rangDe(l) < rangDebut).reduce((t, l) => t + l.quantite, 0);
      const periode = lignesMed.filter((l) => rangDe(l) >= rangDebut && rangDe(l) <= rangFin);
      const totalPeriode = periode.reduce((t, l) => t + l.quantite, 0);
      if (totalPeriode === 0) continue;
      // Part du centre filtré (1 sans filtre)
      const part = f.centreId ? periode.filter((l) => l.rapport.centreId === f.centreId).reduce((t, l) => t + l.quantite, 0) / totalPeriode : 1;
      if (part === 0) continue;

      // File des entrées : stock initial, puis réceptions par date
      const file: { fournisseur: string; quantite: number; prix: number }[] = [];
      const initial = inventaires.find((i) => i.medicamentId === medicamentId)?._sum.quantite ?? 0;
      if (initial > 0) file.push({ fournisseur: 'Stock initial (sans fournisseur)', quantite: initial, prix: 0 });
      for (const r of receptions.filter((x) => x.medicamentId === medicamentId)) {
        const nom = fournisseursListe.find((x) => x.id === r.reception.fournisseurId)?.raisonSociale ?? 'Fournisseur';
        file.push({ fournisseur: nom, quantite: r.quantite, prix: Number(r.prixUnitaire) });
      }

      // On « use » d'abord la consommation d'avant la période, puis on impute celle de la période
      let aSauter = avant;
      let aImputer = totalPeriode;
      for (const entree of file) {
        if (aImputer === 0) break;
        let dispo = entree.quantite;
        const saute = Math.min(aSauter, dispo);
        aSauter -= saute;
        dispo -= saute;
        const prise = Math.min(aImputer, dispo);
        ajouter(entree.fournisseur, medicamentId, prise * part, entree.prix);
        aImputer -= prise;
      }
      if (aImputer > 0) ajouter('Non attribué (entrée non enregistrée)', medicamentId, aImputer * part, 0);
    }

    return [...resultat.values()]
      .map((r) => ({ ...r, quantite: arrondi(r.quantite), montant: arrondi(r.montant) }))
      .sort((a, b) => a.fournisseur.localeCompare(b.fournisseur) || a.medicament.designation.localeCompare(b.medicament.designation));
  }
}
