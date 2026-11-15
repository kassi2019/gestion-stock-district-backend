/**
 * =============================================================================
 * SERVICE DES LIVRAISONS AUX CENTRES (module 05 Commandes et livraisons)
 * =============================================================================
 * Bon de livraison du dépôt du district vers un centre de santé, à partir
 * d'une COMMANDE validée (reste à livrer) ou DIRECT (sans commande).
 *
 *   BROUILLON (préparée) ──valider (quantités LIVRÉES)──► VALIDEE
 *       └──────────────annuler──────────────────────────► ANNULEE
 *
 * PRÉPARATION (brouillon) : pour chaque médicament et sa quantité, les LOTS
 *   sont choisis automatiquement : péremption la PLUS PROCHE d'abord, jamais
 *   un lot périmé, sans prendre ce qui est déjà réservé par une autre
 *   livraison en préparation. Une ligne par lot. Le PRIX DE VENTE applicable
 *   au centre à la date de livraison est FIGÉ sur la ligne (prix du centre,
 *   sinon prix général) : sans prix, la préparation est refusée.
 *
 * VALIDATION : quantité réellement livrée par ligne (≤ préparée), puis dans
 *   UNE transaction :
 *     1. STOCK DU DÉPÔT diminué : mouvement « SORTIE_LIVRAISON » par lot ;
 *     2. STOCK THÉORIQUE DU CENTRE augmenté + mouvement « LIVRAISON » du centre ;
 *     3. commande : PARTIELLEMENT_LIVREE ou LIVREE.
 *   Irréversible (une erreur se corrige par régularisation).
 *
 * Numéro automatique : BL-2026-00001.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_COMMANDE_CENTRE, STATUT_PIECE, TYPE_COMPTEUR, TYPE_MOUVEMENT_CENTRE, TYPE_MOUVEMENT_DEPOT } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { PrixService } from '../parametrage/prix/prix.service';
import { StockService } from '../stock/stock.service';
import { CommandesCentreService } from './commandes-centre.service';
import { CreerLivraisonDto, LignePreparationDto, ModifierLivraisonDto, ValiderLivraisonDto } from './livraisons.dto';

const S = STATUT_PIECE;
const SC = STATUT_COMMANDE_CENTRE;

const INCLURE_DETAIL = {
  centre: { include: { type: { select: { libelle: true } } } },
  commande: { select: { id: true, numero: true, dateCommande: true, statut: true } },
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
  commandeId?: number;
  statut?: string;
  du?: string;
  au?: string;
}

@Injectable()
export class LivraisonsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private prix: PrixService,
    private stock: StockService,
    private commandes: CommandesCentreService,
  ) {}

  lister(filtres: FiltresLivraisons) {
    return this.prisma.livraison.findMany({
      where: {
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.commandeId ? { commandeId: filtres.commandeId } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        ...(filtres.du || filtres.au
          ? { dateLivraison: { ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}), ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}) } }
          : {}),
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        commande: { select: { id: true, numero: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: [{ dateLivraison: 'desc' }, { id: 'desc' }],
    });
  }

  async trouver(id: number) {
    const livraison = await this.prisma.livraison.findUnique({ where: { id }, include: INCLURE_DETAIL });
    if (!livraison) throw new NotFoundException('Livraison introuvable.');
    return livraison;
  }

  /** PRÉPARATION : nouvelle livraison en brouillon (lots choisis automatiquement). */
  async creer(dto: CreerLivraisonDto, utilisateurId: number) {
    const dateLivraison = texteVersDate(dto.dateLivraison);
    const centreId = await this.verifierCommandeOuCentre(dto.commandeId ?? null, dto.centreId, dto.lignes);
    const lignes = await this.preparerLignes(dto.lignes, centreId, dateLivraison);

    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.BON_LIVRAISON, dateLivraison);
      const livraison = await tx.livraison.create({
        data: {
          numero,
          centreId,
          commandeId: dto.commandeId ?? null,
          dateLivraison,
          observations: dto.observations,
          statut: S.BROUILLON,
          utilisateurId,
          montantTotal: total(lignes),
          lignes: { create: lignes },
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'Livraison', entiteId: livraison.id, apres: { ...livraison, lignes } }, tx);
      return livraison.id;
    });
    return this.trouver(id);
  }

  /** Modification d'une livraison EN BROUILLON (la préparation est refaite). */
  async modifier(id: number, dto: ModifierLivraisonDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une livraison en préparation (brouillon) peut être modifiée.');
    const dateLivraison = dto.dateLivraison ? texteVersDate(dto.dateLivraison) : avant.dateLivraison;
    const commandeId = dto.commandeId !== undefined ? dto.commandeId ?? null : avant.commandeId;
    const demandes = dto.lignes ?? regrouper(avant.lignes);
    const centreId = await this.verifierCommandeOuCentre(commandeId, dto.centreId ?? avant.centreId, demandes, id);
    const lignes = await this.preparerLignes(demandes, centreId, dateLivraison, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.ligneLivraison.deleteMany({ where: { livraisonId: id } });
      await tx.ligneLivraison.createMany({ data: lignes.map((l) => ({ ...l, livraisonId: id })) });
      const apres = await tx.livraison.update({
        where: { id },
        data: {
          centreId,
          commandeId,
          dateLivraison,
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
          montantTotal: total(lignes),
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'MODIFICATION', entite: 'Livraison', entiteId: id, avant, apres: { ...apres, lignes } }, tx);
    });
    return this.trouver(id);
  }

  /**
   * VALIDATION : quantités réellement livrées ; sortie du stock du dépôt,
   * entrée dans le stock théorique du centre, mise à jour de la commande.
   */
  async valider(id: number, dto: ValiderLivraisonDto, utilisateurId: number) {
    const livraison = await this.trouver(id);
    if (livraison.statut !== S.BROUILLON) throw new BadRequestException('Seule une livraison en préparation peut être validée.');
    const livres = new Map(dto.lignes.map((l) => [l.ligneId, l.quantiteLivree]));
    for (const l of livraison.lignes) {
      const q = livres.get(l.id) ?? l.quantitePreparee;
      if (q > l.quantitePreparee) {
        throw new BadRequestException(`« ${l.medicament.designation} » : ${q} livré(s) pour ${l.quantitePreparee} préparé(s).`);
      }
    }
    if (livraison.lignes.every((l) => (livres.get(l.id) ?? l.quantitePreparee) === 0)) {
      throw new BadRequestException('Aucune quantité livrée : annulez plutôt la livraison.');
    }

    await this.prisma.$transaction(async (tx) => {
      const parMedicament = new Map<number, number>(); // quantités livrées au centre
      for (const l of livraison.lignes) {
        const quantite = livres.get(l.id) ?? l.quantitePreparee;
        await tx.ligneLivraison.update({
          where: { id: l.id },
          data: { quantiteLivree: quantite, montant: arrondi(quantite * Number(l.prixUnitaire)) },
        });
        if (quantite === 0) continue;
        // 1. Sortie du stock du DÉPÔT (lot par lot ; refusée si le lot n'a plus assez)
        await this.stock.appliquerMouvement(tx, {
          type: TYPE_MOUVEMENT_DEPOT.SORTIE_LIVRAISON,
          medicamentId: l.medicamentId,
          lotId: l.lotId,
          quantite,
          motif: `Livraison au centre ${livraison.centre.nom}`,
          pieceRef: livraison.numero,
          sourceType: 'LIVRAISON',
          sourceId: livraison.id,
          utilisateurId,
        });
        parMedicament.set(l.medicamentId, (parMedicament.get(l.medicamentId) ?? 0) + quantite);
      }

      // 2. Stock THÉORIQUE du centre augmenté + mouvement du centre
      for (const [medicamentId, quantite] of parMedicament) {
        const existant = await tx.stockCentre.findUnique({ where: { centreId_medicamentId: { centreId: livraison.centreId, medicamentId } } });
        const avant = existant?.quantiteTheorique ?? 0;
        await tx.stockCentre.upsert({
          where: { centreId_medicamentId: { centreId: livraison.centreId, medicamentId } },
          create: { centreId: livraison.centreId, medicamentId, quantiteTheorique: quantite },
          update: { quantiteTheorique: { increment: quantite } },
        });
        await tx.mouvementStockCentre.create({
          data: {
            type: TYPE_MOUVEMENT_CENTRE.LIVRAISON,
            centreId: livraison.centreId,
            medicamentId,
            quantite,
            stockAvant: avant,
            stockApres: avant + quantite,
            motif: `Livraison ${livraison.numero}`,
            sourceType: 'LIVRAISON',
            sourceId: livraison.id,
            utilisateurId,
          },
        });
      }

      // 3. Livraison validée (montant = quantités livrées × prix)
      const montant = livraison.lignes.reduce((t, l) => t + (livres.get(l.id) ?? l.quantitePreparee) * Number(l.prixUnitaire), 0);
      const apres = await tx.livraison.update({
        where: { id },
        data: { statut: S.VALIDEE, validePar: utilisateurId, dateValidation: new Date(), montantTotal: arrondi(montant) },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'VALIDATION', entite: 'Livraison', entiteId: id, avant: { statut: livraison.statut }, apres }, tx);
    });

    // 4. Statut de la commande (après la transaction : les quantités livrées sont à jour)
    if (livraison.commandeId) await this.majStatutCommande(livraison.commandeId);
    return this.trouver(id);
  }

  async annuler(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) {
      throw new BadRequestException('Une livraison validée ne peut pas être annulée : corrigez par une régularisation.');
    }
    await this.prisma.$transaction(async (tx) => {
      const apres = await tx.livraison.update({ where: { id }, data: { statut: S.ANNULEE } });
      await this.audit.enregistrer({ utilisateurId, action: 'ANNULATION', entite: 'Livraison', entiteId: id, avant, apres }, tx);
    });
    return this.trouver(id);
  }

  /** Disponibilités du dépôt (lots non périmés, réservations déduites) pour une liste de médicaments. */
  async disponibilites(medicamentIds: number[]) {
    // Sans identifiants : TOUS les médicaments ayant un stock utilisable (> 0)
    if (medicamentIds.length === 0) {
      const tous = await this.commandes.disponibilites(null);
      return Object.fromEntries([...tous].filter(([, q]) => q > 0));
    }
    const dispo = await this.commandes.disponibilites(medicamentIds);
    return Object.fromEntries(medicamentIds.map((id) => [id, Math.max(dispo.get(id) ?? 0, 0)]));
  }

  /**
   * FICHE D'UN CENTRE : stock théorique par médicament, livraisons et
   * mouvements du stock du centre (cahier des charges §3.4 « historique par centre »).
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

  // ===========================================================================
  // PRÉPARATION ET VÉRIFICATIONS
  // ===========================================================================

  /**
   * Choisit les LOTS de chaque médicament (péremption la plus proche d'abord,
   * jamais périmé, réservations des autres brouillons déduites) et fige le
   * prix de vente applicable au centre. Renvoie les lignes à enregistrer.
   */
  private async preparerLignes(demandes: LignePreparationDto[], centreId: number, date: Date, saufLivraisonId?: number) {
    const ids = demandes.map((d) => d.medicamentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Un même médicament apparaît plusieurs fois : regroupez les quantités.');

    const aujourdhui = texteVersDate(new Date().toISOString().substring(0, 10));
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: ids } } });
    const stocks = await this.prisma.stockDepot.findMany({
      where: {
        medicamentId: { in: ids },
        quantite: { gt: 0 },
        OR: [{ lotId: null }, { lot: { datePeremption: null } }, { lot: { datePeremption: { gte: aujourdhui } } }],
      },
      include: { lot: true },
    });
    // Quantités déjà réservées par d'autres livraisons en préparation, par lot
    const reservations = await this.prisma.ligneLivraison.findMany({
      where: { medicamentId: { in: ids }, livraison: { statut: S.BROUILLON, ...(saufLivraisonId ? { id: { not: saufLivraisonId } } : {}) } },
      select: { medicamentId: true, lotId: true, quantitePreparee: true },
    });
    const reserve = (medicamentId: number, lotId: number | null) =>
      reservations.filter((r) => r.medicamentId === medicamentId && r.lotId === lotId).reduce((t, r) => t + r.quantitePreparee, 0);

    const lignes: { medicamentId: number; lotId: number | null; quantitePreparee: number; quantiteLivree: number; prixUnitaire: number; montant: number }[] = [];
    for (const demande of demandes) {
      const medicament = medicaments.find((m) => m.id === demande.medicamentId);
      if (!medicament) throw new NotFoundException('Médicament introuvable.');

      const prix = await this.prix.prixVenteApplicable(medicament.id, centreId, date);
      if (prix === null) {
        throw new BadRequestException(`« ${medicament.designation} » n'a pas de prix de vente à cette date : définissez-le dans Paramétrage > Prix.`);
      }

      // Lots disponibles, péremption la plus proche d'abord (stock sans lot en dernier)
      const lots = stocks
        .filter((s) => s.medicamentId === medicament.id)
        .map((s) => ({ lotId: s.lotId, peremption: s.lot?.datePeremption?.getTime() ?? Infinity, libre: s.quantite - reserve(s.medicamentId, s.lotId) }))
        .filter((s) => s.libre > 0)
        .sort((a, b) => a.peremption - b.peremption);

      const disponible = lots.reduce((t, l) => t + l.libre, 0);
      if (demande.quantite > disponible) {
        throw new BadRequestException(`« ${medicament.designation} » : ${demande.quantite} demandé(s), ${disponible} disponible(s) au dépôt (lots non périmés).`);
      }

      let reste = demande.quantite;
      for (const lot of lots) {
        if (reste === 0) break;
        const prise = Math.min(reste, lot.libre);
        lignes.push({
          medicamentId: medicament.id,
          lotId: lot.lotId,
          quantitePreparee: prise,
          quantiteLivree: prise,
          prixUnitaire: Number(prix),
          montant: arrondi(prise * Number(prix)),
        });
        reste -= prise;
      }
    }
    return lignes;
  }

  /**
   * Vérifie la commande (ou le centre) et renvoie le centre :
   *   - avec commande : validée ou partiellement livrée, médicaments de la
   *     commande, quantités ≤ reste à livrer (accordé - livré - autres préparations) ;
   *   - sans commande : centre obligatoire et actif.
   */
  private async verifierCommandeOuCentre(commandeId: number | null, centreId: number | undefined, demandes: LignePreparationDto[], saufLivraisonId?: number) {
    if (commandeId) {
      const commande = await this.prisma.commandeCentre.findUnique({ where: { id: commandeId }, include: { lignes: { include: { medicament: true } } } });
      if (!commande) throw new NotFoundException('Commande introuvable.');
      if (commande.statut !== SC.VALIDEE && commande.statut !== SC.PARTIELLEMENT_LIVREE) {
        throw new BadRequestException(`La commande ${commande.numero} n'est pas à livrer (statut : ${commande.statut}).`);
      }
      const livre = (await this.commandes.quantitesLivrees([commandeId])).get(commandeId) ?? new Map<number, number>();
      const enPreparation = await this.prisma.ligneLivraison.findMany({
        where: { livraison: { commandeId, statut: S.BROUILLON, ...(saufLivraisonId ? { id: { not: saufLivraisonId } } : {}) } },
        select: { medicamentId: true, quantitePreparee: true },
      });
      for (const d of demandes) {
        const ligne = commande.lignes.find((l) => l.medicamentId === d.medicamentId);
        if (!ligne) throw new BadRequestException('Un médicament à livrer ne figure pas sur la commande.');
        const prepare = enPreparation.filter((p) => p.medicamentId === d.medicamentId).reduce((t, p) => t + p.quantitePreparee, 0);
        const reste = (ligne.quantiteAccordee ?? 0) - (livre.get(d.medicamentId) ?? 0) - prepare;
        if (d.quantite > reste) {
          throw new BadRequestException(`« ${ligne.medicament.designation} » : ${d.quantite} à livrer pour ${Math.max(reste, 0)} restant(s) sur la commande.`);
        }
      }
      return commande.centreId;
    }
    if (!centreId) throw new BadRequestException('Choisissez le centre de santé (ou la commande).');
    const centre = await this.prisma.centreSante.findUnique({ where: { id: centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    if (!centre.actif) throw new BadRequestException(`Le centre « ${centre.nom} » est désactivé.`);
    return centreId;
  }

  /** Commande entièrement livrée (accordé ≤ livré) -> LIVREE, sinon PARTIELLEMENT_LIVREE. */
  private async majStatutCommande(commandeId: number) {
    const commande = await this.prisma.commandeCentre.findUnique({ where: { id: commandeId }, include: { lignes: true } });
    if (!commande) return;
    const livre = (await this.commandes.quantitesLivrees([commandeId])).get(commandeId) ?? new Map<number, number>();
    const toutLivre = commande.lignes.every((l) => (livre.get(l.medicamentId) ?? 0) >= (l.quantiteAccordee ?? 0));
    await this.prisma.commandeCentre.update({ where: { id: commandeId }, data: { statut: toutLivre ? SC.LIVREE : SC.PARTIELLEMENT_LIVREE } });
  }
}

/** Regroupe les lignes (par lot) d'une livraison en quantités par médicament. */
function regrouper(lignes: { medicamentId: number; quantitePreparee: number }[]): LignePreparationDto[] {
  const parMed = new Map<number, number>();
  for (const l of lignes) parMed.set(l.medicamentId, (parMed.get(l.medicamentId) ?? 0) + l.quantitePreparee);
  return [...parMed].map(([medicamentId, quantite]) => ({ medicamentId, quantite }));
}

function total(lignes: { montant: number }[]) {
  return arrondi(lignes.reduce((t, l) => t + l.montant, 0));
}

function arrondi(valeur: number) {
  return Math.round(valeur * 100) / 100;
}
