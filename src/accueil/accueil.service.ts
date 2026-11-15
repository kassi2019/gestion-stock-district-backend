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
 *   enAttente (badge de chaque tuile) : { module: { nombre, libelle } }
 *     achats        commandes en brouillon + commandes à réceptionner + réceptions à valider
 *     stock         lots périmés à retirer + ruptures
 *     livraisons    commandes des centres à valider / à livrer + livraisons en préparation
 *     consommations rapports soumis (à valider) + brouillons
 *     facturation   rapports validés pas encore facturés
 *     paiements     factures non soldées
 *     supervisions  supervisions en cours (brouillon / soumises)
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

/** Badge d'une tuile : nombre + texte court (ex. « 3 à valider »). */
export interface Badge {
  nombre: number;
  libelle: string;
}

/** Assemble un badge à partir de plusieurs compteurs (ceux à 0 sont ignorés). */
function badge(parts: [number, string][]): Badge | null {
  const utiles = parts.filter(([n]) => n > 0);
  if (utiles.length === 0) return null;
  return { nombre: utiles.reduce((t, [n]) => t + n, 0), libelle: utiles.map(([n, texte]) => `${n} ${texte}`).join(' · ') };
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
        [alertes.lotsPerimes, 'lot(s) périmé(s)'],
        [alertes.ruptures, 'rupture(s)'],
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
        [brouillons, 'commande(s) en brouillon'],
        [aReceptionner, 'à réceptionner'],
        [receptions, 'réception(s) à valider'],
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
        [aValider, 'commande(s) à valider'],
        [aLivrer, 'à livrer'],
        [enPreparation, 'en préparation'],
      ]);
    }

    // ----- RAPPORTS DE CONSOMMATION -----
    if (voit('consommations')) {
      const [soumis, brouillons] = await Promise.all([
        this.prisma.rapportConsommation.findMany({ where: { statut: SR.SOUMIS }, select: { montantTotal: true } }),
        this.prisma.rapportConsommation.count({ where: { statut: SR.BROUILLON } }),
      ]);
      indicateurs.rapports = {
        aValider: soumis.length,
        montant: soumis.reduce((t, r) => t + Number(r.montantTotal), 0),
        brouillons,
      };
      enAttente.consommations = badge([
        [soumis.length, 'à valider'],
        [brouillons, 'brouillon(s)'],
      ]);
    }

    // ----- FACTURATION ET PAIEMENTS -----
    const voitFinances = voit('facturation') || voit('paiements');
    if (voitFinances) {
      const nonSoldees = await this.prisma.facture.findMany({
        where: { statut: { in: [SF.EMISE, SF.PARTIELLEMENT_PAYEE] } },
        select: { centreId: true, montantTotal: true, montantPaye: true },
      });
      indicateurs.creances = {
        montant: nonSoldees.reduce((t, f) => t + Number(f.montantTotal) - Number(f.montantPaye), 0),
        factures: nonSoldees.length,
        centres: new Set(nonSoldees.map((f) => f.centreId)).size,
      };
      if (voit('paiements')) enAttente.paiements = badge([[nonSoldees.length, 'facture(s) non soldée(s)']]);
    }
    if (voit('facturation')) {
      const aFacturer = await this.prisma.rapportConsommation.count({ where: { statut: SR.VALIDE } });
      enAttente.facturation = badge([[aFacturer, 'rapport(s) à facturer']]);
    }

    // ----- SUPERVISIONS -----
    if (voit('supervisions')) {
      const [brouillons, soumises] = await Promise.all([
        this.prisma.supervision.count({ where: { statut: SS.BROUILLON } }),
        this.prisma.supervision.count({ where: { statut: SS.SOUMISE } }),
      ]);
      enAttente.supervisions = badge([
        [soumises, 'à valider'],
        [brouillons, 'en cours'],
      ]);
    }

    return { indicateurs, enAttente };
  }
}
