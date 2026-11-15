/**
 * =============================================================================
 * SERVICE DES PAIEMENTS, AVANCES ET COMPTES DES CENTRES (module 07, §3.6)
 * =============================================================================
 * PAIEMENT : argent reçu d'un centre (date, montant, mode, référence).
 *   Il est IMPUTÉ (réparti) sur une ou plusieurs factures non soldées du centre.
 *   La part non imputée devient une AVANCE (montantNonImpute), utilisable
 *   plus tard sur une nouvelle facture (« imputer »).
 *   Type : PAIEMENT (au moins une imputation) ou AVANCE (aucune imputation).
 *   Numéro du REÇU automatique : REC-2026-00001.
 *
 * ANNULATION (motif obligatoire) : le paiement reste dans l'historique
 *   (annule = vrai), ses imputations sont retirées et les factures recalculées.
 *
 * COMPTE D'UN CENTRE :
 *   - SITUATION : total facturé, payé, solde restant dû, avances disponibles,
 *     factures en retard ;
 *   - RELEVÉ : opérations d'une période (factures au débit, paiements au
 *     crédit) avec le solde progressif, à partir du solde au début de période.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_FACTURE as SF, TYPE_COMPTEUR, TYPE_PAIEMENT } from '../common/constants';
import { aujourdhui, texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { CreerPaiementDto, ImputationDto } from './facturation.dto';
import { arrondi, recalculerFacture } from './factures.service';

const PERSONNE = { select: { id: true, nom: true, prenoms: true } };

interface FiltresPaiements {
  centreId?: number;
  du?: string;
  au?: string;
  mode?: string;
  avecAvance?: boolean;
}

@Injectable()
export class PaiementsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ===========================================================================
  // CONSULTATION
  // ===========================================================================

  lister(filtres: FiltresPaiements) {
    return this.prisma.paiement.findMany({
      where: {
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.mode ? { mode: filtres.mode } : {}),
        ...(filtres.avecAvance ? { annule: false, montantNonImpute: { gt: 0 } } : {}),
        ...(filtres.du || filtres.au
          ? { datePaiement: { ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}), ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}) } }
          : {}),
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        imputations: { select: { montant: true, facture: { select: { numero: true } } } },
      },
      orderBy: [{ datePaiement: 'desc' }, { id: 'desc' }],
    });
  }

  async trouver(id: number) {
    const paiement = await this.prisma.paiement.findUnique({
      where: { id },
      include: {
        centre: { include: { type: { select: { libelle: true } } } },
        utilisateur: PERSONNE,
        imputations: {
          include: { facture: { select: { id: true, numero: true, dateEmission: true, montantTotal: true, montantPaye: true, statut: true } } },
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!paiement) throw new NotFoundException('Paiement introuvable.');
    const annulateur = paiement.annulePar
      ? await this.prisma.utilisateur.findUnique({ where: { id: paiement.annulePar }, select: { nom: true, prenoms: true } })
      : null;
    return { ...paiement, annulateur };
  }

  /** Factures NON SOLDÉES d'un centre (les plus anciennes d'abord) : pour répartir un paiement. */
  async facturesNonSoldees(centreId: number) {
    const factures = await this.prisma.facture.findMany({
      where: { centreId, statut: { in: [SF.EMISE, SF.PARTIELLEMENT_PAYEE] } },
      include: { rapport: { select: { annee: true, mois: true } } },
      orderBy: [{ dateEcheance: 'asc' }, { dateEmission: 'asc' }, { id: 'asc' }],
    });
    const jour = aujourdhui();
    return factures.map((f) => {
      const solde = arrondi(Number(f.montantTotal) - Number(f.montantPaye));
      return { ...f, solde, enRetard: solde > 0 && !!f.dateEcheance && f.dateEcheance < jour };
    });
  }

  // ===========================================================================
  // ENREGISTREMENT, IMPUTATION, ANNULATION
  // ===========================================================================

  async creer(dto: CreerPaiementDto, utilisateurId: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: dto.centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    const datePaiement = texteVersDate(dto.datePaiement);
    if (datePaiement > aujourdhui()) throw new BadRequestException('La date du paiement ne peut pas être dans le futur.');
    const montant = arrondi(dto.montant);
    const imputations = this.regrouper(dto.imputations ?? []);
    const totalImpute = arrondi(imputations.reduce((t, i) => t + i.montant, 0));
    if (totalImpute > montant) {
      throw new BadRequestException(`Le total réparti sur les factures (${totalImpute}) dépasse le montant reçu (${montant}).`);
    }

    const id = await this.prisma.$transaction(async (tx) => {
      await this.verifierImputations(tx, imputations, dto.centreId);
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.RECU, datePaiement);
      const paiement = await tx.paiement.create({
        data: {
          numero,
          centreId: dto.centreId,
          datePaiement,
          montant,
          montantNonImpute: arrondi(montant - totalImpute),
          type: imputations.length ? TYPE_PAIEMENT.PAIEMENT : TYPE_PAIEMENT.AVANCE,
          mode: dto.mode,
          reference: dto.reference?.trim() || null,
          observations: dto.observations?.trim() || null,
          utilisateurId,
        },
      });
      for (const i of imputations) {
        await tx.imputation.create({ data: { paiementId: paiement.id, factureId: i.factureId, montant: i.montant } });
        await recalculerFacture(tx, i.factureId);
      }
      await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'Paiement', entiteId: paiement.id, apres: { ...paiement, imputations } }, tx);
      return paiement.id;
    });
    return this.trouver(id);
  }

  /** Impute le montant NON IMPUTÉ (avance) d'un paiement sur des factures du même centre. */
  async imputer(id: number, demandes: ImputationDto[], utilisateurId: number) {
    const paiement = await this.trouver(id);
    if (paiement.annule) throw new BadRequestException('Ce paiement est annulé.');
    const imputations = this.regrouper(demandes);
    const total = arrondi(imputations.reduce((t, i) => t + i.montant, 0));
    const disponible = Number(paiement.montantNonImpute);
    if (total > disponible) throw new BadRequestException(`Montant à imputer (${total}) supérieur à l'avance disponible (${disponible}).`);

    await this.prisma.$transaction(async (tx) => {
      await this.verifierImputations(tx, imputations, paiement.centreId);
      for (const i of imputations) {
        await tx.imputation.create({ data: { paiementId: id, factureId: i.factureId, montant: i.montant } });
        await recalculerFacture(tx, i.factureId);
      }
      const apres = await tx.paiement.update({
        where: { id },
        data: { montantNonImpute: arrondi(disponible - total), type: TYPE_PAIEMENT.PAIEMENT },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'IMPUTATION', entite: 'Paiement', entiteId: id, avant: paiement, apres: { ...apres, imputations } }, tx);
    });
    return this.trouver(id);
  }

  /**
   * Impute automatiquement les AVANCES disponibles d'un centre sur une facture
   * (les plus anciennes avances d'abord), dans la limite du solde de la facture.
   */
  async imputerAvancesSurFacture(factureId: number, utilisateurId: number) {
    const facture = await this.prisma.facture.findUnique({ where: { id: factureId } });
    if (!facture) throw new NotFoundException('Facture introuvable.');
    if (facture.statut !== SF.EMISE && facture.statut !== SF.PARTIELLEMENT_PAYEE) throw new BadRequestException("Cette facture n'a plus rien à payer.");
    let reste = arrondi(Number(facture.montantTotal) - Number(facture.montantPaye));
    const avances = await this.prisma.paiement.findMany({
      where: { centreId: facture.centreId, annule: false, montantNonImpute: { gt: 0 } },
      orderBy: [{ datePaiement: 'asc' }, { id: 'asc' }],
    });
    if (avances.length === 0) throw new BadRequestException("Ce centre n'a aucune avance disponible.");
    let impute = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const a of avances) {
        if (reste <= 0) break;
        const part = arrondi(Math.min(reste, Number(a.montantNonImpute)));
        await tx.imputation.create({ data: { paiementId: a.id, factureId, montant: part } });
        await tx.paiement.update({ where: { id: a.id }, data: { montantNonImpute: arrondi(Number(a.montantNonImpute) - part), type: TYPE_PAIEMENT.PAIEMENT } });
        reste = arrondi(reste - part);
        impute = arrondi(impute + part);
      }
      await recalculerFacture(tx, factureId);
      await this.audit.enregistrer({ utilisateurId, action: 'IMPUTATION_AVANCES', entite: 'Facture', entiteId: factureId, apres: { montantImpute: impute } }, tx);
    });
    return { montantImpute: impute };
  }

  async annuler(id: number, motif: string, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.annule) throw new BadRequestException('Ce paiement est déjà annulé.');
    if (!motif?.trim()) throw new BadRequestException("Indiquez le motif de l'annulation.");
    const factures = [...new Set(avant.imputations.map((i) => i.factureId))];
    await this.prisma.$transaction(async (tx) => {
      // Les imputations sont retirées (elles restent dans le journal d'audit)
      await tx.imputation.deleteMany({ where: { paiementId: id } });
      const apres = await tx.paiement.update({
        where: { id },
        data: { annule: true, montantNonImpute: 0, motifAnnulation: motif.trim(), annulePar: utilisateurId, dateAnnulation: new Date() },
      });
      for (const f of factures) await recalculerFacture(tx, f);
      await this.audit.enregistrer({ utilisateurId, action: 'ANNULATION', entite: 'Paiement', entiteId: id, avant, apres }, tx);
    });
    return this.trouver(id);
  }

  // ===========================================================================
  // COMPTES DES CENTRES
  // ===========================================================================

  /** Situation financière de chaque centre (ou d'un seul). */
  async situation(centreId?: number) {
    const jour = aujourdhui();
    const [centres, factures, paiements] = await Promise.all([
      this.prisma.centreSante.findMany({
        where: centreId ? { id: centreId } : {},
        select: { id: true, code: true, nom: true, actif: true, responsable: true, telephone: true },
        orderBy: { nom: 'asc' },
      }),
      this.prisma.facture.findMany({
        where: { statut: { not: SF.ANNULEE }, ...(centreId ? { centreId } : {}) },
        select: { centreId: true, montantTotal: true, montantPaye: true, dateEcheance: true, dateEmission: true },
      }),
      this.prisma.paiement.findMany({
        where: { annule: false, ...(centreId ? { centreId } : {}) },
        select: { centreId: true, montant: true, montantNonImpute: true, datePaiement: true },
      }),
    ]);
    return centres
      .map((c) => {
        const fc = factures.filter((f) => f.centreId === c.id);
        const pc = paiements.filter((p) => p.centreId === c.id);
        const totalFacture = arrondi(fc.reduce((t, f) => t + Number(f.montantTotal), 0));
        const totalPaye = arrondi(fc.reduce((t, f) => t + Number(f.montantPaye), 0));
        const soldeDu = arrondi(totalFacture - totalPaye);
        const enRetard = fc.filter((f) => Number(f.montantTotal) > Number(f.montantPaye) && f.dateEcheance && f.dateEcheance < jour);
        return {
          centre: c,
          totalFacture,
          totalPaye,
          soldeDu,
          avances: arrondi(pc.reduce((t, p) => t + Number(p.montantNonImpute), 0)),
          totalEncaisse: arrondi(pc.reduce((t, p) => t + Number(p.montant), 0)),
          facturesNonSoldees: fc.filter((f) => Number(f.montantTotal) > Number(f.montantPaye)).length,
          facturesEnRetard: enRetard.length,
          montantEnRetard: arrondi(enRetard.reduce((t, f) => t + Number(f.montantTotal) - Number(f.montantPaye), 0)),
          derniereFacture: fc.reduce<Date | null>((d, f) => (!d || f.dateEmission > d ? f.dateEmission : d), null),
          dernierPaiement: pc.reduce<Date | null>((d, p) => (!d || p.datePaiement > d ? p.datePaiement : d), null),
        };
      })
      // Centres sans aucune opération affichés seulement s'ils sont actifs
      .filter((s) => s.centre.actif || s.totalFacture > 0 || s.totalEncaisse > 0);
  }

  /**
   * RELEVÉ DE COMPTE d'un centre sur une période : factures (débit) et
   * paiements (crédit) dans l'ordre des dates, avec le solde progressif.
   * Solde positif = le centre doit de l'argent ; négatif = avance en sa faveur.
   */
  async releve(centreId: number, duTexte?: string, auTexte?: string) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: centreId }, include: { type: { select: { libelle: true } } } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    const du = duTexte ? texteVersDate(duTexte) : null;
    const au = auTexte ? texteVersDate(auTexte) : aujourdhui();

    const [factures, paiements] = await Promise.all([
      this.prisma.facture.findMany({
        where: { centreId, statut: { not: SF.ANNULEE }, dateEmission: { lte: au } },
        include: { rapport: { select: { annee: true, mois: true } } },
      }),
      this.prisma.paiement.findMany({ where: { centreId, annule: false, datePaiement: { lte: au } } }),
    ]);
    const operations = [
      ...factures.map((f) => ({
        date: f.dateEmission,
        type: 'FACTURE' as const,
        numero: f.numero,
        libelle: f.rapport ? `Facture consommation ${String(f.rapport.mois).padStart(2, '0')}/${f.rapport.annee}` : 'Facture',
        debit: Number(f.montantTotal),
        credit: 0,
        id: f.id,
      })),
      ...paiements.map((p) => ({
        date: p.datePaiement,
        type: p.type as 'PAIEMENT' | 'AVANCE',
        numero: p.numero,
        libelle: `${p.type === TYPE_PAIEMENT.AVANCE ? 'Avance' : 'Paiement'} (${p.mode.toLowerCase().replace('_', ' ')}${p.reference ? ` n° ${p.reference}` : ''})`,
        debit: 0,
        credit: Number(p.montant),
        id: p.id,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.type === 'FACTURE' ? -1 : 1));

    // Solde au début de la période (opérations antérieures)
    const avant = du ? operations.filter((o) => o.date < du) : [];
    const soldeInitial = arrondi(avant.reduce((t, o) => t + o.debit - o.credit, 0));
    let solde = soldeInitial;
    const lignes = (du ? operations.filter((o) => o.date >= du) : operations).map((o) => {
      solde = arrondi(solde + o.debit - o.credit);
      return { ...o, solde };
    });
    return {
      centre,
      du,
      au,
      soldeInitial,
      totalDebit: arrondi(lignes.reduce((t, l) => t + l.debit, 0)),
      totalCredit: arrondi(lignes.reduce((t, l) => t + l.credit, 0)),
      soldeFinal: solde,
      lignes,
      situation: (await this.situation(centreId))[0] ?? null,
    };
  }

  // ===========================================================================
  // OUTILS
  // ===========================================================================

  /** Regroupe les imputations par facture (montants arrondis). */
  private regrouper(imputations: ImputationDto[]) {
    const parFacture = new Map<number, number>();
    for (const i of imputations) parFacture.set(i.factureId, arrondi((parFacture.get(i.factureId) ?? 0) + i.montant));
    return [...parFacture].map(([factureId, montant]) => ({ factureId, montant })).filter((i) => i.montant > 0);
  }

  /** Chaque facture : du même centre, non annulée, montant imputé ≤ solde restant. */
  private async verifierImputations(tx: Prisma.TransactionClient, imputations: { factureId: number; montant: number }[], centreId: number) {
    for (const i of imputations) {
      const f = await tx.facture.findUnique({ where: { id: i.factureId } });
      if (!f) throw new NotFoundException('Facture introuvable.');
      if (f.centreId !== centreId) throw new BadRequestException(`La facture ${f.numero} n'appartient pas à ce centre.`);
      if (f.statut === SF.ANNULEE) throw new BadRequestException(`La facture ${f.numero} est annulée.`);
      const solde = arrondi(Number(f.montantTotal) - Number(f.montantPaye));
      if (i.montant > solde) throw new BadRequestException(`Facture ${f.numero} : ${i.montant} imputé pour un solde de ${solde}.`);
    }
  }
}
