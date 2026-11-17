/**
 * =============================================================================
 * SERVICE DES LIVRAISONS AUX CENTRES — HISTORIQUE (lecture seule)
 * =============================================================================
 * Spec nov. 2026 : les commandes des centres sont supprimées et les sorties du
 * district vers les centres se font par FACTURE (module Facturation, générée
 * par le rapport centre ou manuelle). Les anciens bons de livraison (BL-...)
 * restent CONSULTABLES : liste, détail par lot, PDF.
 *
 * La FICHE D'UN CENTRE (stock théorique, livraisons, mouvements) reste utile :
 * elle montre le stock théorique tenu à jour par les factures et les rapports.
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { texteVersDate } from '../common/dates';

const INCLURE_DETAIL = {
  centre: { include: { type: { select: { libelle: true } } } },
  utilisateur: { select: { nom: true, prenoms: true } },
  validateur: { select: { nom: true, prenoms: true } },
  lignes: {
    include: {
      medicament: { select: { id: true, code: true, designation: true, dosage: true, uniteVente: { select: { libelle: true } } } },
      lot: { select: { id: true, numeroLot: true, datePeremption: true } },
    },
    orderBy: [{ medicament: { designation: 'asc' } }, { id: 'asc' }],
  },
} satisfies Prisma.LivraisonInclude;

export interface FiltresLivraisons {
  centreId?: number;
  statut?: string;
  du?: string;
  au?: string;
}

@Injectable()
export class LivraisonsService {
  constructor(private prisma: PrismaService) {}

  /** Anciens bons de livraison (les plus récents d'abord). */
  lister(filtres: FiltresLivraisons) {
    return this.prisma.livraison.findMany({
      where: {
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        ...(filtres.du || filtres.au
          ? { dateLivraison: { ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}), ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}) } }
          : {}),
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: [{ dateLivraison: 'desc' }, { id: 'desc' }],
    });
  }

  /** Un bon de livraison avec ses lignes (par lot). */
  async trouver(id: number) {
    const livraison = await this.prisma.livraison.findUnique({ where: { id }, include: INCLURE_DETAIL });
    if (!livraison) throw new NotFoundException('Livraison introuvable.');
    return livraison;
  }

  /**
   * FICHE D'UN CENTRE : stock théorique par médicament, anciens bons de
   * livraison, factures-sorties et mouvements du stock du centre.
   */
  async ficheCentre(centreId: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: centreId }, include: { type: true } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    const [stock, livraisons, mouvements] = await Promise.all([
      this.prisma.stockCentre.findMany({
        where: { centreId },
        include: { medicament: { select: { id: true, code: true, designation: true, uniteVente: { select: { libelle: true } } } } },
        orderBy: { medicament: { designation: 'asc' } },
      }),
      this.lister({ centreId }),
      this.prisma.mouvementStockCentre.findMany({
        where: { centreId },
        include: {
          medicament: { select: { code: true, designation: true } },
          utilisateur: { select: { nom: true, prenoms: true } },
        },
        orderBy: [{ dateMouvement: 'desc' }, { id: 'desc' }],
        take: 1000,
      }),
    ]);
    return { centre, stock, livraisons, mouvements };
  }
}
