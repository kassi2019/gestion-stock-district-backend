/**
 * =============================================================================
 * SERVICE DU RAPPORT CENTRE DE SANTÉ (spec nov. 2026, §5)
 * =============================================================================
 * Le rapport mensuel REMPLACE LA COMMANDE : le district y saisit la
 * consommation du centre, et l'application calcule le stock restant et la
 * quantité à livrer. Un rapport par centre et par mois, une ligne par produit.
 * Seul le district saisit et valide (le centre n'a pas d'accès en écriture).
 *
 * COLONNES (une ligne par produit, comme la fiche papier « Rapport commande
 * mensuel recouvrables ») :
 *   SI  stock initial     = SDU du rapport validé du mois précédent
 *                           (1er rapport du centre : inventaire initial)
 *   R   quantité reçue    = somme des factures-sorties du mois pour ce centre
 *   T   transferts        = reçus d'autres centres - cédés (table transferts_centre)
 *   C   quantité utilisée SAISIE (c'est ce que le centre doit VERSER : C x prix de vente)
 *       quantité restante SAISIE (comptée au centre, comme un inventaire) ;
 *                         vide = stock théorique SI + R + T - C
 *   P   perte / ajust.    = SI + R + T - C - restant (négatif = surplus constaté)
 *   SDU stock disponible  = quantité restante
 *       jours de rupture  SAISIS (0 à 30) : corrigent la consommation du mois
 *                         C ajustée = C x 30 / (30 - jours de rupture)
 *   CMM conso moyenne     = moyenne des C ajustées sur MOIS_CMM mois (3) : le
 *                           mois et les précédents ; au début, sur les mois disponibles
 *       mois de stock     = SDU / CMM
 *   QaC à commander       = max(0, N x CMM - SDU), arrondie à l'unité supérieure
 *                           (N = MOIS_STOCK_MAX, 2 par défaut)
 *
 * VALIDATION (une seule transaction) :
 *   - le rapport du mois précédent doit être validé (sauf 1er rapport) ;
 *   - le mois doit être terminé (validation à partir du 1er du mois suivant) ;
 *   - aucun SDU négatif ;
 *   - prix figés (vente et achat, au dernier jour du mois) ;
 *   - stock théorique du centre : - C, - P, ± T (mouvements tracés) ;
 *   - rapport verrouillé ; son SDU devient le SI du mois suivant ;
 *   - l'inventaire initial est verrouillé (premier rapport validé).
 *   La validation NE CRÉE PAS de facture.
 *
 * FACTURE GÉNÉRÉE (module Facturation, après validation du rapport) :
 *   centre + mois -> proposition ligne par ligne : quantité à commander (QaC)
 *   du rapport, limitée au stock du district. Le gestionnaire valide ou
 *   RÉDUIT chaque quantité (jamais plus que QaC : pour plus, facture manuelle).
 *   Une seule facture générée (non annulée) par rapport ; datée dans le MOIS
 *   SUIVANT le rapport (elle compte dans le « Reçu » du rapport suivant).
 *
 * RÉOUVERTURE (administrateur, motif) : seulement si le rapport du mois
 *   suivant n'est pas validé. Les mouvements du centre sont inversés et la
 *   facture générée est annulée (refus si des paiements y sont imputés).
 *
 * Numéro automatique : RCM-2026-00001 (le même compteur que les anciens rapports).
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
  TYPE_MOUVEMENT_CENTRE,
} from '../common/constants';
import { aujourdhui } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { PrixService } from '../parametrage/prix/prix.service';
import { SortiesService } from '../facturation/sorties.service';
import { libellePeriode } from './consommations.service';
import { CreerTransfertDto, EnregistrerRapportCentreDto, GenererFactureDto, OuvrirRapportCentreDto } from './rapports-centre.dto';

type Db = Prisma.TransactionClient;

/** Saisie d'une ligne (ce que le district tape). */
interface Saisie {
  consomme: number;
  /** quantité restante comptée (null = pas encore saisie : stock théorique retenu) */
  stockRestant: number | null;
  joursRupture: number;
  quantiteValidee: number | null;
}

/** Ligne calculée du rapport. */
export interface LigneCalculee {
  medicamentId: number;
  stockInitial: number; // SI
  recu: number; // R
  stockTotal: number; // ST
  consomme: number; // C
  /** quantité restante SAISIE (null = pas saisie) */
  stockRestant: number | null;
  pertes: number; // P (perte / ajustement)
  transferts: number; // T
  stockDisponible: number; // SDU
  joursRupture: number;
  /** C ajustées des mois précédents prises dans la CMM (du plus récent au plus ancien) */
  historique: number[];
  cmm: number;
  quantiteProposee: number; // QaC
  quantiteValidee: number;
  /** true = la quantité validée a été changée par le district (sinon elle suit QaC) */
  quantiteModifiee: boolean;
}

function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

/**
 * Consommation AJUSTÉE d'un mois, corrigée des jours de rupture :
 * C x 30 / (30 - jours). Sans rupture (ou rupture tout le mois) : C.
 */
export function consommationAjustee(consomme: number, joursRupture: number) {
  if (!joursRupture || joursRupture <= 0 || joursRupture >= 30) return consomme;
  return arrondi((consomme * 30) / (30 - joursRupture));
}

/** Numéro de mois absolu (pour comparer / reculer facilement). */
const rang = (annee: number, mois: number) => annee * 12 + (mois - 1);
const deRang = (r: number) => ({ annee: Math.floor(r / 12), mois: (r % 12) + 1 });

/** Premier et dernier jour d'un mois (dates UTC). */
function bornesMois(annee: number, mois: number) {
  return { debut: new Date(Date.UTC(annee, mois - 1, 1)), fin: new Date(Date.UTC(annee, mois, 0)) };
}

const PERSONNE = { select: { id: true, nom: true, prenoms: true } };

@Injectable()
export class RapportsCentreService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private prix: PrixService,
    private sorties: SortiesService,
  ) {}

  // ===========================================================================
  // CONSULTATION
  // ===========================================================================

  /** Liste des rapports centre (nouveau circuit). */
  lister(filtres: { centreId?: number; annee?: number; mois?: number; statut?: string }) {
    return this.prisma.rapportConsommation.findMany({
      where: {
        nouveauCircuit: true,
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.annee ? { annee: filtres.annee } : {}),
        ...(filtres.mois ? { mois: filtres.mois } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        facture: { select: { id: true, numero: true, statut: true, montantTotal: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }, { centre: { nom: 'asc' } }],
    });
  }

  /**
   * Un rapport complet. Brouillon : colonnes RECALCULÉES (une facture ou un
   * transfert a pu arriver depuis le dernier enregistrement). Validé : valeurs figées.
   * Avec : stock du district par produit, transferts du mois, possibilité de valider.
   */
  async trouver(id: number) {
    const rapport = await this.prisma.rapportConsommation.findUnique({
      where: { id },
      include: {
        centre: { include: { type: { select: { libelle: true } } } },
        utilisateur: PERSONNE,
        validateur: PERSONNE,
        reouvreur: PERSONNE,
        facture: {
          select: { id: true, numero: true, statut: true, montantTotal: true, dateEmission: true, lignes: { select: { medicamentId: true, quantite: true } } },
        },
        lignes: true,
      },
    });
    if (!rapport || !rapport.nouveauCircuit) throw new NotFoundException('Rapport centre introuvable.');

    // Quantité ACCORDÉE par produit = facture générée (plusieurs lots possibles par produit)
    const accordees = new Map<number, number>();
    for (const l of rapport.facture?.lignes ?? []) accordees.set(l.medicamentId, (accordees.get(l.medicamentId) ?? 0) + l.quantite);

    let lignes: LigneCalculee[];
    if (rapport.statut === SR.BROUILLON) {
      const saisies = new Map<number, Saisie>(
        rapport.lignes.map((l) => [
          l.medicamentId,
          { consomme: l.quantite, stockRestant: l.stockRestant, joursRupture: l.joursRupture, quantiteValidee: l.quantiteValidee },
        ]),
      );
      lignes = (await this.calculer(this.prisma, rapport, saisies)).lignes;
    } else {
      const historiques = await this.historiques(this.prisma, rapport);
      lignes = rapport.lignes.map((l) => ({
        medicamentId: l.medicamentId,
        stockInitial: l.stockInitial,
        recu: l.recu,
        stockTotal: l.stockInitial + l.recu,
        consomme: l.quantite,
        stockRestant: l.stockRestant,
        pertes: l.pertes,
        transferts: l.transferts,
        stockDisponible: l.stockDisponible,
        joursRupture: l.joursRupture,
        historique: historiqueDe(historiques, l.medicamentId),
        cmm: Number(l.cmm),
        quantiteProposee: l.quantiteProposee,
        quantiteValidee: l.quantiteValidee ?? 0,
        quantiteModifiee: (l.quantiteValidee ?? 0) !== l.quantiteProposee,
      }));
    }

    const ids = lignes.map((l) => l.medicamentId);
    const [medicaments, stockDistrict, transferts, parametres, controle] = await Promise.all([
      this.prisma.medicament.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, designation: true, dosage: true, unite: true, consommable: true, uniteVente: { select: { libelle: true } } },
      }),
      this.sorties.stockDisponible(this.prisma, ids),
      this.transfertsDuMois(rapport.centreId, rapport.annee, rapport.mois),
      this.parametres(this.prisma),
      this.controleValidation(this.prisma, rapport),
    ]);
    const prixLigne = new Map(rapport.lignes.map((l) => [l.medicamentId, l]));

    // Prix de vente : figé si validé ; sinon prix applicable au dernier jour du
    // mois (sert au « montant à verser » = quantité utilisée x prix de vente)
    const prixVente = new Map<number, number | null>();
    const { fin } = bornesMois(rapport.annee, rapport.mois);
    for (const m of medicaments) {
      if (rapport.statut !== SR.BROUILLON) prixVente.set(m.id, Number(prixLigne.get(m.id)?.prixUnitaire ?? 0));
      else if (m.consommable) prixVente.set(m.id, 0);
      else {
        const p = await this.prix.prixVenteApplicable(m.id, rapport.centreId, fin);
        prixVente.set(m.id, p === null ? null : Number(p));
      }
    }

    return {
      ...rapport,
      lignes: lignes
        .map((l) => ({
          ...l,
          medicament: medicaments.find((m) => m.id === l.medicamentId),
          stockDistrict: stockDistrict.get(l.medicamentId) ?? 0,
          prixUnitaire: prixVente.get(l.medicamentId) ?? null,
          quantiteAccordee: rapport.facture ? (accordees.get(l.medicamentId) ?? 0) : null,
          prixAchat: prixLigne.get(l.medicamentId)?.prixAchat ?? null,
        }))
        .sort((a, b) => (a.medicament?.designation ?? '').localeCompare(b.medicament?.designation ?? '')),
      transferts,
      parametres,
      peutValider: controle.ok,
      raisonBlocage: controle.raison,
    };
  }

  /** Tableau de suivi d'une année : centres × mois (rapports du nouveau circuit). */
  async suivi(annee: number) {
    const [centres, rapports] = await Promise.all([
      this.prisma.centreSante.findMany({ where: { actif: true }, select: { id: true, code: true, nom: true }, orderBy: { nom: 'asc' } }),
      this.prisma.rapportConsommation.findMany({
        where: { annee, nouveauCircuit: true },
        select: { id: true, numero: true, centreId: true, mois: true, statut: true, montantTotal: true },
      }),
    ]);
    return centres.map((centre) => ({
      centre,
      mois: Object.fromEntries(rapports.filter((r) => r.centreId === centre.id).map((r) => [r.mois, r])),
    }));
  }

  // ===========================================================================
  // OUVRIR / ENREGISTRER / SUPPRIMER (BROUILLON)
  // ===========================================================================

  /**
   * Ouvre le rapport d'un centre pour un mois : le renvoie s'il existe,
   * sinon le crée en brouillon, pré-rempli avec les produits du centre
   * (tous les produits qui ont du stock au centre ; quantités utilisées et restantes à saisir).
   */
  async ouvrir(dto: OuvrirRapportCentreDto, utilisateurId: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: dto.centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    const maintenant = aujourdhui();
    if (rang(dto.annee, dto.mois) > rang(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1)) {
      throw new BadRequestException(`Impossible d'ouvrir le rapport d'un mois futur (${libellePeriode(dto.annee, dto.mois)}).`);
    }

    const existant = await this.prisma.rapportConsommation.findUnique({
      where: { centreId_annee_mois: { centreId: dto.centreId, annee: dto.annee, mois: dto.mois } },
    });
    if (existant) {
      if (!existant.nouveauCircuit) {
        throw new BadRequestException(
          `Le centre a déjà un rapport de l'ANCIEN circuit pour ${libellePeriode(dto.annee, dto.mois)} (${existant.numero}) : consultez-le dans « Anciens rapports ».`,
        );
      }
      return this.trouver(existant.id);
    }
    if (!centre.actif) throw new BadRequestException(`Le centre « ${centre.nom} » est désactivé.`);

    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.RAPPORT, new Date());
      const { lignes } = await this.calculer(tx, { id: 0, centreId: dto.centreId, annee: dto.annee, mois: dto.mois }, new Map());
      const rapport = await tx.rapportConsommation.create({
        data: {
          numero,
          centreId: dto.centreId,
          annee: dto.annee,
          mois: dto.mois,
          statut: SR.BROUILLON,
          nouveauCircuit: true,
          utilisateurId,
          lignes: { create: lignes.map((l) => versLigneBase(l)) },
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'RapportCentre', entiteId: rapport.id, apres: rapport }, tx);
      return rapport.id;
    });
    return this.trouver(id);
  }

  /** Enregistre le BROUILLON : saisies (C, P, quantité validée) + colonnes recalculées. */
  async enregistrer(id: number, dto: EnregistrerRapportCentreDto, utilisateurId: number) {
    const rapport = await this.rapportBrouillon(id);
    const saisies = this.lireSaisies(dto);
    await this.prisma.$transaction(async (tx) => {
      const { lignes } = await this.calculer(tx, rapport, saisies);
      await tx.ligneConsommation.deleteMany({ where: { rapportId: id } });
      await tx.ligneConsommation.createMany({ data: lignes.map((l) => ({ ...versLigneBase(l), rapportId: id })) });
      await tx.rapportConsommation.update({
        where: { id },
        data: { ...(dto.observations !== undefined ? { observations: dto.observations } : {}) },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'MODIFICATION', entite: 'RapportCentre', entiteId: id, apres: { lignes: dto.lignes } }, tx);
    });
    return this.trouver(id);
  }

  /** Suppression d'un brouillon (ouvert par erreur). */
  async supprimer(id: number, utilisateurId: number) {
    const rapport = await this.rapportBrouillon(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.ligneConsommation.deleteMany({ where: { rapportId: id } });
      await tx.rapportConsommation.delete({ where: { id } });
      await this.audit.enregistrer({ utilisateurId, action: 'SUPPRESSION', entite: 'RapportCentre', entiteId: id, avant: rapport }, tx);
    });
    return { supprime: true };
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /**
   * VALIDATION (voir l'en-tête). Les saisies envoyées sont enregistrées puis
   * validées dans la même transaction (pas besoin d'enregistrer avant).
   */
  async valider(id: number, dto: EnregistrerRapportCentreDto, utilisateurId: number) {
    const rapport = await this.rapportBrouillon(id);
    const saisies = this.lireSaisies(dto);
    const { fin } = bornesMois(rapport.annee, rapport.mois);

    await this.prisma.$transaction(
      async (tx) => {
        const controle = await this.controleValidation(tx, rapport);
        if (!controle.ok) throw new BadRequestException(controle.raison);

        const { lignes } = await this.calculer(tx, rapport, saisies);
        const medicaments = await tx.medicament.findMany({ where: { id: { in: lignes.map((l) => l.medicamentId) } } });
        const nom = (medId: number) => medicaments.find((m) => m.id === medId)?.designation ?? 'Produit';

        // 1. Contrôles : SDU jamais négatif
        const negatif = lignes.find((l) => l.stockDisponible < 0);
        if (negatif) {
          throw new BadRequestException(
            `« ${nom(negatif.medicamentId)} » : le stock disponible serait négatif (${negatif.stockDisponible}). Vérifiez la quantité utilisée ou saisissez la quantité restante.`,
          );
        }

        // 2. Prix figés au dernier jour du mois (vente : refus s'il manque ; achat : facultatif)
        const sansPrix: string[] = [];
        let montantTotal = 0;
        const lignesFinales = [];
        for (const l of lignes) {
          const med = medicaments.find((m) => m.id === l.medicamentId)!;
          let prixVente = 0;
          if (!med.consommable) {
            const p = await this.prix.prixVenteApplicable(med.id, rapport.centreId, fin);
            if (p === null && l.consomme + Math.abs(l.pertes) > 0) sansPrix.push(med.designation);
            prixVente = p === null ? 0 : Number(p);
          }
          const prixAchat = await this.prix.prixAchatApplicable(med.id, fin);
          const montant = arrondi(l.consomme * prixVente);
          montantTotal += montant;
          lignesFinales.push({
            ...versLigneBase(l),
            quantiteValidee: null, // la quantité accordée se décide dans la facture générée
            prixUnitaire: prixVente,
            montant,
            prixAchat: prixAchat === null ? null : Number(prixAchat),
            rapportId: id,
          });
        }
        if (sansPrix.length) {
          throw new BadRequestException(`Pas de prix de vente pour : ${sansPrix.join(', ')}. Définissez-le dans Paramétrage > Prix.`);
        }
        await tx.ligneConsommation.deleteMany({ where: { rapportId: id } });
        await tx.ligneConsommation.createMany({ data: lignesFinales });

        // 3. Stock théorique du centre : - C, - P (perte ; + si surplus), ± T
        const motif = `Rapport ${rapport.numero} (${libellePeriode(rapport.annee, rapport.mois)})`;
        for (const l of lignes) {
          await this.mouvementCentre(tx, rapport, l.medicamentId, -l.consomme, TYPE_MOUVEMENT_CENTRE.CONSOMMATION, motif, utilisateurId);
          await this.mouvementCentre(tx, rapport, l.medicamentId, -l.pertes, TYPE_MOUVEMENT_CENTRE.PERTE, `Perte / ajustement — ${motif}`, utilisateurId);
          await this.mouvementCentre(tx, rapport, l.medicamentId, l.transferts, TYPE_MOUVEMENT_CENTRE.TRANSFERT, `Transferts — ${motif}`, utilisateurId);
        }

        // 4. Rapport validé
        await tx.rapportConsommation.update({
          where: { id },
          data: {
            statut: SR.VALIDE,
            validePar: utilisateurId,
            dateValidation: new Date(),
            montantTotal: arrondi(montantTotal),
            ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
          },
        });

        // 5. Inventaire initial verrouillé (premier rapport validé)
        await tx.parametre.upsert({
          where: { cle: PARAM_RAPPORT.INVENTAIRE_INITIAL_VERROUILLE },
          update: { valeur: 'true' },
          create: { cle: PARAM_RAPPORT.INVENTAIRE_INITIAL_VERROUILLE, valeur: 'true', description: "Inventaire initial verrouillé (premier rapport centre validé)" },
        });

        await this.audit.enregistrer(
          { utilisateurId, action: 'VALIDATION', entite: 'RapportCentre', entiteId: id, apres: { lignes: lignesFinales.length } },
          tx,
        );
      },
      { timeout: 120000 },
    );
    return this.trouver(id);
  }

  // ===========================================================================
  // FACTURE GÉNÉRÉE (module Facturation)
  // ===========================================================================

  /**
   * Rapport VALIDÉ d'un centre pour un mois, sans facture générée en cours
   * (sinon message clair : pas de rapport, pas validé, déjà facturé).
   */
  private async rapportAFacturer(db: Db, centreId: number, annee: number, mois: number) {
    const rapport = await db.rapportConsommation.findUnique({
      where: { centreId_annee_mois: { centreId, annee, mois } },
      include: { centre: { select: { id: true, code: true, nom: true } }, lignes: true, facture: { select: { numero: true, statut: true } } },
    });
    const periode = libellePeriode(annee, mois);
    if (!rapport || !rapport.nouveauCircuit) {
      throw new BadRequestException(`Aucun rapport de ${periode} pour ce centre : saisissez-le d'abord (Consommations > Rapports des centres).`);
    }
    if (rapport.statut !== SR.VALIDE) {
      throw new BadRequestException(`Le rapport ${rapport.numero} de ${periode} n'est pas encore validé : validez-le avant de servir le centre.`);
    }
    if (rapport.facture && rapport.facture.statut !== SF.ANNULEE) {
      throw new BadRequestException(`La facture du rapport de ${periode} est déjà générée : ${rapport.facture.numero}.`);
    }
    return rapport;
  }

  /**
   * PROPOSITION de facture générée : une ligne par produit dont la quantité à
   * commander (QaC) du rapport est > 0, quantité proposée = QaC limitée au
   * stock du district, prix de vente à la date de la facture.
   */
  async propositionFacture(centreId: number, annee: number, mois: number) {
    const rapport = await this.rapportAFacturer(this.prisma, centreId, annee, mois);
    const dateEmission = this.dateFacture(annee, mois);
    const lignesRapport = rapport.lignes.filter((l) => l.quantiteProposee > 0);
    const ids = lignesRapport.map((l) => l.medicamentId);
    const [medicaments, stockDistrict, stockPerime] = await Promise.all([
      this.prisma.medicament.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, designation: true, unite: true, consommable: true, uniteVente: { select: { libelle: true } } },
      }),
      this.sorties.stockDisponible(this.prisma, ids),
      // Lots périmés : non servables, affichés pour information
      this.sorties.stockPerime(this.prisma, ids),
    ]);

    const lignes = [];
    for (const l of lignesRapport) {
      const med = medicaments.find((m) => m.id === l.medicamentId);
      let prixVente: number | null = 0;
      if (!med?.consommable) {
        const p = await this.prix.prixVenteApplicable(l.medicamentId, centreId, dateEmission);
        prixVente = p === null ? null : Number(p);
      }
      const stock = stockDistrict.get(l.medicamentId) ?? 0;
      lignes.push({
        medicamentId: l.medicamentId,
        medicament: med,
        stockDisponibleCentre: l.stockDisponible,
        cmm: Number(l.cmm),
        quantiteACommander: l.quantiteProposee,
        stockDistrict: stock,
        stockPerime: stockPerime.get(l.medicamentId) ?? 0,
        quantiteProposee: Math.min(l.quantiteProposee, Math.max(0, stock)),
        prixVente,
      });
    }
    lignes.sort((a, b) => (a.medicament?.designation ?? '').localeCompare(b.medicament?.designation ?? ''));

    return {
      rapport: { id: rapport.id, numero: rapport.numero, annee, mois, centre: rapport.centre },
      dateEmission,
      lignes,
    };
  }

  /**
   * CRÉATION de la facture générée : quantités validées ou RÉDUITES par le
   * gestionnaire (0 = produit non servi ; jamais plus que QaC). La facture
   * sort le stock du district (lots dont la péremption est la plus proche d'abord).
   */
  async genererFacture(rapportId: number, dto: GenererFactureDto, utilisateurId: number) {
    const r = await this.prisma.rapportConsommation.findUnique({ where: { id: rapportId } });
    if (!r || !r.nouveauCircuit) throw new NotFoundException('Rapport centre introuvable.');

    const factureId = await this.prisma.$transaction(
      async (tx) => {
        const rapport = await this.rapportAFacturer(tx, r.centreId, r.annee, r.mois);
        const vus = new Set<number>();
        for (const demande of dto.lignes) {
          if (vus.has(demande.medicamentId)) throw new BadRequestException('Un même produit apparaît plusieurs fois.');
          vus.add(demande.medicamentId);
          const ligne = rapport.lignes.find((l) => l.medicamentId === demande.medicamentId);
          if (!ligne) throw new BadRequestException("Un produit ne figure pas dans le rapport : utilisez une facture manuelle.");
          if (demande.quantite > ligne.quantiteProposee) {
            const med = await tx.medicament.findUnique({ where: { id: demande.medicamentId } });
            throw new BadRequestException(
              `« ${med?.designation} » : ${demande.quantite} demandé(s), quantité à commander du rapport : ${ligne.quantiteProposee}. Pour donner plus, faites une facture manuelle.`,
            );
          }
        }
        const id = await this.sorties.creerDansTransaction(
          tx,
          {
            centreId: rapport.centreId,
            dateEmission: this.dateFacture(rapport.annee, rapport.mois),
            origine: ORIGINE_FACTURE.RAPPORT,
            rapportId: rapport.id,
            lignes: dto.lignes.filter((l) => l.quantite > 0),
          },
          utilisateurId,
        );
        await this.audit.enregistrer(
          { utilisateurId, action: 'GENERATION_FACTURE', entite: 'RapportCentre', entiteId: rapport.id, apres: { factureId: id, lignes: dto.lignes } },
          tx,
        );
        return id;
      },
      { timeout: 120000 },
    );
    return this.prisma.facture.findUniqueOrThrow({ where: { id: factureId }, select: { id: true, numero: true, montantTotal: true, dateEmission: true } });
  }

  // ===========================================================================
  // RÉOUVERTURE (ADMINISTRATEUR)
  // ===========================================================================

  async rouvrir(id: number, motif: string, utilisateurId: number) {
    if (!motif?.trim()) throw new BadRequestException('Indiquez le motif de la réouverture.');
    const rapport = await this.prisma.rapportConsommation.findUnique({
      where: { id },
      include: { lignes: true, facture: { include: { lignes: true, imputations: { where: { paiement: { annule: false } } } } } },
    });
    if (!rapport || !rapport.nouveauCircuit) throw new NotFoundException('Rapport centre introuvable.');
    if (rapport.statut !== SR.VALIDE) throw new BadRequestException('Seul un rapport validé peut être rouvert.');

    const suivant = deRang(rang(rapport.annee, rapport.mois) + 1);
    const rapportSuivant = await this.prisma.rapportConsommation.findUnique({
      where: { centreId_annee_mois: { centreId: rapport.centreId, annee: suivant.annee, mois: suivant.mois } },
    });
    if (rapportSuivant?.nouveauCircuit && rapportSuivant.statut === SR.VALIDE) {
      throw new BadRequestException(`Le rapport de ${libellePeriode(suivant.annee, suivant.mois)} est déjà validé : rouvrez-le d'abord.`);
    }
    if (rapport.facture && rapport.facture.statut !== SF.ANNULEE && rapport.facture.imputations.length > 0) {
      throw new BadRequestException(`Des paiements sont imputés sur la facture ${rapport.facture.numero} : annulez d'abord ces paiements.`);
    }

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Mouvements du centre inversés (+ C, + P, ∓ T)
        const texte = `Réouverture du rapport ${rapport.numero} : ${motif.trim()}`;
        for (const l of rapport.lignes) {
          await this.mouvementCentre(tx, rapport, l.medicamentId, l.quantite, TYPE_MOUVEMENT_CENTRE.REGULARISATION, texte, utilisateurId);
          await this.mouvementCentre(tx, rapport, l.medicamentId, l.pertes, TYPE_MOUVEMENT_CENTRE.REGULARISATION, texte, utilisateurId);
          await this.mouvementCentre(tx, rapport, l.medicamentId, -l.transferts, TYPE_MOUVEMENT_CENTRE.REGULARISATION, texte, utilisateurId);
        }

        // 2. Facture générée annulée (le stock revient au district)
        const f = rapport.facture;
        if (f && f.statut !== SF.ANNULEE) {
          await this.sorties.annulerSortie(tx, f, texte, utilisateurId);
          await tx.facture.update({
            where: { id: f.id },
            data: {
              statut: SF.ANNULEE,
              motifAnnulation: texte.substring(0, 255),
              annulePar: utilisateurId,
              dateAnnulation: new Date(),
              rapportId: null,
              rapportOrigineId: rapport.id,
            },
          });
        }

        // 3. Quantité validée égale à la proposition : elle suivra de nouveau le calcul
        for (const l of rapport.lignes) {
          if (l.quantiteValidee === l.quantiteProposee) await tx.ligneConsommation.update({ where: { id: l.id }, data: { quantiteValidee: null } });
        }

        // 4. Rapport en brouillon, réouverture tracée
        await tx.rapportConsommation.update({
          where: { id },
          data: {
            statut: SR.BROUILLON,
            validePar: null,
            dateValidation: null,
            reouvertPar: utilisateurId,
            dateReouverture: new Date(),
            motifReouverture: motif.trim(),
          },
        });
        await this.audit.enregistrer(
          { utilisateurId, action: 'REOUVERTURE', entite: 'RapportCentre', entiteId: id, avant: { statut: rapport.statut, facture: f?.numero }, apres: { motif: motif.trim() } },
          tx,
        );
      },
      { timeout: 120000 },
    );
    return this.trouver(id);
  }

  // ===========================================================================
  // TRANSFERTS ENTRE CENTRES
  // ===========================================================================

  /**
   * Transfert CÉDÉ par le centre du rapport à un autre centre, pour le mois du
   * rapport. Compté en - chez le centre qui cède, en + chez celui qui reçoit.
   * Refusé si l'un des deux rapports du mois est déjà validé.
   */
  async ajouterTransfert(rapportId: number, dto: CreerTransfertDto, utilisateurId: number) {
    const rapport = await this.rapportBrouillon(rapportId);
    if (dto.centreDestinationId === rapport.centreId) throw new BadRequestException('Le centre qui reçoit doit être différent.');
    const destination = await this.prisma.centreSante.findUnique({ where: { id: dto.centreDestinationId } });
    if (!destination || !destination.actif) throw new BadRequestException('Centre qui reçoit introuvable ou désactivé.');
    const med = await this.prisma.medicament.findUnique({ where: { id: dto.medicamentId } });
    if (!med) throw new NotFoundException('Produit introuvable.');
    await this.verifierRapportNonValide(dto.centreDestinationId, rapport.annee, rapport.mois, destination.nom);

    const t = await this.prisma.$transaction(async (tx) => {
      const transfert = await tx.transfertCentre.create({
        data: {
          annee: rapport.annee,
          mois: rapport.mois,
          centreSourceId: rapport.centreId,
          centreDestinationId: dto.centreDestinationId,
          medicamentId: dto.medicamentId,
          quantite: dto.quantite,
          motif: dto.motif?.trim() || null,
          utilisateurId,
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'TransfertCentre', entiteId: transfert.id, apres: transfert }, tx);
      return transfert;
    });
    return t;
  }

  /** Suppression d'un transfert (les deux rapports du mois doivent être en brouillon). */
  async supprimerTransfert(transfertId: number, utilisateurId: number) {
    const t = await this.prisma.transfertCentre.findUnique({
      where: { id: transfertId },
      include: { centreSource: { select: { nom: true } }, centreDestination: { select: { nom: true } } },
    });
    if (!t) throw new NotFoundException('Transfert introuvable.');
    await this.verifierRapportNonValide(t.centreSourceId, t.annee, t.mois, t.centreSource.nom);
    await this.verifierRapportNonValide(t.centreDestinationId, t.annee, t.mois, t.centreDestination.nom);
    await this.prisma.$transaction(async (tx) => {
      await tx.transfertCentre.delete({ where: { id: transfertId } });
      await this.audit.enregistrer({ utilisateurId, action: 'SUPPRESSION', entite: 'TransfertCentre', entiteId: transfertId, avant: t }, tx);
    });
    return { supprime: true };
  }

  // ===========================================================================
  // CALCULS
  // ===========================================================================

  /**
   * Calcule toutes les colonnes du rapport (voir l'en-tête).
   * Produits du rapport = produits saisis + tout produit ayant un SI, un R ou un T.
   */
  private async calculer(db: Db, rapport: { id: number; centreId: number; annee: number; mois: number }, saisies: Map<number, Saisie>) {
    const { centreId, annee, mois } = rapport;
    const { debut, fin } = bornesMois(annee, mois);
    const { n, moisCmm } = await this.parametres(db);

    // SI : SDU du rapport précédent (nouveau circuit), sinon inventaire initial
    const precedent = await this.rapportPrecedent(db, rapport);
    const si = new Map<number, number>();
    if (precedent) {
      for (const l of precedent.lignes) si.set(l.medicamentId, l.stockDisponible);
    } else {
      const inv = await db.inventaireInitial.groupBy({ by: ['medicamentId'], where: { centreId }, _sum: { quantite: true } });
      for (const l of inv) si.set(l.medicamentId, l._sum.quantite ?? 0);
    }

    // R : factures-sorties du mois (non annulées)
    const recus = await db.ligneFacture.groupBy({
      by: ['medicamentId'],
      where: { facture: { centreId, sortieStock: true, statut: { not: SF.ANNULEE }, dateEmission: { gte: debut, lte: fin } } },
      _sum: { quantite: true },
    });
    const r = new Map(recus.map((x) => [x.medicamentId, x._sum.quantite ?? 0]));

    // T : reçus (+) et cédés (-) du mois
    const transferts = await db.transfertCentre.findMany({
      where: { annee, mois, OR: [{ centreSourceId: centreId }, { centreDestinationId: centreId }] },
    });
    const t = new Map<number, number>();
    for (const x of transferts) {
      const signe = x.centreDestinationId === centreId ? 1 : -1;
      t.set(x.medicamentId, (t.get(x.medicamentId) ?? 0) + signe * x.quantite);
    }

    // CMM : consommations (ajustées) des (moisCmm - 1) mois précédents, quand le rapport existe
    const historiques = await this.historiques(db, rapport, moisCmm);

    // Produits du rapport : tous ceux qui ont du stock au centre (SI), un reçu
    // ou un transfert, plus ceux ajoutés à la main
    const ids = new Set<number>([...saisies.keys()]);
    for (const [id, q] of si) if (q !== 0) ids.add(id);
    for (const [id, q] of r) if (q !== 0) ids.add(id);
    for (const [id, q] of t) if (q !== 0) ids.add(id);

    // Stock du district : la quantité accordée proposée ne peut pas le dépasser
    const stockDistrict = await this.sorties.stockDisponible(db, [...ids]);

    const lignes: LigneCalculee[] = [];
    for (const medicamentId of ids) {
      const saisie = saisies.get(medicamentId) ?? { consomme: 0, stockRestant: null, joursRupture: 0, quantiteValidee: null };
      const stockInitial = si.get(medicamentId) ?? 0;
      const recu = r.get(medicamentId) ?? 0;
      const transfert = t.get(medicamentId) ?? 0;
      // Stock théorique, puis restant compté : l'écart est la perte / l'ajustement
      const theorique = stockInitial + recu + transfert - saisie.consomme;
      const restantSaisi = saisie.stockRestant !== null && saisie.stockRestant !== undefined;
      const stockDisponible = restantSaisi ? (saisie.stockRestant as number) : theorique;
      const pertes = theorique - stockDisponible;
      const historique = historiqueDe(historiques, medicamentId);
      const consoMois = consommationAjustee(saisie.consomme, saisie.joursRupture);
      const cmm = arrondi((consoMois + historique.reduce((s, c) => s + c, 0)) / (1 + historique.length));
      const quantiteProposee = Math.max(0, Math.ceil(n * cmm - stockDisponible));
      const quantiteModifiee = saisie.quantiteValidee !== null && saisie.quantiteValidee !== undefined;
      const accordeeParDefaut = Math.min(quantiteProposee, Math.max(0, stockDistrict.get(medicamentId) ?? 0));
      lignes.push({
        medicamentId,
        stockInitial,
        recu,
        stockTotal: stockInitial + recu,
        consomme: saisie.consomme,
        stockRestant: restantSaisi ? (saisie.stockRestant as number) : null,
        pertes,
        transferts: transfert,
        stockDisponible,
        joursRupture: saisie.joursRupture,
        historique,
        cmm,
        quantiteProposee,
        quantiteValidee: quantiteModifiee ? (saisie.quantiteValidee as number) : accordeeParDefaut,
        quantiteModifiee,
      });
    }
    return { lignes, precedent };
  }

  /**
   * Consommations AJUSTÉES (C corrigée des jours de rupture) des mois précédents prises dans la CMM : rapports du
   * nouveau circuit des (moisCmm - 1) mois qui précèdent. Seuls les mois qui
   * ONT un rapport comptent (au début : 0, 1 ou 2 mois). Un produit absent
   * d'un de ces rapports y compte pour 0.
   * Renvoie { nbMois, parProduit: Map(medicamentId -> [C du mois -1, C du mois -2, ...]) }.
   */
  private async historiques(db: Db, rapport: { centreId: number; annee: number; mois: number }, moisCmm?: number) {
    const k = moisCmm ?? (await this.parametres(db)).moisCmm;
    const periodes = [];
    for (let i = 1; i < k; i++) periodes.push(deRang(rang(rapport.annee, rapport.mois) - i));
    if (periodes.length === 0) return { nbMois: 0, parProduit: new Map<number, number[]>() };

    const precedents = await db.rapportConsommation.findMany({
      where: { centreId: rapport.centreId, nouveauCircuit: true, OR: periodes.map((p) => ({ annee: p.annee, mois: p.mois })) },
      include: { lignes: { select: { medicamentId: true, quantite: true, joursRupture: true } } },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    });
    const parProduit = new Map<number, number[]>();
    const tousProduits = new Set(precedents.flatMap((p) => p.lignes.map((l) => l.medicamentId)));
    for (const medicamentId of tousProduits) {
      parProduit.set(
        medicamentId,
        precedents.map((p) => {
          const l = p.lignes.find((x) => x.medicamentId === medicamentId);
          return l ? consommationAjustee(l.quantite, l.joursRupture) : 0;
        }),
      );
    }
    return { nbMois: precedents.length, parProduit };
  }

  /** Dernier rapport (nouveau circuit) du centre AVANT ce mois. */
  private rapportPrecedent(db: Db, rapport: { id: number; centreId: number; annee: number; mois: number }) {
    return db.rapportConsommation.findFirst({
      where: {
        centreId: rapport.centreId,
        nouveauCircuit: true,
        id: { not: rapport.id },
        OR: [{ annee: { lt: rapport.annee } }, { annee: rapport.annee, mois: { lt: rapport.mois } }],
      },
      include: { lignes: true },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    });
  }

  /**
   * Peut-on valider ? Règles :
   *   - brouillon ;
   *   - le mois est terminé (à partir du 1er du mois suivant) ;
   *   - s'il existe un rapport précédent, c'est celui du mois M-1 et il est validé.
   */
  private async controleValidation(db: Db, rapport: { id: number; statut: string; centreId: number; annee: number; mois: number }) {
    if (rapport.statut !== SR.BROUILLON) return { ok: false, raison: 'Le rapport est déjà validé.' };
    const suivant = deRang(rang(rapport.annee, rapport.mois) + 1);
    if (aujourdhui() < new Date(Date.UTC(suivant.annee, suivant.mois - 1, 1))) {
      return { ok: false, raison: `Le mois n'est pas terminé : validation possible à partir du 1er ${libellePeriode(suivant.annee, suivant.mois)}.` };
    }
    const precedent = await this.rapportPrecedent(db, rapport);
    if (precedent) {
      const attendu = deRang(rang(rapport.annee, rapport.mois) - 1);
      if (precedent.annee !== attendu.annee || precedent.mois !== attendu.mois) {
        return { ok: false, raison: `Il manque le rapport de ${libellePeriode(attendu.annee, attendu.mois)} : ouvrez-le et validez-le d'abord.` };
      }
      if (precedent.statut !== SR.VALIDE) {
        return { ok: false, raison: `Validez d'abord le rapport de ${libellePeriode(attendu.annee, attendu.mois)} (${precedent.numero}).` };
      }
    }
    return { ok: true, raison: null };
  }

  /**
   * Date de la facture générée : dans le MOIS SUIVANT le rapport, pour
   * compter dans le « Reçu » du rapport suivant. Aujourd'hui si on est dans
   * ce mois-là, sinon le 1er de ce mois (rapport validé en retard).
   */
  private dateFacture(annee: number, mois: number) {
    const s = deRang(rang(annee, mois) + 1);
    const jour = aujourdhui();
    if (jour.getUTCFullYear() === s.annee && jour.getUTCMonth() + 1 === s.mois) return jour;
    return new Date(Date.UTC(s.annee, s.mois - 1, 1));
  }

  // ===========================================================================
  // OUTILS
  // ===========================================================================

  /**
   * Paramètres du rapport : N (mois de stock maximum), nombre de mois de la
   * CMM, et les informations affichées dans l'en-tête (fiche papier).
   */
  private async parametres(db: Db) {
    const cles = [
      PARAM_RAPPORT.MOIS_STOCK_MAX,
      PARAM_RAPPORT.MOIS_CMM,
      PARAM_RAPPORT.MOIS_STOCK_MIN,
      PARAM_RAPPORT.MOIS_POINT_COMMANDE_URGENTE,
      PARAM_RAPPORT.DELAI_REAPPRO_MOIS,
      'DISTRICT_REGION',
      'NOM_DISTRICT',
    ];
    const p = await db.parametre.findMany({ where: { cle: { in: cles } } });
    const texte = (cle: string) => p.find((x) => x.cle === cle)?.valeur ?? '';
    const lire = (cle: string, defaut: number) => {
      const v = Number(texte(cle).replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? v : defaut;
    };
    return {
      n: lire(PARAM_RAPPORT.MOIS_STOCK_MAX, 2),
      moisCmm: Math.round(lire(PARAM_RAPPORT.MOIS_CMM, 3)),
      moisStockMin: lire(PARAM_RAPPORT.MOIS_STOCK_MIN, 1),
      moisCommandeUrgente: lire(PARAM_RAPPORT.MOIS_POINT_COMMANDE_URGENTE, 0.5),
      delaiReappro: lire(PARAM_RAPPORT.DELAI_REAPPRO_MOIS, 1),
      region: texte('DISTRICT_REGION'),
      district: texte('NOM_DISTRICT'),
    };
  }

  /** Transferts du mois du centre (cédés et reçus), pour l'affichage. */
  private transfertsDuMois(centreId: number, annee: number, mois: number) {
    return this.prisma.transfertCentre.findMany({
      where: { annee, mois, OR: [{ centreSourceId: centreId }, { centreDestinationId: centreId }] },
      include: {
        centreSource: { select: { id: true, nom: true } },
        centreDestination: { select: { id: true, nom: true } },
        medicament: { select: { id: true, code: true, designation: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  /** Rapport du nouveau circuit, en brouillon (sinon erreur). */
  private async rapportBrouillon(id: number) {
    const rapport = await this.prisma.rapportConsommation.findUnique({ where: { id } });
    if (!rapport || !rapport.nouveauCircuit) throw new NotFoundException('Rapport centre introuvable.');
    if (rapport.statut !== SR.BROUILLON) throw new BadRequestException('Ce rapport est validé : il ne peut plus être modifié.');
    return rapport;
  }

  /** Refuse si le rapport (nouveau circuit) du centre pour ce mois est validé. */
  private async verifierRapportNonValide(centreId: number, annee: number, mois: number, nomCentre: string) {
    const r = await this.prisma.rapportConsommation.findUnique({ where: { centreId_annee_mois: { centreId, annee, mois } } });
    if (r?.nouveauCircuit && r.statut === SR.VALIDE) {
      throw new BadRequestException(`Le rapport de « ${nomCentre} » pour ${libellePeriode(annee, mois)} est déjà validé.`);
    }
  }

  /** Saisies reçues -> Map par produit (doublons refusés). */
  private lireSaisies(dto: EnregistrerRapportCentreDto) {
    const saisies = new Map<number, Saisie>();
    for (const l of dto.lignes) {
      if (saisies.has(l.medicamentId)) throw new BadRequestException('Un même produit apparaît plusieurs fois dans le rapport.');
      saisies.set(l.medicamentId, {
        consomme: l.consomme,
        stockRestant: l.stockRestant ?? null,
        joursRupture: l.joursRupture ?? 0,
        quantiteValidee: l.quantiteValidee ?? null,
      });
    }
    return saisies;
  }

  /** Mouvement du stock théorique d'un centre (quantité signée ; rien si 0). */
  private async mouvementCentre(
    tx: Db,
    rapport: { id: number; centreId: number },
    medicamentId: number,
    quantite: number,
    type: string,
    motif: string,
    utilisateurId: number,
  ) {
    if (quantite === 0) return;
    const centreId = rapport.centreId;
    const existant = await tx.stockCentre.findUnique({ where: { centreId_medicamentId: { centreId, medicamentId } } });
    const avant = existant?.quantiteTheorique ?? 0;
    await tx.stockCentre.upsert({
      where: { centreId_medicamentId: { centreId, medicamentId } },
      create: { centreId, medicamentId, quantiteTheorique: quantite },
      update: { quantiteTheorique: { increment: quantite } },
    });
    await tx.mouvementStockCentre.create({
      data: { type, centreId, medicamentId, quantite, stockAvant: avant, stockApres: avant + quantite, motif, sourceType: 'RAPPORT_CENTRE', sourceId: rapport.id, utilisateurId },
    });
  }
}

/** C des mois précédents d'un produit (0 pour chaque mois disponible où il n'apparaît pas). */
function historiqueDe(h: { nbMois: number; parProduit: Map<number, number[]> }, medicamentId: number) {
  return h.parProduit.get(medicamentId) ?? new Array<number>(h.nbMois).fill(0);
}

/** Ligne calculée -> ligne de la table (prix à 0 tant que le rapport n'est pas validé). */
function versLigneBase(l: LigneCalculee) {
  return {
    medicamentId: l.medicamentId,
    quantite: l.consomme,
    stockRestant: l.stockRestant,
    joursRupture: l.joursRupture,
    pertes: l.pertes,
    stockInitial: l.stockInitial,
    recu: l.recu,
    transferts: l.transferts,
    stockDisponible: l.stockDisponible,
    cmm: l.cmm,
    quantiteProposee: l.quantiteProposee,
    // null = suit la quantité proposée ; sinon valeur choisie par le district
    quantiteValidee: l.quantiteModifiee ? l.quantiteValidee : null,
    prixUnitaire: 0,
    montant: 0,
  };
}
