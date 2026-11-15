/**
 * =============================================================================
 * SERVICE DES FACTURES (module 07, cahier des charges §3.6)
 * =============================================================================
 * GÉNÉRATION : une facture par RAPPORT DE CONSOMMATION VALIDÉ.
 *   - lignes = lignes du rapport facturables (quantité RETENUE > 0 et prix > 0 :
 *     les consommables à 0 ne sont pas facturés) ; prix repris du rapport ;
 *   - échéance = date d'émission + paramètre DELAI_PAIEMENT_JOURS (30 j) ;
 *   - le rapport passe au statut FACTURE.
 *   Numéro automatique : FAC-2026-00001.
 *
 * STATUT (calculé à partir des paiements imputés) :
 *   EMISE -> PARTIELLEMENT_PAYEE -> PAYEE ; ANNULEE.
 *
 * ANNULATION (motif obligatoire) : seulement si AUCUN paiement n'est imputé.
 *   Le rapport redevient VALIDE (il peut être refacturé) ; la facture annulée
 *   reste dans l'historique (rapport d'origine conservé dans rapportOrigineId).
 *   Facture d'ÉCART DE SUPERVISION annulée : la décision de la supervision
 *   devient « régularisation du stock » (le stock a déjà été aligné).
 *
 * Les factures d'écart de supervision (type ECART_SUPERVISION) sont créées
 * par le module Supervisions (décision « facturation »).
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_FACTURE as SF, STATUT_RAPPORT as SR, TYPE_COMPTEUR, TYPE_FACTURE } from '../common/constants';
import { aujourdhui, texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';

/** Arrondi au centime. */
export function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

/** Quantité retenue d'une ligne de rapport : vérifiée sur place, sinon déclarée. */
function quantiteRetenue(l: { quantite: number; quantiteVerifiee: number | null }) {
  return l.quantiteVerifiee ?? l.quantite;
}

/**
 * Recalcule le MONTANT PAYÉ et le STATUT d'une facture à partir de ses
 * imputations (paiements non annulés). À appeler après toute imputation.
 */
export async function recalculerFacture(tx: Prisma.TransactionClient, factureId: number) {
  const facture = await tx.facture.findUniqueOrThrow({ where: { id: factureId } });
  if (facture.statut === SF.ANNULEE) return facture;
  const imputations = await tx.imputation.findMany({ where: { factureId, paiement: { annule: false } } });
  const paye = arrondi(imputations.reduce((t, i) => t + Number(i.montant), 0));
  const total = Number(facture.montantTotal);
  const statut = paye <= 0 ? SF.EMISE : paye >= total ? SF.PAYEE : SF.PARTIELLEMENT_PAYEE;
  return tx.facture.update({ where: { id: factureId }, data: { montantPaye: paye, statut } });
}

const PERSONNE = { select: { id: true, nom: true, prenoms: true } };

interface FiltresFactures {
  centreId?: number;
  statut?: string;
  du?: string;
  au?: string;
  nonSoldees?: boolean;
}

@Injectable()
export class FacturesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ===========================================================================
  // CONSULTATION
  // ===========================================================================

  async lister(filtres: FiltresFactures) {
    const factures = await this.prisma.facture.findMany({
      where: {
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        ...(filtres.nonSoldees ? { statut: { in: [SF.EMISE, SF.PARTIELLEMENT_PAYEE] } } : {}),
        ...(filtres.du || filtres.au
          ? { dateEmission: { ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}), ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}) } }
          : {}),
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        rapport: { select: { id: true, numero: true, annee: true, mois: true } },
        supervision: { select: { id: true, numero: true, dateSupervision: true } },
      },
      orderBy: [{ dateEmission: 'desc' }, { id: 'desc' }],
    });
    const jour = aujourdhui();
    return factures.map((f) => {
      const solde = f.statut === SF.ANNULEE ? 0 : arrondi(Number(f.montantTotal) - Number(f.montantPaye));
      return { ...f, solde, enRetard: solde > 0 && !!f.dateEcheance && f.dateEcheance < jour };
    });
  }

  async trouver(id: number) {
    const facture = await this.prisma.facture.findUnique({
      where: { id },
      include: {
        centre: { include: { type: { select: { libelle: true } } } },
        rapport: { select: { id: true, numero: true, annee: true, mois: true, dateVerification: true } },
        supervision: { select: { id: true, numero: true, dateSupervision: true } },
        utilisateur: PERSONNE,
        lignes: {
          include: { medicament: { select: { code: true, designation: true, uniteVente: { select: { libelle: true } } } } },
          orderBy: { medicament: { designation: 'asc' } },
        },
        imputations: {
          where: { paiement: { annule: false } },
          include: { paiement: { select: { id: true, numero: true, datePaiement: true, mode: true, reference: true, type: true } } },
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!facture) throw new NotFoundException('Facture introuvable.');
    // Rapport d'origine d'une facture annulée + auteur de l'annulation
    const [rapportOrigine, supervisionOrigine, annulateur] = await Promise.all([
      facture.rapportOrigineId
        ? this.prisma.rapportConsommation.findUnique({ where: { id: facture.rapportOrigineId }, select: { id: true, numero: true, annee: true, mois: true } })
        : null,
      facture.supervisionOrigineId
        ? this.prisma.supervision.findUnique({ where: { id: facture.supervisionOrigineId }, select: { id: true, numero: true, dateSupervision: true } })
        : null,
      facture.annulePar ? this.prisma.utilisateur.findUnique({ where: { id: facture.annulePar }, select: { nom: true, prenoms: true } }) : null,
    ]);
    // Avances disponibles du centre (pour les imputer sur cette facture)
    const avances = await this.prisma.paiement.aggregate({
      where: { centreId: facture.centreId, annule: false, montantNonImpute: { gt: 0 } },
      _sum: { montantNonImpute: true },
    });
    const solde = facture.statut === SF.ANNULEE ? 0 : arrondi(Number(facture.montantTotal) - Number(facture.montantPaye));
    return {
      ...facture,
      rapport: facture.rapport ?? rapportOrigine,
      supervision: facture.supervision ?? supervisionOrigine,
      annulateur,
      solde,
      enRetard: solde > 0 && !!facture.dateEcheance && facture.dateEcheance < aujourdhui(),
      avancesDisponibles: Number(avances._sum.montantNonImpute ?? 0),
    };
  }

  /** Rapports de consommation VALIDÉS pas encore facturés. */
  aFacturer() {
    return this.prisma.rapportConsommation.findMany({
      where: { statut: SR.VALIDE, facture: { is: null } },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }, { centre: { nom: 'asc' } }],
    });
  }

  // ===========================================================================
  // GÉNÉRATION
  // ===========================================================================

  /** Génère une facture par rapport validé. Renvoie les factures créées. */
  async generer(rapportIds: number[], dateTexte: string | undefined, utilisateurId: number) {
    const dateEmission = dateTexte ? texteVersDate(dateTexte) : aujourdhui();
    if (dateEmission > aujourdhui()) throw new BadRequestException("La date d'émission ne peut pas être dans le futur.");
    const delai = await this.delaiPaiement();
    const dateEcheance = new Date(dateEmission);
    dateEcheance.setUTCDate(dateEcheance.getUTCDate() + delai);

    const rapports = await this.prisma.rapportConsommation.findMany({
      where: { id: { in: rapportIds } },
      include: { lignes: true, facture: { select: { numero: true } } },
    });
    for (const id of rapportIds) {
      const r = rapports.find((x) => x.id === id);
      if (!r) throw new NotFoundException('Rapport introuvable.');
      if (r.facture) throw new BadRequestException(`Le rapport ${r.numero} est déjà facturé (${r.facture.numero}).`);
      if (r.statut !== SR.VALIDE) throw new BadRequestException(`Le rapport ${r.numero} n'est pas validé : il ne peut pas être facturé.`);
    }

    const creees: number[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const r of rapports) {
        // Lignes facturables : quantité retenue > 0 et prix > 0
        const lignes = r.lignes
          .map((l) => ({ medicamentId: l.medicamentId, quantite: quantiteRetenue(l), prixUnitaire: Number(l.prixUnitaire) }))
          .filter((l) => l.quantite > 0 && l.prixUnitaire > 0)
          .map((l) => ({ ...l, montant: arrondi(l.quantite * l.prixUnitaire) }));
        if (lignes.length === 0) {
          throw new BadRequestException(`Le rapport ${r.numero} n'a rien à facturer (aucune quantité ou uniquement des consommables).`);
        }
        const numero = await prochainNumero(tx, TYPE_COMPTEUR.FACTURE, dateEmission);
        const facture = await tx.facture.create({
          data: {
            numero,
            type: TYPE_FACTURE.CONSOMMATION,
            centreId: r.centreId,
            rapportId: r.id,
            dateEmission,
            dateEcheance,
            montantTotal: arrondi(lignes.reduce((t, l) => t + l.montant, 0)),
            statut: SF.EMISE,
            utilisateurId,
            lignes: { create: lignes },
          },
        });
        await tx.rapportConsommation.update({ where: { id: r.id }, data: { statut: SR.FACTURE } });
        await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'Facture', entiteId: facture.id, apres: { ...facture, lignes } }, tx);
        creees.push(facture.id);
      }
    });
    return this.prisma.facture.findMany({ where: { id: { in: creees } }, select: { id: true, numero: true, montantTotal: true } });
  }

  // ===========================================================================
  // ANNULATION
  // ===========================================================================

  async annuler(id: number, motif: string, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut === SF.ANNULEE) throw new BadRequestException('Cette facture est déjà annulée.');
    if (avant.imputations.length > 0) {
      throw new BadRequestException("Des paiements sont imputés sur cette facture : annulez d'abord ces paiements.");
    }
    if (!motif?.trim()) throw new BadRequestException("Indiquez le motif de l'annulation.");
    await this.prisma.$transaction(async (tx) => {
      const apres = await tx.facture.update({
        where: { id },
        data: {
          statut: SF.ANNULEE,
          motifAnnulation: motif.trim(),
          annulePar: utilisateurId,
          dateAnnulation: new Date(),
          // Le rapport est libéré (refacturable) mais reste mémorisé
          rapportId: null,
          rapportOrigineId: avant.rapportId,
          supervisionId: null,
          supervisionOrigineId: avant.supervisionId,
        },
      });
      if (avant.rapportId) await tx.rapportConsommation.update({ where: { id: avant.rapportId }, data: { statut: SR.VALIDE } });
      // Facture d'écart de supervision : le stock reste régularisé, la décision change
      if (avant.supervisionId) {
        const sup = await tx.supervision.findUniqueOrThrow({ where: { id: avant.supervisionId } });
        await tx.supervision.update({
          where: { id: avant.supervisionId },
          data: {
            decision: 'REGULARISATION_STOCK',
            motifDecision: `${sup.motifDecision ?? ''}\n[Facture ${avant.numero} annulée le ${new Date().toLocaleDateString('fr-FR')} : ${motif.trim()}]`.trim(),
          },
        });
      }
      await this.audit.enregistrer({ utilisateurId, action: 'ANNULATION', entite: 'Facture', entiteId: id, avant, apres }, tx);
    });
    return this.trouver(id);
  }

  private async delaiPaiement() {
    const p = await this.prisma.parametre.findUnique({ where: { cle: 'DELAI_PAIEMENT_JOURS' } });
    const jours = Number(p?.valeur);
    return Number.isFinite(jours) && jours >= 0 ? Math.round(jours) : 30;
  }
}
