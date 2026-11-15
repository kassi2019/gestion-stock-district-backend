/**
 * =============================================================================
 * SERVICE DE LA PAGE D'ACCUEIL (chiffres clés et badges des tuiles)
 * =============================================================================
 * Tout est calculé à partir de la base, au moment de l'affichage.
 * Seuls les modules que l'utilisateur a le droit de VOIR sont calculés.
 *
 *   indicateurs (pastilles du bandeau) :
 *     - stock      : valeur du stock du dépôt au prix d'achat (+ au prix de vente)
 *     - alertes    : ruptures, sous le seuil, lots périmés, péremption proche
 *     - creances   : factures non soldées (montant restant dû)
 *     - rapports   : rapports de consommation soumis, à valider
 *
 *   enAttente (badge de chaque tuile) : { module: { nombre, niveau, libelle, alertes } }
 *     gravité : URGENT (rouge) · ATTENTION (orange) · INFO (bleu)
 *     parametrage   médicaments actifs sans prix de vente (ATTENTION)
 *     stock         lots périmés, ruptures (URGENT) ; sous le seuil, péremption proche (ATTENTION)
 *     achats        réceptions à valider (ATTENTION) ; à réceptionner, brouillons (INFO)
 *     livraisons    commandes à valider / à livrer (ATTENTION) ; en préparation (INFO)
 *     consommations rapports du mois précédent MANQUANTS, rapports à valider (ATTENTION) ; brouillons (INFO)
 *     facturation   rapports validés à facturer (ATTENTION)
 *     paiements     factures EN RETARD (URGENT) ; autres factures non soldées (INFO)
 *     supervisions  à valider, décisions à prendre (ATTENTION) ; en cours (INFO)
 *
 *   urgences : toutes les alertes URGENT (bandeau rouge de l'accueil)
 * =============================================================================
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { aLeDroit, Permissions } from '../auth/droits';
import {
  STATUT_COMMANDE_CENTRE as SCC,
  STATUT_COMMANDE_FOURNISSEUR as SCF,
  STATUT_FACTURE as SF,
  STATUT_PIECE as SP,
  STATUT_RAPPORT as SR,
  STATUT_SUPERVISION as SS,
} from '../common/constants';

/** Gravité d'une alerte : URGENT (rouge), ATTENTION (orange), INFO (bleu). */
export type Niveau = 'URGENT' | 'ATTENTION' | 'INFO';
const ORDRE: Niveau[] = ['URGENT', 'ATTENTION', 'INFO'];

/** Une alerte d'une tuile : « 42 rupture(s) ». */
export interface Alerte {
  nombre: number;
  texte: string;
  niveau: Niveau;
}

/**
 * Badge d'une tuile : nombre total, gravité la plus forte, et la liste des
 * alertes (les plus graves d'abord). « libelle » : résumé sur une ligne.
 */
export interface Badge {
  nombre: number;
  niveau: Niveau;
  libelle: string;
  alertes: Alerte[];
}

/** Assemble un badge à partir de plusieurs compteurs (ceux à 0 sont ignorés). */
function badge(parts: [number, string, Niveau][]): Badge | null {
  const alertes = parts
    .filter(([n]) => n > 0)
    .map(([nombre, texte, niveau]) => ({ nombre, texte, niveau }))
    .sort((a, b) => ORDRE.indexOf(a.niveau) - ORDRE.indexOf(b.niveau));
  if (alertes.length === 0) return null;
  return {
    nombre: alertes.reduce((t, a) => t + a.nombre, 0),
    niveau: alertes[0].niveau,
    libelle: alertes.map((a) => `${a.nombre} ${a.texte}`).join(' · '),
    alertes,
  };
}

@Injectable()
export class AccueilService {
  constructor(
    private prisma: PrismaService,
    private stock: StockService,
  ) {}

  async resume(permissions: Permissions) {
    const voit = (module: string) => aLeDroit(permissions, module, 'LECTURE');
    const indicateurs: Record<string, unknown> = {};
    const enAttente: Record<string, Badge | null> = {};

    // ----- STOCK DU DÉPÔT : valeur + alertes -----
    if (voit('stock')) {
      const [etat, alertes] = await Promise.all([this.stock.etat(), this.stock.resumeAlertes()]);
      indicateurs.stock = {
        valeurAchat: etat.reduce((t, m) => t + (m.valeurAchat ?? 0), 0),
        valeurVente: etat.reduce((t, m) => t + (m.valeurVente ?? 0), 0),
        medicamentsEnStock: etat.filter((m) => m.stock > 0).length,
      };
      indicateurs.alertes = {
        total: alertes.ruptures + alertes.sousSeuil + alertes.lotsPerimes + alertes.lotsProches,
        ruptures: alertes.ruptures,
        sousSeuil: alertes.sousSeuil,
        lotsPerimes: alertes.lotsPerimes,
        lotsProches: alertes.lotsProches,
        delai: alertes.delai,
      };
      enAttente.stock = badge([
        [alertes.lotsPerimes, 'lot(s) périmé(s) à retirer', 'URGENT'],
        [alertes.ruptures, 'rupture(s) de stock', 'URGENT'],
        [alertes.sousSeuil, 'sous le seuil', 'ATTENTION'],
        [alertes.lotsProches, `lot(s) périmant sous ${alertes.delai} j`, 'ATTENTION'],
      ]);
    }

    // ----- ACHATS -----
    if (voit('achats')) {
      const [brouillons, aReceptionner, receptions] = await Promise.all([
        this.prisma.commandeFournisseur.count({ where: { statut: SCF.BROUILLON } }),
        this.prisma.commandeFournisseur.count({ where: { statut: { in: [SCF.VALIDEE, SCF.PARTIELLEMENT_RECUE] } } }),
        this.prisma.reception.count({ where: { statut: SP.BROUILLON } }),
      ]);
      enAttente.achats = badge([
        [receptions, 'réception(s) à valider', 'ATTENTION'],
        [aReceptionner, 'commande(s) à réceptionner', 'INFO'],
        [brouillons, 'commande(s) en brouillon', 'INFO'],
      ]);
    }

    // ----- COMMANDES ET LIVRAISONS AUX CENTRES -----
    if (voit('livraisons')) {
      const [aValider, aLivrer, enPreparation] = await Promise.all([
        this.prisma.commandeCentre.count({ where: { statut: { in: [SCC.BROUILLON, SCC.SOUMISE] } } }),
        this.prisma.commandeCentre.count({ where: { statut: { in: [SCC.VALIDEE, SCC.PARTIELLEMENT_LIVREE] } } }),
        this.prisma.livraison.count({ where: { statut: SP.BROUILLON } }),
      ]);
      enAttente.livraisons = badge([
        [aValider, 'commande(s) à valider', 'ATTENTION'],
        [aLivrer, 'commande(s) à livrer', 'ATTENTION'],
        [enPreparation, 'livraison(s) en préparation', 'INFO'],
      ]);
    }

    // ----- RAPPORTS DE CONSOMMATION -----
    if (voit('consommations')) {
      // Mois précédent : chaque centre actif DÉJÀ LIVRÉ avant la fin de ce mois
      // doit avoir transmis son rapport (un centre jamais livré n'a rien à déclarer)
      const maintenant = new Date();
      const precedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
      const debutMoisCourant = new Date(Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), 1));
      const [soumis, brouillons, centresLivres, recus] = await Promise.all([
        this.prisma.rapportConsommation.findMany({ where: { statut: SR.SOUMIS }, select: { montantTotal: true } }),
        this.prisma.rapportConsommation.count({ where: { statut: SR.BROUILLON } }),
        this.prisma.livraison.findMany({
          where: { statut: SP.VALIDEE, dateLivraison: { lt: debutMoisCourant }, centre: { actif: true } },
          select: { centreId: true },
          distinct: ['centreId'],
        }),
        this.prisma.rapportConsommation.findMany({
          where: { annee: precedent.getFullYear(), mois: precedent.getMonth() + 1 },
          select: { centreId: true },
        }),
      ]);
      const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      const nomMois = MOIS[precedent.getMonth()];
      const deMois = /^[aeiouyéèh]/i.test(nomMois) ? `d'${nomMois}` : `de ${nomMois}`;
      const ontDeclare = new Set(recus.map((r) => r.centreId));
      const manquants = centresLivres.filter((c) => !ontDeclare.has(c.centreId)).length;
      indicateurs.rapports = {
        aValider: soumis.length,
        montant: soumis.reduce((t, r) => t + Number(r.montantTotal), 0),
        brouillons,
      };
      enAttente.consommations = badge([
        [manquants, `rapport(s) ${deMois} manquant(s)`, 'ATTENTION'],
        [soumis.length, 'rapport(s) à valider', 'ATTENTION'],
        [brouillons, 'brouillon(s)', 'INFO'],
      ]);
    }

    // ----- FACTURATION ET PAIEMENTS -----
    const voitFinances = voit('facturation') || voit('paiements');
    if (voitFinances) {
      const nonSoldees = await this.prisma.facture.findMany({
        where: { statut: { in: [SF.EMISE, SF.PARTIELLEMENT_PAYEE] } },
        select: { centreId: true, montantTotal: true, montantPaye: true, dateEcheance: true },
      });
      const jour = new Date(new Date().toISOString().substring(0, 10) + 'T00:00:00Z');
      const enRetard = nonSoldees.filter((f) => f.dateEcheance && f.dateEcheance < jour);
      indicateurs.creances = {
        montant: nonSoldees.reduce((t, f) => t + Number(f.montantTotal) - Number(f.montantPaye), 0),
        factures: nonSoldees.length,
        centres: new Set(nonSoldees.map((f) => f.centreId)).size,
      };
      if (voit('paiements')) {
        enAttente.paiements = badge([
          [enRetard.length, `facture(s) en retard (${new Set(enRetard.map((f) => f.centreId)).size} centre(s))`, 'URGENT'],
          [nonSoldees.length - enRetard.length, 'facture(s) non soldée(s)', 'INFO'],
        ]);
      }
    }
    if (voit('facturation')) {
      const aFacturer = await this.prisma.rapportConsommation.count({ where: { statut: SR.VALIDE } });
      enAttente.facturation = badge([[aFacturer, 'rapport(s) validé(s) à facturer', 'ATTENTION']]);
    }

    // ----- SUPERVISIONS -----
    if (voit('supervisions')) {
      const [brouillons, soumises, aDecider] = await Promise.all([
        this.prisma.supervision.count({ where: { statut: SS.BROUILLON } }),
        this.prisma.supervision.count({ where: { statut: SS.SOUMISE } }),
        this.prisma.supervision.count({ where: { statut: SS.VALIDEE } }),
      ]);
      enAttente.supervisions = badge([
        [soumises, 'constat(s) à valider', 'ATTENTION'],
        [aDecider, 'décision(s) à prendre', 'ATTENTION'],
        [brouillons, 'constat(s) en cours', 'INFO'],
      ]);
    }

    // ----- PARAMÉTRAGE : médicaments vendus sans prix de vente -----
    if (voit('parametrage')) {
      const sansPrix = await this.prisma.medicament.count({
        where: { actif: true, consommable: false, prixVente: { none: { centreId: null, dateFin: null } } },
      });
      enAttente.parametrage = badge([[sansPrix, 'médicament(s) sans prix de vente', 'ATTENTION']]);
    }

    // Toutes les alertes URGENTES (bandeau de l'accueil), avec leur module
    const urgences = Object.entries(enAttente).flatMap(([module, b]) =>
      (b?.alertes ?? []).filter((a) => a.niveau === 'URGENT').map((a) => ({ module, ...a })),
    );
    return { indicateurs, enAttente, urgences };
  }
}
