/**
 * =============================================================================
 * SERVICE DES RAPPORTS MENSUELS DE CONSOMMATION (module 06, CDC §3.5)
 * =============================================================================
 * Chaque mois, le centre transmet son rapport de consommation ; un agent du
 * district saisit les quantités DÉCLARÉES. Un seul rapport par centre et par mois.
 *
 *   BROUILLON ──soumettre──► SOUMIS ──valider──► VALIDE ──(facturation)──► FACTURE
 *       ▲                      │  │
 *       └──renvoyer (motif)────┘  └── vérification sur place (facultative,
 *                                     répétable tant que le rapport n'est pas validé)
 *
 * VALORISATION : chaque ligne est valorisée au PRIX DE VENTE applicable au
 *   centre au DERNIER JOUR DU MOIS déclaré (prix du centre, sinon prix général).
 *   Prix figé sur la ligne. Un CONSOMMABLE (coton, alcool...) vaut 0.
 *   Sans prix de vente, l'enregistrement est refusé.
 *
 * VÉRIFICATION SUR PLACE : l'agent du district se rend au centre et contrôle
 *   les quantités déclarées (registres, fiches de stock). Il saisit la
 *   QUANTITÉ VÉRIFIÉE par ligne (+ commentaire), la date et les agents présents.
 *   Quantité RETENUE = quantité vérifiée si elle est saisie, sinon déclarée.
 *
 * VALIDATION : dans UNE transaction, la quantité retenue de chaque ligne est
 *   DÉDUITE DU STOCK THÉORIQUE DU CENTRE (mouvement « CONSOMMATION »).
 *   Irréversible (une erreur se corrige par régularisation).
 *
 * Numéro automatique : RCM-2026-00001.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_RAPPORT, TYPE_COMPTEUR, TYPE_MOUVEMENT_CENTRE } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { PrixService } from '../parametrage/prix/prix.service';
import { LigneConsommationDto, ModifierRapportDto, VerifierRapportDto } from './consommations.dto';

const S = STATUT_RAPPORT;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « novembre 2026 » */
export function libellePeriode(annee: number, mois: number) {
  return `${MOIS[mois - 1]} ${annee}`;
}

function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

/** Quantité RETENUE d'une ligne : vérifiée sur place si saisie, sinon déclarée. */
export function quantiteRetenue(l: { quantite: number; quantiteVerifiee: number | null }) {
  return l.quantiteVerifiee ?? l.quantite;
}

const PERSONNE = { select: { id: true, nom: true, prenoms: true } };

const INCLURE_DETAIL = {
  centre: { include: { type: { select: { libelle: true } } } },
  utilisateur: PERSONNE,
  validateur: PERSONNE,
  verificateur: PERSONNE,
  facture: { select: { id: true, numero: true, statut: true } },
  lignes: {
    include: {
      medicament: {
        select: { id: true, code: true, designation: true, dosage: true, consommable: true, uniteVente: { select: { libelle: true } } },
      },
    },
    orderBy: { medicament: { designation: 'asc' } },
  },
} satisfies Prisma.RapportConsommationInclude;

interface FiltresRapports {
  centreId?: number;
  annee?: number;
  mois?: number;
  statut?: string;
}

@Injectable()
export class ConsommationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private prix: PrixService,
  ) {}

  // ===========================================================================
  // CONSULTATION
  // ===========================================================================

  async lister(filtres: FiltresRapports) {
    const rapports = await this.prisma.rapportConsommation.findMany({
      where: {
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.annee ? { annee: filtres.annee } : {}),
        ...(filtres.mois ? { mois: filtres.mois } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        nouveauCircuit: false, // anciens rapports seulement
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        _count: { select: { lignes: true } },
        lignes: { select: { quantite: true, quantiteVerifiee: true } },
      },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }, { centre: { nom: 'asc' } }],
    });
    // Résumé par rapport : vérifié ou non, nombre de lignes avec écart
    return rapports.map(({ lignes, ...r }) => ({
      ...r,
      verifie: !!r.dateVerification,
      lignesAvecEcart: lignes.filter((l) => l.quantiteVerifiee !== null && l.quantiteVerifiee !== l.quantite).length,
    }));
  }

  /** Un rapport complet, avec le stock théorique ACTUEL du centre pour chaque médicament. */
  async trouver(id: number) {
    const rapport = await this.prisma.rapportConsommation.findUnique({ where: { id }, include: INCLURE_DETAIL });
    if (!rapport) throw new NotFoundException('Rapport introuvable.');
    // Les rapports du NOUVEAU circuit se gèrent dans RapportsCentreService
    if (rapport.nouveauCircuit) throw new BadRequestException(`Le rapport ${rapport.numero} est un rapport centre (nouveau circuit) : ouvrez-le dans « Rapports centre ».`);
    const stocks = await this.prisma.stockCentre.findMany({
      where: { centreId: rapport.centreId, medicamentId: { in: rapport.lignes.map((l) => l.medicamentId) } },
    });
    return {
      ...rapport,
      lignes: rapport.lignes.map((l) => ({
        ...l,
        stockTheorique: stocks.find((s) => s.medicamentId === l.medicamentId)?.quantiteTheorique ?? 0,
      })),
    };
  }

  /** Stock théorique d'un centre (aide à la saisie : médicaments livrés au centre). */
  stockCentre(centreId: number) {
    return this.prisma.stockCentre.findMany({
      where: { centreId },
      include: { medicament: { select: { id: true, code: true, designation: true, actif: true } } },
      orderBy: { medicament: { designation: 'asc' } },
    });
  }

  /**
   * TABLEAU DE SUIVI d'une année : pour chaque centre actif, le rapport de
   * chaque mois (statut, montant) -> on voit tout de suite qui n'a pas déclaré.
   */
  async suivi(annee: number) {
    const [centres, rapports] = await Promise.all([
      this.prisma.centreSante.findMany({ where: { actif: true }, select: { id: true, code: true, nom: true }, orderBy: { nom: 'asc' } }),
      this.prisma.rapportConsommation.findMany({
        where: { annee },
        select: { id: true, numero: true, centreId: true, mois: true, statut: true, montantTotal: true, dateVerification: true },
      }),
    ]);
    return centres.map((centre) => ({
      centre,
      mois: Object.fromEntries(
        rapports.filter((r) => r.centreId === centre.id).map((r) => [r.mois, { ...r, verifie: !!r.dateVerification }]),
      ),
    }));
  }

  // ===========================================================================
  // SAISIE (BROUILLON)
  // ===========================================================================

  /** Modification d'un rapport EN BROUILLON (lignes remplacées, prix recalculés). */
  async modifier(id: number, dto: ModifierRapportDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seul un rapport en brouillon peut être modifié.');
    const centreId = dto.centreId ?? avant.centreId;
    const annee = dto.annee ?? avant.annee;
    const mois = dto.mois ?? avant.mois;
    if (centreId !== avant.centreId) await this.verifierCentre(centreId);
    this.verifierPeriode(annee, mois);
    if (centreId !== avant.centreId || annee !== avant.annee || mois !== avant.mois) await this.verifierUnicite(centreId, annee, mois);
    // Lignes envoyées, sinon lignes actuelles revalorisées (centre ou période changés)
    const demandes = dto.lignes ?? avant.lignes.map((l) => ({ medicamentId: l.medicamentId, quantite: l.quantite }));
    const lignes = await this.valoriser(demandes, centreId, annee, mois);

    await this.prisma.$transaction(async (tx) => {
      await tx.ligneConsommation.deleteMany({ where: { rapportId: id } });
      await tx.ligneConsommation.createMany({ data: lignes.map((l) => ({ ...l, rapportId: id })) });
      const apres = await tx.rapportConsommation.update({
        where: { id },
        data: {
          centreId,
          annee,
          mois,
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
          montantTotal: arrondi(lignes.reduce((t, l) => t + l.montant, 0)),
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'MODIFICATION', entite: 'RapportConsommation', entiteId: id, avant, apres: { ...apres, lignes } }, tx);
    });
    return this.trouver(id);
  }

  /** Suppression d'un BROUILLON (saisi par erreur). Un rapport soumis se renvoie en brouillon. */
  async supprimer(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seul un rapport en brouillon peut être supprimé.');
    await this.prisma.$transaction(async (tx) => {
      await tx.ligneConsommation.deleteMany({ where: { rapportId: id } });
      await tx.rapportConsommation.delete({ where: { id } });
      await this.audit.enregistrer({ utilisateurId, action: 'SUPPRESSION', entite: 'RapportConsommation', entiteId: id, avant }, tx);
    });
    return { supprime: true };
  }

  // ===========================================================================
  // CIRCUIT : SOUMETTRE, RENVOYER, VÉRIFIER, VALIDER
  // ===========================================================================

  async soumettre(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seul un rapport en brouillon peut être soumis.');
    if (avant.lignes.length === 0) throw new BadRequestException('Le rapport ne contient aucun médicament.');
    await this.changerStatut(id, utilisateurId, avant, { statut: S.SOUMIS, dateSoumission: new Date(), motifRenvoi: null }, 'SOUMISSION');
    return this.trouver(id);
  }

  /** Renvoi en brouillon d'un rapport soumis (erreur de saisie, rapport à corriger). */
  async renvoyer(id: number, motif: string, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.SOUMIS) throw new BadRequestException('Seul un rapport soumis peut être renvoyé en brouillon.');
    if (!motif?.trim()) throw new BadRequestException('Indiquez le motif du renvoi.');
    await this.changerStatut(id, utilisateurId, avant, { statut: S.BROUILLON, dateSoumission: null, motifRenvoi: motif.trim() }, 'RENVOI');
    return this.trouver(id);
  }

  /**
   * VÉRIFICATION SUR PLACE : quantités constatées dans le centre par l'agent
   * du district. Montant recalculé sur les quantités retenues.
   */
  async verifier(id: number, dto: VerifierRapportDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.SOUMIS) throw new BadRequestException('La vérification se fait sur un rapport soumis (non encore validé).');
    const saisies = new Map(dto.lignes.map((l) => [l.ligneId, l]));
    for (const ligneId of saisies.keys()) {
      if (!avant.lignes.some((l) => l.id === ligneId)) throw new BadRequestException('Ligne de rapport inconnue.');
    }
    const dateVerification = texteVersDate(dto.dateVerification);
    if (dateVerification > new Date()) throw new BadRequestException('La date de vérification ne peut pas être dans le futur.');

    await this.prisma.$transaction(async (tx) => {
      let montant = 0;
      for (const l of avant.lignes) {
        const saisie = saisies.get(l.id);
        const quantiteVerifiee = saisie ? (saisie.quantiteVerifiee ?? null) : l.quantiteVerifiee;
        const commentaire = saisie ? saisie.commentaire?.trim() || null : l.commentaire;
        const ligneMontant = arrondi(quantiteRetenue({ quantite: l.quantite, quantiteVerifiee }) * Number(l.prixUnitaire));
        montant += ligneMontant;
        await tx.ligneConsommation.update({ where: { id: l.id }, data: { quantiteVerifiee, commentaire, montant: ligneMontant } });
      }
      const apres = await tx.rapportConsommation.update({
        where: { id },
        data: {
          dateVerification,
          verifiePar: utilisateurId,
          agentsVerification: dto.agents?.trim() || null,
          observationsVerification: dto.observations?.trim() || null,
          montantTotal: arrondi(montant),
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'VERIFICATION', entite: 'RapportConsommation', entiteId: id, avant, apres: { ...apres, lignes: dto.lignes } }, tx);
    });
    return this.trouver(id);
  }

  /** VALIDATION : quantités retenues déduites du stock théorique du centre. */
  async valider(id: number, utilisateurId: number) {
    const rapport = await this.trouver(id);
    if (rapport.statut !== S.SOUMIS) throw new BadRequestException('Seul un rapport soumis peut être validé.');

    await this.prisma.$transaction(async (tx) => {
      for (const l of rapport.lignes) {
        const quantite = quantiteRetenue(l);
        if (quantite === 0) continue;
        const existant = await tx.stockCentre.findUnique({ where: { centreId_medicamentId: { centreId: rapport.centreId, medicamentId: l.medicamentId } } });
        const avant = existant?.quantiteTheorique ?? 0;
        await tx.stockCentre.upsert({
          where: { centreId_medicamentId: { centreId: rapport.centreId, medicamentId: l.medicamentId } },
          create: { centreId: rapport.centreId, medicamentId: l.medicamentId, quantiteTheorique: -quantite },
          update: { quantiteTheorique: { decrement: quantite } },
        });
        await tx.mouvementStockCentre.create({
          data: {
            type: TYPE_MOUVEMENT_CENTRE.CONSOMMATION,
            centreId: rapport.centreId,
            medicamentId: l.medicamentId,
            quantite: -quantite,
            stockAvant: avant,
            stockApres: avant - quantite,
            motif: `Consommation de ${libellePeriode(rapport.annee, rapport.mois)} (${rapport.numero})`,
            sourceType: 'RAPPORT_CONSOMMATION',
            sourceId: rapport.id,
            utilisateurId,
          },
        });
      }
      const montant = rapport.lignes.reduce((t, l) => t + quantiteRetenue(l) * Number(l.prixUnitaire), 0);
      const apres = await tx.rapportConsommation.update({
        where: { id },
        data: { statut: S.VALIDE, validePar: utilisateurId, dateValidation: new Date(), montantTotal: arrondi(montant) },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'VALIDATION', entite: 'RapportConsommation', entiteId: id, avant: { statut: rapport.statut }, apres }, tx);
    });
    return this.trouver(id);
  }

  // ===========================================================================
  // OUTILS
  // ===========================================================================

  private async changerStatut(id: number, utilisateurId: number, avant: unknown, data: Prisma.RapportConsommationUpdateInput, action: string) {
    await this.prisma.$transaction(async (tx) => {
      const apres = await tx.rapportConsommation.update({ where: { id }, data });
      await this.audit.enregistrer({ utilisateurId, action, entite: 'RapportConsommation', entiteId: id, avant, apres }, tx);
    });
  }

  /**
   * Prix de chaque ligne : prix de vente applicable au centre au DERNIER JOUR
   * du mois déclaré (0 pour un consommable). Refus si un prix manque.
   */
  private async valoriser(demandes: LigneConsommationDto[], centreId: number, annee: number, mois: number) {
    const ids = demandes.map((d) => d.medicamentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Un même médicament apparaît plusieurs fois : regroupez les quantités sur une seule ligne.');
    }
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: ids } } });
    const finDuMois = new Date(Date.UTC(annee, mois, 0)); // jour 0 du mois suivant = dernier jour du mois
    const sansPrix: string[] = [];
    const lignes: { medicamentId: number; quantite: number; prixUnitaire: number; montant: number }[] = [];
    for (const d of demandes) {
      const med = medicaments.find((m) => m.id === d.medicamentId);
      if (!med) throw new NotFoundException('Médicament introuvable.');
      let prix = 0;
      if (!med.consommable) {
        const applicable = await this.prix.prixVenteApplicable(med.id, centreId, finDuMois);
        if (applicable === null || applicable === undefined) {
          sansPrix.push(med.designation);
          continue;
        }
        prix = Number(applicable);
      }
      lignes.push({ medicamentId: med.id, quantite: d.quantite, prixUnitaire: prix, montant: arrondi(d.quantite * prix) });
    }
    if (sansPrix.length) {
      throw new BadRequestException(
        `Pas de prix de vente applicable en ${libellePeriode(annee, mois)} pour : ${sansPrix.join(', ')}. Définissez-le dans Paramétrage > Prix.`,
      );
    }
    return lignes;
  }

  private async verifierCentre(centreId: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    if (!centre.actif) throw new BadRequestException(`Le centre « ${centre.nom} » est désactivé.`);
  }

  /** Pas de rapport pour un mois futur. */
  private verifierPeriode(annee: number, mois: number) {
    const maintenant = new Date();
    if (annee * 12 + mois > maintenant.getFullYear() * 12 + maintenant.getMonth() + 1) {
      throw new BadRequestException(`Impossible de déclarer la consommation d'un mois futur (${libellePeriode(annee, mois)}).`);
    }
  }

  /** Un seul rapport par centre et par mois. */
  private async verifierUnicite(centreId: number, annee: number, mois: number) {
    const existant = await this.prisma.rapportConsommation.findUnique({ where: { centreId_annee_mois: { centreId, annee, mois } } });
    if (existant) {
      throw new BadRequestException(`Ce centre a déjà un rapport pour ${libellePeriode(annee, mois)} (${existant.numero}) : ouvrez-le pour le compléter.`);
    }
  }
}
