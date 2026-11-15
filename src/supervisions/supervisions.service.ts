/**
 * =============================================================================
 * SERVICE DES SUPERVISIONS ET INVENTAIRES DANS LES CENTRES (module 08, §3.7)
 * =============================================================================
 * Le cahier des charges impose de DISTINGUER le constat d'un écart, sa
 * validation et son éventuelle facturation : un écart ne crée JAMAIS de dette
 * automatiquement.
 *
 *   1. CONSTAT     BROUILLON ──soumettre──► SOUMISE   (renvoi possible, motif)
 *        fiche : centre, date, agents présents ; pour chaque médicament :
 *        stock THÉORIQUE du centre À LA DATE DU CONTRÔLE (calculé), stock
 *        PHYSIQUE constaté (lot facultatif), ÉCART = physique − théorique,
 *        VALEUR de l'écart (prix selon le paramètre VALORISATION_ECARTS :
 *        prix de vente applicable au centre, ou prix d'achat ; consommable = 0).
 *   2. VALIDATION  SOUMISE ──valider──► VALIDEE  (personne habilitée)
 *        le constat est confirmé ; rien ne change encore (ni stock, ni dette).
 *   3. DÉCISION    VALIDEE ──décider──► CLOTUREE  (motif obligatoire)
 *        - AUCUNE               : aucune suite (ex. erreur de comptage) ;
 *        - REGULARISATION_STOCK : stock théorique du centre aligné sur le
 *                                 physique (mouvements « ECART_SUPERVISION ») ;
 *        - FACTURATION          : idem + FACTURE des MANQUANTS (écarts négatifs
 *                                 valorisés) -> montant complémentaire à payer.
 *
 * Numéro automatique : SUP-2026-00001.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DECISION_SUPERVISION as D,
  STATUT_FACTURE,
  STATUT_PIECE,
  STATUT_SUPERVISION as S,
  TYPE_COMPTEUR,
  TYPE_FACTURE,
  TYPE_MOUVEMENT_CENTRE,
} from '../common/constants';
import { aujourdhui, texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { PrixService } from '../parametrage/prix/prix.service';
import { CreerSupervisionDto, LigneSupervisionDto, ModifierSupervisionDto } from './supervisions.dto';

function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

/** Lendemain d'une date (minuit UTC) : borne « fin de journée » du contrôle. */
function lendemain(date: Date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

const PERSONNE = { select: { id: true, nom: true, prenoms: true } };

/** Ligne de supervision calculée (avant enregistrement). */
interface LigneCalculee {
  medicamentId: number;
  lotId: number | null;
  stockTheorique: number;
  stockPhysique: number;
  ecart: number;
  prixUnitaire: number | null; // null = pas de prix trouvé (écart non valorisé)
  valeurEcart: number | null;
  commentaire: string | null;
}

interface FiltresSupervisions {
  centreId?: number;
  statut?: string;
  du?: string;
  au?: string;
}

@Injectable()
export class SupervisionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private prix: PrixService,
  ) {}

  // ===========================================================================
  // CONSULTATION
  // ===========================================================================

  async lister(filtres: FiltresSupervisions) {
    const supervisions = await this.prisma.supervision.findMany({
      where: {
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        ...(filtres.du || filtres.au
          ? { dateSupervision: { ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}), ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}) } }
          : {}),
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        agents: { select: { nom: true } },
        lignes: { select: { ecart: true, valeurEcart: true } },
        facture: { select: { id: true, numero: true, statut: true } },
      },
      orderBy: [{ dateSupervision: 'desc' }, { id: 'desc' }],
    });
    return supervisions.map(({ lignes, ...s }) => ({ ...s, nombreLignes: lignes.length, ...this.resumeEcarts(lignes) }));
  }

  async trouver(id: number) {
    const s = await this.prisma.supervision.findUnique({
      where: { id },
      include: {
        centre: { include: { type: { select: { libelle: true } } } },
        utilisateur: PERSONNE,
        validateur: PERSONNE,
        agents: { orderBy: { id: 'asc' } },
        facture: { select: { id: true, numero: true, statut: true, montantTotal: true } },
        lignes: {
          include: {
            medicament: { select: { id: true, code: true, designation: true, consommable: true, uniteVente: { select: { libelle: true } } } },
            lot: { select: { id: true, numeroLot: true, datePeremption: true } },
          },
          orderBy: { medicament: { designation: 'asc' } },
        },
      },
    });
    if (!s) throw new NotFoundException('Supervision introuvable.');
    const decideur = s.decidePar ? await this.prisma.utilisateur.findUnique({ where: { id: s.decidePar }, select: { nom: true, prenoms: true } }) : null;
    return { ...s, decideur, ...this.resumeEcarts(s.lignes) };
  }

  /**
   * Aide à la saisie : médicaments suivis au centre avec leur stock THÉORIQUE
   * à la date du contrôle, et les LOTS livrés au centre (choix facultatif).
   */
  async preparation(centreId: number, dateTexte?: string) {
    const date = dateTexte ? texteVersDate(dateTexte) : aujourdhui();
    const stocks = await this.prisma.stockCentre.findMany({
      where: { centreId },
      include: { medicament: { select: { id: true, code: true, designation: true, actif: true, uniteVente: { select: { libelle: true } } } } },
      orderBy: { medicament: { designation: 'asc' } },
    });
    const theorique = await this.stockALaDate(centreId, date);
    const lots = await this.prisma.ligneLivraison.findMany({
      where: { livraison: { centreId, statut: STATUT_PIECE.VALIDEE }, lotId: { not: null }, quantiteLivree: { gt: 0 } },
      select: { medicamentId: true, lot: { select: { id: true, numeroLot: true, datePeremption: true } } },
      distinct: ['lotId'],
    });
    return {
      medicaments: stocks.map((s) => ({
        medicamentId: s.medicamentId,
        medicament: s.medicament,
        stockTheorique: theorique.get(s.medicamentId) ?? 0,
      })),
      lots: lots.map((l) => ({ medicamentId: l.medicamentId, ...l.lot! })),
    };
  }

  /** Écarts constatés (supervisions validées ou clôturées), pour l'historique. */
  ecarts(filtres: FiltresSupervisions) {
    return this.prisma.ligneSupervision.findMany({
      where: {
        ecart: { not: 0 },
        supervision: {
          statut: { in: [S.VALIDEE, S.CLOTUREE] },
          ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
          ...(filtres.du || filtres.au
            ? { dateSupervision: { ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}), ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}) } }
            : {}),
        },
      },
      include: {
        medicament: { select: { code: true, designation: true } },
        lot: { select: { numeroLot: true } },
        supervision: {
          select: { id: true, numero: true, dateSupervision: true, statut: true, decision: true, centre: { select: { id: true, nom: true } } },
        },
      },
      orderBy: [{ supervision: { dateSupervision: 'desc' } }, { id: 'asc' }],
    });
  }

  // ===========================================================================
  // CONSTAT (BROUILLON)
  // ===========================================================================

  async creer(dto: CreerSupervisionDto, utilisateurId: number) {
    await this.verifierCentre(dto.centreId);
    const date = this.verifierDate(dto.dateSupervision);
    const lignes = await this.calculerLignes(dto.lignes, dto.centreId, date);

    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.SUPERVISION, date);
      const s = await tx.supervision.create({
        data: {
          numero,
          centreId: dto.centreId,
          dateSupervision: date,
          observations: dto.observations,
          statut: S.BROUILLON,
          utilisateurId,
          valeurEcartTotal: arrondi(lignes.reduce((t, l) => t + (l.valeurEcart ?? 0), 0)),
          agents: { create: this.agents(dto) },
          lignes: { create: lignes },
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'Supervision', entiteId: s.id, apres: { ...s, agents: dto.agents, lignes } }, tx);
      return s.id;
    });
    return this.trouver(id);
  }

  /** Modification d'un BROUILLON : agents et lignes remplacés, théorique et écarts recalculés. */
  async modifier(id: number, dto: ModifierSupervisionDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une supervision en brouillon peut être modifiée.');
    const centreId = dto.centreId ?? avant.centreId;
    if (centreId !== avant.centreId) await this.verifierCentre(centreId);
    const date = dto.dateSupervision ? this.verifierDate(dto.dateSupervision) : avant.dateSupervision;
    const demandes =
      dto.lignes ??
      avant.lignes.map((l) => ({ medicamentId: l.medicamentId, lotId: l.lotId ?? undefined, stockPhysique: l.stockPhysique, commentaire: l.commentaire ?? undefined }));
    const lignes = await this.calculerLignes(demandes, centreId, date);

    await this.prisma.$transaction(async (tx) => {
      await tx.ligneSupervision.deleteMany({ where: { supervisionId: id } });
      await tx.ligneSupervision.createMany({ data: lignes.map((l) => ({ ...l, supervisionId: id })) });
      if (dto.agents) {
        await tx.supervisionAgent.deleteMany({ where: { supervisionId: id } });
        await tx.supervisionAgent.createMany({ data: this.agents(dto as CreerSupervisionDto).map((a) => ({ ...a, supervisionId: id })) });
      }
      const apres = await tx.supervision.update({
        where: { id },
        data: {
          centreId,
          dateSupervision: date,
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
          valeurEcartTotal: arrondi(lignes.reduce((t, l) => t + (l.valeurEcart ?? 0), 0)),
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'MODIFICATION', entite: 'Supervision', entiteId: id, avant, apres: { ...apres, lignes } }, tx);
    });
    return this.trouver(id);
  }

  async supprimer(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une supervision en brouillon peut être supprimée.');
    await this.prisma.$transaction(async (tx) => {
      await tx.ligneSupervision.deleteMany({ where: { supervisionId: id } });
      await tx.supervisionAgent.deleteMany({ where: { supervisionId: id } });
      await tx.supervision.delete({ where: { id } });
      await this.audit.enregistrer({ utilisateurId, action: 'SUPPRESSION', entite: 'Supervision', entiteId: id, avant }, tx);
    });
    return { supprime: true };
  }

  // ===========================================================================
  // CIRCUIT : SOUMETTRE, RENVOYER, VALIDER, DÉCIDER
  // ===========================================================================

  async soumettre(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une supervision en brouillon peut être soumise.');
    await this.changer(id, utilisateurId, avant, { statut: S.SOUMISE, motifRenvoi: null }, 'SOUMISSION');
    return this.trouver(id);
  }

  async renvoyer(id: number, motif: string, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.SOUMISE) throw new BadRequestException('Seule une supervision soumise peut être renvoyée en brouillon.');
    if (!motif?.trim()) throw new BadRequestException('Indiquez le motif du renvoi.');
    await this.changer(id, utilisateurId, avant, { statut: S.BROUILLON, motifRenvoi: motif.trim() }, 'RENVOI');
    return this.trouver(id);
  }

  /** VALIDATION du constat par une personne habilitée : aucun effet sur le stock ni sur les comptes. */
  async valider(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.SOUMISE) throw new BadRequestException('Seule une supervision soumise peut être validée.');
    await this.changer(id, utilisateurId, avant, { statut: S.VALIDEE, validePar: utilisateurId, dateValidation: new Date() }, 'VALIDATION');
    return this.trouver(id);
  }

  /** DÉCISION sur les écarts (clôture) : aucune suite, régularisation du stock, ou facturation des manquants. */
  async decider(id: number, decision: string, motif: string, dateFactureTexte: string | undefined, utilisateurId: number) {
    const s = await this.trouver(id);
    if (s.statut !== S.VALIDEE) throw new BadRequestException('La décision se prend sur une supervision VALIDÉE.');
    if (!motif?.trim()) throw new BadRequestException('Indiquez le motif de la décision.');
    const ecarts = s.lignes.filter((l) => l.ecart !== 0);

    // Facturation : lignes manquantes valorisées
    const manquants = s.lignes.filter((l) => l.ecart < 0);
    if (decision === D.FACTURATION) {
      const sansPrix = manquants.filter((l) => l.prixUnitaire === null && !l.medicament.consommable);
      if (sansPrix.length) {
        throw new BadRequestException(`Prix manquant pour : ${sansPrix.map((l) => l.medicament.designation).join(', ')}. Définissez-le dans Paramétrage > Prix.`);
      }
      if (!manquants.some((l) => Number(l.prixUnitaire ?? 0) > 0)) {
        throw new BadRequestException('Aucun manquant valorisé à facturer : choisissez « Régularisation du stock » ou « Aucune suite ».');
      }
    }
    const dateFacture = dateFactureTexte ? texteVersDate(dateFactureTexte) : aujourdhui();
    if (dateFacture > aujourdhui()) throw new BadRequestException('La date de la facture ne peut pas être dans le futur.');

    await this.prisma.$transaction(async (tx) => {
      // 1. Stock théorique du centre aligné sur le physique (régularisation / facturation)
      if (decision !== D.AUCUNE) {
        for (const l of ecarts) {
          const cle = { centreId_medicamentId: { centreId: s.centreId, medicamentId: l.medicamentId } };
          const existant = await tx.stockCentre.findUnique({ where: cle });
          const avant = existant?.quantiteTheorique ?? 0;
          await tx.stockCentre.upsert({
            where: cle,
            create: { centreId: s.centreId, medicamentId: l.medicamentId, quantiteTheorique: l.ecart },
            update: { quantiteTheorique: { increment: l.ecart } },
          });
          await tx.mouvementStockCentre.create({
            data: {
              type: TYPE_MOUVEMENT_CENTRE.ECART_SUPERVISION,
              centreId: s.centreId,
              medicamentId: l.medicamentId,
              quantite: l.ecart,
              stockAvant: avant,
              stockApres: avant + l.ecart,
              motif: `Écart de supervision ${s.numero} (${l.ecart > 0 ? 'excédent' : 'manquant'})`,
              sourceType: 'SUPERVISION',
              sourceId: s.id,
              utilisateurId,
            },
          });
        }
      }

      // 2. Facture des manquants (montant complémentaire à payer)
      if (decision === D.FACTURATION) {
        const lignes = manquants
          .filter((l) => Number(l.prixUnitaire ?? 0) > 0)
          .map((l) => ({
            medicamentId: l.medicamentId,
            quantite: -l.ecart,
            prixUnitaire: Number(l.prixUnitaire),
            montant: arrondi(-l.ecart * Number(l.prixUnitaire)),
          }));
        const delai = Number((await tx.parametre.findUnique({ where: { cle: 'DELAI_PAIEMENT_JOURS' } }))?.valeur);
        const echeance = new Date(dateFacture);
        echeance.setUTCDate(echeance.getUTCDate() + (Number.isFinite(delai) && delai >= 0 ? delai : 30));
        const numero = await prochainNumero(tx, TYPE_COMPTEUR.FACTURE, dateFacture);
        const facture = await tx.facture.create({
          data: {
            numero,
            type: TYPE_FACTURE.ECART_SUPERVISION,
            centreId: s.centreId,
            supervisionId: s.id,
            dateEmission: dateFacture,
            dateEcheance: echeance,
            montantTotal: arrondi(lignes.reduce((t, l) => t + l.montant, 0)),
            statut: STATUT_FACTURE.EMISE,
            utilisateurId,
            lignes: { create: lignes },
          },
        });
        await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'Facture', entiteId: facture.id, apres: { ...facture, lignes, origine: s.numero } }, tx);
      }

      // 3. Clôture
      const apres = await tx.supervision.update({
        where: { id },
        data: { statut: S.CLOTUREE, decision, motifDecision: motif.trim(), decidePar: utilisateurId, dateDecision: new Date() },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'DECISION', entite: 'Supervision', entiteId: id, avant: { statut: s.statut }, apres }, tx);
    });
    return this.trouver(id);
  }

  // ===========================================================================
  // OUTILS
  // ===========================================================================

  private async changer(id: number, utilisateurId: number, avant: unknown, data: Prisma.SupervisionUncheckedUpdateInput, action: string) {
    await this.prisma.$transaction(async (tx) => {
      const apres = await tx.supervision.update({ where: { id }, data });
      await this.audit.enregistrer({ utilisateurId, action, entite: 'Supervision', entiteId: id, avant, apres }, tx);
    });
  }

  /** Résumé : nombre d'écarts, valeur des manquants et des excédents. */
  private resumeEcarts(lignes: { ecart: number; valeurEcart: Prisma.Decimal | number | null }[]) {
    const val = (l: { valeurEcart: Prisma.Decimal | number | null }) => Number(l.valeurEcart ?? 0);
    return {
      nombreEcarts: lignes.filter((l) => l.ecart !== 0).length,
      valeurManquants: arrondi(-lignes.filter((l) => l.ecart < 0).reduce((t, l) => t + val(l), 0)),
      valeurExcedents: arrondi(lignes.filter((l) => l.ecart > 0).reduce((t, l) => t + val(l), 0)),
    };
  }

  private agents(dto: CreerSupervisionDto) {
    return dto.agents
      .filter((a) => a.nom?.trim())
      .map((a) => ({ utilisateurId: a.utilisateurId ?? null, nom: a.nom.trim(), fonction: a.fonction?.trim() || null }));
  }

  /**
   * STOCK THÉORIQUE DU CENTRE À UNE DATE : stock actuel moins les mouvements
   * enregistrés APRÈS la fin de cette journée (livraisons, consommations...).
   */
  async stockALaDate(centreId: number, date: Date, medicamentIds?: number[]) {
    const filtre = medicamentIds ? { medicamentId: { in: medicamentIds } } : {};
    const [stocks, apres] = await Promise.all([
      this.prisma.stockCentre.findMany({ where: { centreId, ...filtre } }),
      this.prisma.mouvementStockCentre.groupBy({
        by: ['medicamentId'],
        where: { centreId, ...filtre, dateMouvement: { gte: lendemain(date) } },
        _sum: { quantite: true },
      }),
    ]);
    const resultat = new Map<number, number>();
    for (const s of stocks) resultat.set(s.medicamentId, s.quantiteTheorique);
    for (const m of apres) resultat.set(m.medicamentId, (resultat.get(m.medicamentId) ?? 0) - (m._sum.quantite ?? 0));
    return resultat;
  }

  /** Théorique à la date, écart, prix (règle du district) et valeur de chaque ligne. */
  private async calculerLignes(demandes: LigneSupervisionDto[], centreId: number, date: Date) {
    const ids = demandes.map((d) => d.medicamentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Un même médicament apparaît plusieurs fois : une seule ligne par médicament.');
    }
    const [medicaments, theorique, regle] = await Promise.all([
      this.prisma.medicament.findMany({ where: { id: { in: ids } } }),
      this.stockALaDate(centreId, date, ids),
      this.prisma.parametre.findUnique({ where: { cle: 'VALORISATION_ECARTS' } }),
    ]);
    const prixAchat = regle?.valeur === 'PRIX_ACHAT';
    const lignes: LigneCalculee[] = [];
    for (const d of demandes) {
      const med = medicaments.find((m) => m.id === d.medicamentId);
      if (!med) throw new NotFoundException('Médicament introuvable.');
      const stockTheorique = theorique.get(med.id) ?? 0;
      const ecart = d.stockPhysique - stockTheorique;
      let prix: number | null = 0;
      if (!med.consommable) prix = prixAchat ? await this.prixAchatALaDate(med.id, date) : await this.prixVente(med.id, centreId, date);
      lignes.push({
        medicamentId: med.id,
        lotId: d.lotId ?? null,
        stockTheorique,
        stockPhysique: d.stockPhysique,
        ecart,
        prixUnitaire: prix,
        valeurEcart: prix === null ? null : arrondi(ecart * prix),
        commentaire: d.commentaire?.trim() || null,
      });
    }
    return lignes;
  }

  private async prixVente(medicamentId: number, centreId: number, date: Date) {
    const p = await this.prix.prixVenteApplicable(medicamentId, centreId, date);
    return p === null || p === undefined ? null : Number(p);
  }

  /** Prix d'achat valable à la date (le plus récent, tous fournisseurs). */
  private async prixAchatALaDate(medicamentId: number, date: Date) {
    const p = await this.prisma.prixAchat.findFirst({
      where: { medicamentId, dateEffet: { lte: date }, OR: [{ dateFin: null }, { dateFin: { gte: date } }] },
      orderBy: { dateEffet: 'desc' },
    });
    return p ? Number(p.prix) : null;
  }

  private async verifierCentre(centreId: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    if (!centre.actif) throw new BadRequestException(`Le centre « ${centre.nom} » est désactivé.`);
  }

  private verifierDate(texte: string) {
    const date = texteVersDate(texte);
    if (date > aujourdhui()) throw new BadRequestException('La date du contrôle ne peut pas être dans le futur.');
    return date;
  }
}
