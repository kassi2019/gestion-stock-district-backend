/**
 * =============================================================================
 * SERVICE DE L'INVENTAIRE INITIAL (spec nov. 2026, §2)
 * =============================================================================
 * Écran utilisé UNE SEULE FOIS, à la mise en service : l'administrateur saisit,
 * par produit, le stock de départ du DISTRICT et de CHAQUE CENTRE de santé.
 *
 *   - « Entité » = le district (centreId NULL) ou un centre (centreId).
 *   - Le district est suivi PAR LOT (n° de lot + péremption) ; les centres non.
 *   - Si rien n'a encore été saisi pour l'entité, l'écran est pré-rempli avec
 *     son stock ACTUEL (pour ne rien perdre de ce qui existe déjà).
 *
 * ENREGISTRER = la liste saisie devient le stock de l'entité :
 *   1. les lignes de la table inventaire_initial de l'entité sont remplacées ;
 *   2. pour chaque produit (et lot), l'écart entre le stock actuel et la
 *      quantité saisie est passé en MOUVEMENT TRACÉ :
 *        district -> INVENTAIRE_POSITIF / INVENTAIRE_NEGATIF (motif « Inventaire initial ») ;
 *        centre   -> mouvement INVENTAIRE_INITIAL sur son stock théorique ;
 *      un produit qui n'est plus dans la liste revient donc à 0.
 *   Tout se fait dans UNE transaction.
 *
 * Ce stock devient le stock initial (SI) du premier rapport centre.
 * VERROUILLAGE : dès que le premier rapport centre est validé, le paramètre
 * INVENTAIRE_INITIAL_VERROUILLE passe à 'true' (fait par le module Rapport
 * centre) et l'inventaire initial ne peut plus être modifié.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PARAM_RAPPORT, TYPE_MOUVEMENT_CENTRE, TYPE_MOUVEMENT_DEPOT } from '../common/constants';
import { aujourdhui, texteVersDate } from '../common/dates';
import { StockService } from './stock.service';
import { EnregistrerInventaireInitialDto, LigneInventaireInitialDto } from './inventaire-initial.dto';

const MOTIF = 'Inventaire initial (mise en service)';
const SOURCE = 'INVENTAIRE_INITIAL';

/** Ligne affichée à l'écran. */
export interface LigneAffichee {
  medicamentId: number;
  quantite: number;
  numeroLot: string | null;
  datePeremption: Date | null;
}

@Injectable()
export class InventaireInitialService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private stock: StockService,
  ) {}

  /** L'inventaire initial est-il verrouillé (premier rapport centre validé) ? */
  async estVerrouille(tx: Prisma.TransactionClient = this.prisma) {
    const p = await tx.parametre.findUnique({ where: { cle: PARAM_RAPPORT.INVENTAIRE_INITIAL_VERROUILLE } });
    return p?.valeur === 'true';
  }

  /**
   * Vue d'ensemble : le district et chaque centre actif, avec ce qui a déjà
   * été saisi (nombre de lignes, date).
   */
  async etat() {
    const centres = await this.prisma.centreSante.findMany({ where: { actif: true }, orderBy: { nom: 'asc' }, select: { id: true, code: true, nom: true } });
    const lignes = await this.prisma.inventaireInitial.groupBy({
      by: ['centreId'],
      _count: { _all: true },
      _max: { dateInventaire: true, updatedAt: true },
    });
    const resume = (centreId: number | null) => {
      const g = lignes.find((l) => l.centreId === centreId);
      return g ? { nbLignes: g._count._all, dateInventaire: g._max.dateInventaire, modifieLe: g._max.updatedAt } : { nbLignes: 0, dateInventaire: null, modifieLe: null };
    };
    return {
      verrouille: await this.estVerrouille(),
      entites: [
        { centreId: null, nom: 'District (dépôt)', ...resume(null) },
        ...centres.map((c) => ({ centreId: c.id, nom: c.nom, code: c.code, ...resume(c.id) })),
      ],
    };
  }

  /**
   * Lignes de l'inventaire initial d'une entité.
   * Rien de saisi -> stock ACTUEL de l'entité (source = 'STOCK_ACTUEL').
   */
  async lire(centreId: number | null) {
    if (centreId !== null) await this.verifierCentre(centreId);
    const saisies = await this.prisma.inventaireInitial.findMany({
      where: { centreId },
      orderBy: [{ medicamentId: 'asc' }, { numeroLot: 'asc' }],
    });
    const verrouille = await this.estVerrouille();

    if (saisies.length > 0) {
      return {
        verrouille,
        source: 'INVENTAIRE',
        dateInventaire: saisies[0].dateInventaire,
        lignes: saisies.map<LigneAffichee>((l) => ({
          medicamentId: l.medicamentId,
          quantite: l.quantite,
          numeroLot: l.numeroLot,
          datePeremption: l.datePeremption,
        })),
      };
    }
    return { verrouille, source: 'STOCK_ACTUEL', dateInventaire: null, lignes: await this.stockActuel(centreId) };
  }

  /** Enregistre l'inventaire initial d'une entité : il devient son stock (voir en-tête). */
  async enregistrer(centreId: number | null, dto: EnregistrerInventaireInitialDto, utilisateurId: number) {
    if (await this.estVerrouille()) {
      throw new BadRequestException("L'inventaire initial est verrouillé : un premier rapport centre a déjà été validé.");
    }
    if (centreId !== null) await this.verifierCentre(centreId);
    const dateInventaire = texteVersDate(dto.dateInventaire);
    if (dateInventaire > aujourdhui()) throw new BadRequestException("La date de l'inventaire ne peut pas être dans le futur.");
    const lignes = await this.verifierLignes(centreId, dto.lignes);

    await this.prisma.$transaction(
      async (tx) => {
        // Re-vérifié dans la transaction (un rapport a pu être validé entre-temps)
        if (await this.estVerrouille(tx)) throw new BadRequestException("L'inventaire initial est verrouillé.");

        const avant = await tx.inventaireInitial.findMany({ where: { centreId } });
        await tx.inventaireInitial.deleteMany({ where: { centreId } });
        if (lignes.length > 0) {
          await tx.inventaireInitial.createMany({
            data: lignes.map((l) => ({
              centreId,
              medicamentId: l.medicamentId,
              numeroLot: l.numeroLot?.trim() || null,
              datePeremption: l.datePeremption ? texteVersDate(l.datePeremption) : null,
              quantite: l.quantite,
              dateInventaire,
              utilisateurId,
            })),
          });
        }

        const ecarts = centreId === null ? await this.appliquerDistrict(tx, lignes, utilisateurId) : await this.appliquerCentre(tx, centreId, lignes, utilisateurId);

        await this.audit.enregistrer(
          {
            utilisateurId,
            action: 'INVENTAIRE_INITIAL',
            entite: 'InventaireInitial',
            entiteId: centreId ?? undefined,
            avant: { lignes: avant.length },
            apres: { centreId, dateInventaire: dto.dateInventaire, lignes: lignes.length, ecarts },
          },
          tx,
        );
      },
      { timeout: 60000 }, // beaucoup de produits possibles
    );
    return this.lire(centreId);
  }

  // ===========================================================================
  // APPLICATION AU STOCK
  // ===========================================================================

  /**
   * DISTRICT : chaque ligne de stock (médicament + lot) est amenée à la
   * quantité saisie par un mouvement INVENTAIRE_POSITIF / NEGATIF.
   * Renvoie le nombre d'écarts passés en mouvement.
   */
  private async appliquerDistrict(tx: Prisma.TransactionClient, lignes: LigneInventaireInitialDto[], utilisateurId: number) {
    // Quantités voulues, par « médicament|lot »
    const voulu = new Map<string, { medicamentId: number; lotId: number | null; quantite: number }>();
    for (const l of lignes) {
      const numeroLot = l.numeroLot?.trim();
      let lotId: number | null = null;
      if (numeroLot) {
        const lot = await tx.lot.upsert({
          where: { medicamentId_numeroLot: { medicamentId: l.medicamentId, numeroLot } },
          create: { medicamentId: l.medicamentId, numeroLot, datePeremption: l.datePeremption ? texteVersDate(l.datePeremption) : null },
          update: l.datePeremption ? { datePeremption: texteVersDate(l.datePeremption) } : {},
        });
        lotId = lot.id;
      }
      voulu.set(`${l.medicamentId}|${lotId}`, { medicamentId: l.medicamentId, lotId, quantite: l.quantite });
    }

    // Stock actuel (toutes les lignes, y compris celles qui ne sont plus dans la liste -> 0)
    const actuel = await tx.stockDepot.findMany({ where: { quantite: { not: 0 } } });
    for (const s of actuel) {
      const cle = `${s.medicamentId}|${s.lotId}`;
      if (!voulu.has(cle)) voulu.set(cle, { medicamentId: s.medicamentId, lotId: s.lotId, quantite: 0 });
    }

    let ecarts = 0;
    for (const v of voulu.values()) {
      const ligne = actuel.find((s) => s.medicamentId === v.medicamentId && s.lotId === v.lotId);
      const ecart = v.quantite - (ligne?.quantite ?? 0);
      if (ecart === 0) continue;
      await this.stock.appliquerMouvement(tx, {
        type: ecart > 0 ? TYPE_MOUVEMENT_DEPOT.INVENTAIRE_POSITIF : TYPE_MOUVEMENT_DEPOT.INVENTAIRE_NEGATIF,
        medicamentId: v.medicamentId,
        lotId: v.lotId,
        quantite: Math.abs(ecart),
        motif: MOTIF,
        sourceType: SOURCE,
        utilisateurId,
      });
      ecarts++;
    }
    return ecarts;
  }

  /**
   * CENTRE : le stock théorique de chaque médicament est amené à la quantité
   * saisie par un mouvement INVENTAIRE_INITIAL (quantité signée).
   */
  private async appliquerCentre(tx: Prisma.TransactionClient, centreId: number, lignes: LigneInventaireInitialDto[], utilisateurId: number) {
    const voulu = new Map<number, number>();
    for (const l of lignes) voulu.set(l.medicamentId, l.quantite);

    const actuel = await tx.stockCentre.findMany({ where: { centreId } });
    for (const s of actuel) if (!voulu.has(s.medicamentId) && s.quantiteTheorique !== 0) voulu.set(s.medicamentId, 0);

    let ecarts = 0;
    for (const [medicamentId, quantite] of voulu) {
      const ligne = actuel.find((s) => s.medicamentId === medicamentId);
      const stockAvant = ligne?.quantiteTheorique ?? 0;
      const ecart = quantite - stockAvant;
      if (ecart === 0) continue;
      if (ligne) await tx.stockCentre.update({ where: { id: ligne.id }, data: { quantiteTheorique: quantite } });
      else await tx.stockCentre.create({ data: { centreId, medicamentId, quantiteTheorique: quantite } });
      await tx.mouvementStockCentre.create({
        data: {
          type: TYPE_MOUVEMENT_CENTRE.INVENTAIRE_INITIAL,
          centreId,
          medicamentId,
          quantite: ecart,
          stockAvant,
          stockApres: quantite,
          motif: MOTIF,
          sourceType: SOURCE,
          utilisateurId,
        },
      });
      ecarts++;
    }
    return ecarts;
  }

  // ===========================================================================
  // OUTILS ET VÉRIFICATIONS
  // ===========================================================================

  /** Stock actuel de l'entité, au format des lignes de l'écran. */
  private async stockActuel(centreId: number | null): Promise<LigneAffichee[]> {
    if (centreId === null) {
      const stock = await this.prisma.stockDepot.findMany({
        where: { quantite: { gt: 0 } },
        include: { lot: true },
        orderBy: [{ medicamentId: 'asc' }],
      });
      return stock.map((s) => ({
        medicamentId: s.medicamentId,
        quantite: s.quantite,
        numeroLot: s.lot?.numeroLot ?? null,
        datePeremption: s.lot?.datePeremption ?? null,
      }));
    }
    const stock = await this.prisma.stockCentre.findMany({ where: { centreId, quantiteTheorique: { gt: 0 } }, orderBy: { medicamentId: 'asc' } });
    return stock.map((s) => ({ medicamentId: s.medicamentId, quantite: s.quantiteTheorique, numeroLot: null, datePeremption: null }));
  }

  private async verifierCentre(centreId: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
  }

  /**
   * Lignes valides :
   *   - médicaments existants ;
   *   - centre : un médicament une seule fois, sans lot ;
   *   - district : un même médicament + lot une seule fois ; lot et péremption
   *     obligatoires pour un médicament « suivi par lot » (si quantité > 0).
   */
  private async verifierLignes(centreId: number | null, lignes: LigneInventaireInitialDto[]) {
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: lignes.map((l) => l.medicamentId) } } });
    const cles = new Set<string>();
    for (const l of lignes) {
      const med = medicaments.find((m) => m.id === l.medicamentId);
      if (!med) throw new NotFoundException('Médicament introuvable.');

      if (centreId !== null) {
        l.numeroLot = undefined;
        l.datePeremption = undefined;
        if (cles.has(String(l.medicamentId))) throw new BadRequestException(`« ${med.designation} » apparaît plusieurs fois : regroupez les quantités.`);
        cles.add(String(l.medicamentId));
        continue;
      }

      const cle = `${l.medicamentId}|${(l.numeroLot || '').trim().toUpperCase()}`;
      if (cles.has(cle)) throw new BadRequestException(`« ${med.designation} » (même lot) apparaît plusieurs fois : regroupez les quantités.`);
      cles.add(cle);
      if (med.suiviLot && l.quantite > 0 && (!l.numeroLot?.trim() || !l.datePeremption)) {
        throw new BadRequestException(`« ${med.designation} » est suivi par lot : indiquez le n° de lot et la date de péremption.`);
      }
    }
    return lignes;
  }
}
