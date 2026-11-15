/**
 * =============================================================================
 * SERVICE DU STOCK DU DÉPÔT (module 04 Gestion du dépôt et des stocks)
 * =============================================================================
 * - ÉTAT DU STOCK : par médicament (total) et par lot, valorisé au prix
 *   d'achat et au prix de vente actuels ;
 * - MOUVEMENTS : historique (filtres médicament, type, période) ;
 * - FICHE DE STOCK : mouvements d'un médicament avec le solde après chacun ;
 * - MOUVEMENT MANUEL : ajustement +/-, sortie de périmés, transfert
 *   entrant/sortant, avec motif obligatoire (cahier des charges §3.3) ;
 * - INVENTAIRE PAR LOT (comme la pharmacie de l'application Clinique) :
 *     • COMPTAGE : pour chaque lot compté, le stock réel saisi devient le
 *       stock du lot ; n° de lot et péremption corrigeables (lus sur la
 *       boîte). Chaque lot compté est TRACÉ, même sans écart
 *       (INVENTAIRE_CONFORME) ;
 *     • RATTACHEMENT : du stock « sans lot » est rattaché à un lot, sans
 *       changer le stock total ;
 *     • FICHE D'INVENTAIRE : tout ce qui a été compté sur une période.
 * - LOTS PÉRIMÉS : sortie groupée de tous les lots périmés encore en stock
 *   (bouton des Alertes, ou traitement automatique de nuit : perimes-auto.service.ts) ;
 * - RÉSUMÉ DES ALERTES (pour l'accueil) : ruptures, sous le seuil, lots
 *   périmés et proches de la péremption.
 *
 * Règle commune (appliquerMouvement) : chaque changement de stock
 *   1. modifie la ligne de stock du dépôt (médicament + lot) ;
 *   2. refuse un stock négatif ;
 *   3. écrit un MOUVEMENT (type, quantité, stock avant/après du médicament ET
 *      du lot, motif, pièce, auteur, date) : l'historique est complet.
 * Les entrées « réelles » (réceptions) sont faites par le module Achats avec
 * le type ENTREE_RECEPTION : elles restent distinctes des ajustements.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TYPE_MOUVEMENT_DEPOT } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { ComptageDto, CreerMouvementDto, LigneComptageDto, RattacherDto } from './stock.dto';

const T = TYPE_MOUVEMENT_DEPOT;

/** Types de mouvements qui DIMINUENT le stock. */
export const TYPES_SORTIE: string[] = [T.SORTIE_LIVRAISON, T.AJUSTEMENT_NEGATIF, T.TRANSFERT_SORTIE, T.INVENTAIRE_NEGATIF, T.PERIME];
/** Types qui ne changent PAS le stock total (comptage conforme, rattachement de lot). */
export const TYPES_NEUTRES: string[] = [T.INVENTAIRE_CONFORME, T.RATTACHEMENT_LOT];
/** Types qui viennent de l'INVENTAIRE (fiche d'inventaire). */
const TYPES_INVENTAIRE: string[] = [T.INVENTAIRE_POSITIF, T.INVENTAIRE_NEGATIF, T.INVENTAIRE_CONFORME];

/** Informations d'un mouvement à appliquer. */
export interface MouvementAAppliquer {
  type: string;
  medicamentId: number;
  lotId: number | null;
  /** Quantité TOUJOURS positive : le sens est donné par le type */
  quantite: number;
  motif?: string | null;
  pieceRef?: string | null;
  prixUnitaire?: number | Prisma.Decimal | null;
  sourceType?: string | null;
  sourceId?: number | null;
  utilisateurId: number;
}

export interface FiltresMouvements {
  medicamentId?: number;
  type?: string;
  du?: string;
  au?: string;
}

@Injectable()
export class StockService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ===========================================================================
  // ÉTAT DU STOCK
  // ===========================================================================

  /**
   * Stock par médicament (tous les médicaments, même à 0) :
   *   - lots          : lignes de stock avec une quantité (péremption la plus proche d'abord) ;
   *   - lignesStock   : TOUTES les lignes de stock, même à 0 (inventaire) ;
   *   - valeur au prix d'achat / de vente actuels.
   */
  async etat() {
    const medicaments = await this.prisma.medicament.findMany({
      include: {
        famille: { select: { id: true, libelle: true } },
        forme: { select: { libelle: true } },
        uniteVente: { select: { libelle: true } },
        stocksDepot: { include: { lot: true } },
        prixVente: { where: { centreId: null, dateFin: null }, take: 1 },
        prixAchat: { where: { dateFin: null }, orderBy: { dateEffet: 'desc' }, take: 1 },
      },
      orderBy: { designation: 'asc' },
    });

    const parPeremption = (a: { datePeremption: Date | null }, b: { datePeremption: Date | null }) =>
      (a.datePeremption?.getTime() ?? Infinity) - (b.datePeremption?.getTime() ?? Infinity);

    return medicaments.map(({ stocksDepot, prixVente, prixAchat, ...m }) => {
      const stock = stocksDepot.reduce((t, s) => t + s.quantite, 0);
      const pa = prixAchat[0] ? Number(prixAchat[0].prix) : null;
      const pv = prixVente[0] ? Number(prixVente[0].prix) : null;
      const lignes = stocksDepot
        .map((s) => ({
          stockId: s.id,
          lotId: s.lotId,
          numeroLot: s.lot?.numeroLot ?? null,
          datePeremption: s.lot?.datePeremption ?? null,
          quantite: s.quantite,
        }))
        .sort(parPeremption);
      return {
        ...m,
        stock,
        prixAchat: pa,
        prixVente: pv,
        valeurAchat: pa !== null ? stock * pa : null,
        valeurVente: pv !== null ? stock * pv : null,
        lots: lignes.filter((l) => l.quantite > 0),
        lignesStock: lignes,
      };
    });
  }

  // ===========================================================================
  // MOUVEMENTS ET FICHE DE STOCK
  // ===========================================================================

  /** Historique des mouvements (les plus récents d'abord). */
  mouvements(filtres: FiltresMouvements) {
    return this.prisma.mouvementStock.findMany({
      where: {
        ...(filtres.medicamentId ? { medicamentId: filtres.medicamentId } : {}),
        ...(filtres.type ? { type: filtres.type } : {}),
        ...periode(filtres.du, filtres.au),
      },
      include: {
        medicament: { select: { id: true, code: true, designation: true, uniteVente: { select: { libelle: true } } } },
        lot: { select: { numeroLot: true, datePeremption: true } },
        utilisateur: { select: { nom: true, prenoms: true } },
      },
      orderBy: [{ dateMouvement: 'desc' }, { id: 'desc' }],
      take: 5000, // garde-fou : affiner avec les filtres au-delà
    });
  }

  /**
   * FICHE DE STOCK d'un médicament sur une période : stock au début, puis
   * chaque mouvement (du plus ancien au plus récent) avec le solde après.
   */
  async ficheStock(medicamentId: number, du?: string, au?: string) {
    const medicament = await this.prisma.medicament.findUnique({
      where: { id: medicamentId },
      include: { famille: true, forme: true, uniteVente: true },
    });
    if (!medicament) throw new NotFoundException('Médicament introuvable.');

    const mouvements = await this.prisma.mouvementStock.findMany({
      where: { medicamentId, ...periode(du, au) },
      include: {
        lot: { select: { numeroLot: true, datePeremption: true } },
        utilisateur: { select: { nom: true, prenoms: true } },
      },
      orderBy: [{ dateMouvement: 'asc' }, { id: 'asc' }],
    });

    // Stock au début de la période = stock AVANT le 1er mouvement de la période
    // (ou, sans mouvement, stock après le dernier mouvement antérieur)
    let stockInitial = mouvements[0]?.stockAvant ?? null;
    if (stockInitial === null) {
      const dernier = du
        ? await this.prisma.mouvementStock.findFirst({
            where: { medicamentId, dateMouvement: { lt: texteVersDate(du) } },
            orderBy: [{ dateMouvement: 'desc' }, { id: 'desc' }],
          })
        : null;
      stockInitial = dernier?.stockApres ?? 0;
    }
    const actuel = await this.prisma.stockDepot.aggregate({ where: { medicamentId }, _sum: { quantite: true } });

    // Les mouvements « neutres » (comptage conforme, rattachement de lot) ne sont ni des entrées ni des sorties
    const entrees = mouvements
      .filter((m) => !TYPES_SORTIE.includes(m.type) && !TYPES_NEUTRES.includes(m.type))
      .reduce((t, m) => t + m.quantite, 0);
    const sorties = mouvements.filter((m) => TYPES_SORTIE.includes(m.type)).reduce((t, m) => t + m.quantite, 0);

    return {
      medicament,
      stockInitial,
      entrees,
      sorties,
      stockFinal: mouvements.length ? mouvements[mouvements.length - 1].stockApres : stockInitial,
      stockActuel: actuel._sum.quantite ?? 0,
      mouvements,
    };
  }

  // ===========================================================================
  // MOUVEMENT MANUEL (ajustement, périmés, transfert, retrait, lot ajouté)
  // ===========================================================================

  async creerMouvement(dto: CreerMouvementDto, utilisateurId: number) {
    const medicament = await this.prisma.medicament.findUnique({ where: { id: dto.medicamentId } });
    if (!medicament) throw new NotFoundException('Médicament introuvable.');
    const estSortie = TYPES_SORTIE.includes(dto.type);

    const mouvement = await this.prisma.$transaction(async (tx) => {
      let lotId: number | null = dto.lotId ?? null;

      if (!estSortie) {
        // ENTRÉE : lot indiqué par son numéro (créé s'il n'existe pas)
        const numeroLot = dto.numeroLot?.trim();
        if (medicament.suiviLot && (!numeroLot || !dto.datePeremption)) {
          throw new BadRequestException(`« ${medicament.designation} » est suivi par lot : indiquez le n° de lot et la date de péremption.`);
        }
        lotId = numeroLot ? await this.lotParNumero(tx, medicament.id, numeroLot, dto.datePeremption) : null;
      }

      return this.appliquerMouvement(tx, {
        type: dto.type,
        medicamentId: medicament.id,
        lotId,
        quantite: dto.quantite,
        motif: dto.motif.trim(),
        pieceRef: dto.pieceRef?.trim() || null,
        sourceType: 'MANUEL',
        utilisateurId,
      });
    });

    await this.audit.enregistrer({ utilisateurId, action: 'MOUVEMENT_STOCK', entite: 'MouvementStock', entiteId: mouvement.id, apres: mouvement });
    return mouvement;
  }

  /**
   * SEUIL D'ALERTE d'un médicament : stock minimum au dépôt. En dessous,
   * le médicament passe « sous le seuil » (alertes, accueil). 0 = pas d'alerte.
   */
  async modifierSeuil(medicamentId: number, seuilAlerte: number, utilisateurId: number) {
    const avant = await this.prisma.medicament.findUnique({ where: { id: medicamentId }, select: { id: true, designation: true, seuilAlerte: true } });
    if (!avant) throw new NotFoundException('Médicament introuvable.');
    const apres = await this.prisma.medicament.update({
      where: { id: medicamentId },
      data: { seuilAlerte },
      select: { id: true, designation: true, seuilAlerte: true },
    });
    await this.audit.enregistrer({ utilisateurId, action: 'MODIFICATION', entite: 'Medicament', entiteId: medicamentId, avant, apres });
    return apres;
  }

  /**
   * APPLIQUE un mouvement au stock (dans une transaction) :
   * ligne de stock (médicament + lot) modifiée, stock négatif refusé,
   * mouvement enregistré avec le stock avant/après du médicament et du lot.
   */
  async appliquerMouvement(tx: Prisma.TransactionClient, m: MouvementAAppliquer) {
    const estSortie = TYPES_SORTIE.includes(m.type);
    const ligne = await tx.stockDepot.findFirst({ where: { medicamentId: m.medicamentId, lotId: m.lotId } });
    const stockLotAvant = ligne?.quantite ?? 0;

    if (estSortie && m.quantite > stockLotAvant) {
      const medicament = await tx.medicament.findUnique({ where: { id: m.medicamentId } });
      throw new BadRequestException(
        `Stock insuffisant pour « ${medicament?.designation} »${m.lotId ? ' (ce lot)' : ''} : ${stockLotAvant} disponible(s), ${m.quantite} demandé(s).`,
      );
    }

    // Stock du médicament AVANT (tous lots confondus)
    const total = await tx.stockDepot.aggregate({ where: { medicamentId: m.medicamentId }, _sum: { quantite: true } });
    const stockAvant = total._sum.quantite ?? 0;
    const variation = estSortie ? -m.quantite : m.quantite;

    if (ligne) {
      await tx.stockDepot.update({ where: { id: ligne.id }, data: { quantite: { increment: variation } } });
    } else {
      await tx.stockDepot.create({ data: { medicamentId: m.medicamentId, lotId: m.lotId, quantite: variation } });
    }

    return tx.mouvementStock.create({
      data: {
        type: m.type,
        medicamentId: m.medicamentId,
        lotId: m.lotId,
        quantite: m.quantite,
        stockAvant,
        stockApres: stockAvant + variation,
        stockLotAvant,
        stockLotApres: stockLotAvant + variation,
        prixUnitaire: m.prixUnitaire ?? (await this.prixAchatActuel(tx, m.medicamentId)),
        motif: m.motif ?? null,
        pieceRef: m.pieceRef ?? null,
        sourceType: m.sourceType ?? null,
        sourceId: m.sourceId ?? null,
        utilisateurId: m.utilisateurId,
      },
    });
  }

  // ===========================================================================
  // INVENTAIRE PAR LOT
  // ===========================================================================

  /**
   * COMPTAGE d'un ou plusieurs lots (bouton « Valider » d'un lot, ou
   * « Valider tout l'inventaire »). Pour chaque ligne :
   *   - corrections du n° de lot / de la péremption (si différents) ;
   *   - stock réel = nouveau stock du lot : mouvement INVENTAIRE +/- de
   *     l'écart, ou INVENTAIRE_CONFORME (quantité 0) s'il n'y a pas d'écart.
   * Tout est fait dans une seule transaction.
   */
  async comptage(dto: ComptageDto, utilisateurId: number) {
    let ajustes = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const ligne of dto.lignes) {
        if (await this.compterLigne(tx, ligne, utilisateurId)) ajustes++;
      }
    });
    await this.audit.enregistrer({ utilisateurId, action: 'INVENTAIRE', entite: 'StockDepot', apres: { lignes: dto.lignes.length, ajustes } });
    return { ajustes, total: dto.lignes.length };
  }

  /** Compte une ligne de stock. Renvoie vrai si le stock ou le lot a été modifié. */
  private async compterLigne(tx: Prisma.TransactionClient, l: LigneComptageDto, utilisateurId: number) {
    const ligne = await tx.stockDepot.findUnique({ where: { id: l.stockId }, include: { lot: true, medicament: true } });
    if (!ligne) throw new NotFoundException('Ligne de stock introuvable.');

    // 1. Corrections du lot (lues sur la boîte)
    const notes: string[] = [];
    if (ligne.lot) {
      const numero = l.numeroLot?.trim();
      if (l.numeroLot !== undefined && !numero) throw new BadRequestException('Le numéro de lot ne peut pas être vide.');
      const donnees: { numeroLot?: string; datePeremption?: Date } = {};
      if (numero && numero !== ligne.lot.numeroLot) {
        const doublon = await tx.lot.findFirst({ where: { medicamentId: ligne.medicamentId, numeroLot: numero, id: { not: ligne.lot.id } } });
        if (doublon) throw new BadRequestException(`« ${ligne.medicament.designation} » : le lot ${numero} existe déjà.`);
        donnees.numeroLot = numero;
        notes.push(`N° de lot : ${ligne.lot.numeroLot} → ${numero}`);
      }
      if (l.datePeremption) {
        const nouvelle = texteVersDate(l.datePeremption);
        const avant = ligne.lot.datePeremption?.toISOString().substring(0, 10);
        if (nouvelle.toISOString().substring(0, 10) !== avant) {
          donnees.datePeremption = nouvelle;
          const jour = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '—');
          notes.push(`Péremption : ${jour(avant)} → ${jour(l.datePeremption.substring(0, 10))}`);
        }
      }
      if (Object.keys(donnees).length) await tx.lot.update({ where: { id: ligne.lot.id }, data: donnees });
    }

    // 2. Stock réel
    const ecart = l.quantiteReelle - ligne.quantite;
    const motif = [l.commentaire?.trim(), ...notes].filter(Boolean).join(' ; ') || null;
    const numeroAffiche = l.numeroLot?.trim() || ligne.lot?.numeroLot || 'sans lot';

    if (ecart !== 0) {
      await this.appliquerMouvement(tx, {
        type: ecart > 0 ? T.INVENTAIRE_POSITIF : T.INVENTAIRE_NEGATIF,
        medicamentId: ligne.medicamentId,
        lotId: ligne.lotId,
        quantite: Math.abs(ecart),
        motif: motif || `Inventaire lot ${numeroAffiche}`,
        pieceRef: `Inventaire lot ${numeroAffiche}`.substring(0, 50),
        sourceType: 'COMPTAGE',
        utilisateurId,
      });
    } else {
      // Tracé même sans écart : la fiche d'inventaire liste tout ce qui a été compté
      const total = await tx.stockDepot.aggregate({ where: { medicamentId: ligne.medicamentId }, _sum: { quantite: true } });
      await tx.mouvementStock.create({
        data: {
          type: T.INVENTAIRE_CONFORME,
          medicamentId: ligne.medicamentId,
          lotId: ligne.lotId,
          quantite: 0,
          stockAvant: total._sum.quantite ?? 0,
          stockApres: total._sum.quantite ?? 0,
          stockLotAvant: ligne.quantite,
          stockLotApres: ligne.quantite,
          prixUnitaire: await this.prixAchatActuel(tx, ligne.medicamentId),
          motif: motif || 'Comptage conforme',
          pieceRef: `Inventaire lot ${numeroAffiche}`.substring(0, 50),
          sourceType: 'COMPTAGE',
          utilisateurId,
        },
      });
    }
    return ecart !== 0 || notes.length > 0;
  }

  /**
   * RATTACHEMENT du stock « sans lot » à un lot (lu sur la boîte) :
   * la quantité passe de la ligne sans lot à la ligne du lot. Le stock
   * TOTAL du médicament ne change pas (mouvement RATTACHEMENT_LOT).
   */
  async rattacher(dto: RattacherDto, utilisateurId: number) {
    const medicament = await this.prisma.medicament.findUnique({ where: { id: dto.medicamentId } });
    if (!medicament) throw new NotFoundException('Médicament introuvable.');

    const mouvement = await this.prisma.$transaction(async (tx) => {
      const sansLot = await tx.stockDepot.findFirst({ where: { medicamentId: dto.medicamentId, lotId: null } });
      const disponible = sansLot?.quantite ?? 0;
      if (dto.quantite > disponible) {
        throw new BadRequestException(`Seulement ${disponible} unité(s) sans lot pour « ${medicament.designation} ».`);
      }
      const numeroLot = dto.numeroLot.trim();
      const lotId = await this.lotParNumero(tx, dto.medicamentId, numeroLot, dto.datePeremption);
      const ligneLot = await tx.stockDepot.findFirst({ where: { medicamentId: dto.medicamentId, lotId } });
      const stockLotAvant = ligneLot?.quantite ?? 0;

      await tx.stockDepot.update({ where: { id: sansLot!.id }, data: { quantite: { decrement: dto.quantite } } });
      if (ligneLot) await tx.stockDepot.update({ where: { id: ligneLot.id }, data: { quantite: { increment: dto.quantite } } });
      else await tx.stockDepot.create({ data: { medicamentId: dto.medicamentId, lotId, quantite: dto.quantite } });

      const total = await tx.stockDepot.aggregate({ where: { medicamentId: dto.medicamentId }, _sum: { quantite: true } });
      return tx.mouvementStock.create({
        data: {
          type: T.RATTACHEMENT_LOT,
          medicamentId: dto.medicamentId,
          lotId,
          quantite: dto.quantite,
          stockAvant: total._sum.quantite ?? 0,
          stockApres: total._sum.quantite ?? 0,
          stockLotAvant,
          stockLotApres: stockLotAvant + dto.quantite,
          motif: `Rattachement de ${dto.quantite} unité(s) sans lot au lot ${numeroLot}`,
          sourceType: 'MANUEL',
          utilisateurId,
        },
      });
    });
    await this.audit.enregistrer({ utilisateurId, action: 'RATTACHEMENT_LOT', entite: 'MouvementStock', entiteId: mouvement.id, apres: mouvement });
    return mouvement;
  }

  /**
   * FICHE D'INVENTAIRE : tout ce qui a été compté sur la période (aujourd'hui
   * par défaut) : stock théorique, stock compté, écart, valeur de l'écart,
   * agent ; et le résumé (lots comptés, conformes, avec écart, manquants,
   * excédents, valeur des écarts, agents).
   */
  async ficheInventaire(du?: string, au?: string) {
    const aujourdhui = new Date().toISOString().substring(0, 10);
    const mouvements = await this.prisma.mouvementStock.findMany({
      where: { type: { in: TYPES_INVENTAIRE }, sourceType: 'COMPTAGE', ...periode(du || aujourdhui, au || du || aujourdhui) },
      include: {
        medicament: { select: { code: true, designation: true, dosage: true } },
        lot: { select: { numeroLot: true, datePeremption: true } },
        utilisateur: { select: { nom: true, prenoms: true } },
      },
      orderBy: [{ medicament: { designation: 'asc' } }, { dateMouvement: 'asc' }],
    });
    const lignes = mouvements.map((m) => {
      const ecart = m.type === T.INVENTAIRE_NEGATIF ? -m.quantite : m.type === T.INVENTAIRE_POSITIF ? m.quantite : 0;
      const prix = Number(m.prixUnitaire ?? 0);
      return {
        id: m.id,
        date: m.dateMouvement,
        code: m.medicament.code,
        medicament: m.medicament.designation,
        lot: m.lot?.numeroLot ?? 'Sans lot',
        peremption: m.lot?.datePeremption ?? null,
        stockAvant: m.stockLotAvant,
        stockApres: m.stockLotApres,
        ecart,
        prixUnitaire: prix,
        valeurEcart: ecart * prix,
        par: `${m.utilisateur.prenoms ?? ''} ${m.utilisateur.nom}`.trim(),
        commentaire: m.motif ?? '',
      };
    });
    const avecEcart = lignes.filter((l) => l.ecart !== 0);
    return {
      lignes,
      resume: {
        lotsComptes: lignes.length,
        lotsAvecEcart: avecEcart.length,
        lotsConformes: lignes.length - avecEcart.length,
        manquants: avecEcart.filter((l) => l.ecart < 0).reduce((t, l) => t + l.ecart, 0),
        excedents: avecEcart.filter((l) => l.ecart > 0).reduce((t, l) => t + l.ecart, 0),
        valeurEcarts: lignes.reduce((t, l) => t + l.valeurEcart, 0),
        agents: [...new Set(lignes.map((l) => l.par))],
      },
    };
  }

  // ===========================================================================
  // LOTS PÉRIMÉS ET RÉSUMÉ DES ALERTES
  // ===========================================================================

  /** Lignes de stock (avec quantité) dont le lot est PÉRIMÉ (péremption avant aujourd'hui). */
  private lignesPerimees() {
    const aujourdhui = new Date(new Date().toISOString().substring(0, 10) + 'T00:00:00Z');
    return this.prisma.stockDepot.findMany({
      where: { quantite: { gt: 0 }, lot: { datePeremption: { lt: aujourdhui } } },
      include: { lot: true, medicament: { select: { designation: true } } },
    });
  }

  /**
   * SORTIE DE TOUS LES LOTS PÉRIMÉS encore en stock : un mouvement
   * « Sortie — périmés » par lot (quantité restante du lot), dans une seule
   * transaction. Utilisée par le bouton des Alertes et par le traitement de nuit.
   * @param origine 'MANUEL' (bouton) ou 'AUTO_PERIMES' (traitement automatique)
   */
  async sortirLotsPerimes(utilisateurId: number, options: { motif?: string; pieceRef?: string; origine?: string } = {}) {
    const lignes = await this.lignesPerimees();
    if (lignes.length === 0) return { lots: 0, quantite: 0, mouvements: [] as number[] };

    const mouvements = await this.prisma.$transaction(async (tx) => {
      const ids: number[] = [];
      for (const ligne of lignes) {
        const peremption = ligne.lot!.datePeremption!.toISOString().substring(0, 10).split('-').reverse().join('/');
        const mouvement = await this.appliquerMouvement(tx, {
          type: T.PERIME,
          medicamentId: ligne.medicamentId,
          lotId: ligne.lotId,
          quantite: ligne.quantite,
          motif: `${options.motif?.trim() || 'Lot périmé'} (lot ${ligne.lot!.numeroLot}, périmé le ${peremption})`.substring(0, 255),
          pieceRef: options.pieceRef?.trim() || null,
          sourceType: options.origine || 'MANUEL',
          utilisateurId,
        });
        ids.push(mouvement.id);
      }
      return ids;
    });

    const quantite = lignes.reduce((t, l) => t + l.quantite, 0);
    await this.audit.enregistrer({
      utilisateurId: options.origine === 'AUTO_PERIMES' ? null : utilisateurId,
      action: options.origine === 'AUTO_PERIMES' ? 'SORTIE_AUTO_PERIMES' : 'SORTIE_PERIMES',
      entite: 'MouvementStock',
      apres: { lots: lignes.length, quantite, mouvements },
    });
    return { lots: lignes.length, quantite, mouvements };
  }

  /**
   * Résumé des alertes de stock (accueil) : médicaments actifs en rupture ou
   * sous le seuil, lots périmés encore en stock, lots proches de la péremption
   * (délai : paramètre ALERTE_PEREMPTION_JOURS).
   */
  async resumeAlertes() {
    const etat = await this.etat();
    const parametre = await this.prisma.parametre.findUnique({ where: { cle: 'ALERTE_PEREMPTION_JOURS' } });
    const delai = Number(parametre?.valeur) > 0 ? Number(parametre!.valeur) : 90;
    const aujourdhui = new Date(new Date().toISOString().substring(0, 10) + 'T00:00:00Z').getTime();
    const limite = aujourdhui + delai * 86400000;

    const actifs = etat.filter((m) => m.actif);
    const lots = etat.flatMap((m) => m.lots.filter((l) => l.datePeremption).map((l) => ({ ...l, designation: m.designation })));
    const perimes = lots.filter((l) => l.datePeremption!.getTime() < aujourdhui);
    const proches = lots.filter((l) => l.datePeremption!.getTime() >= aujourdhui && l.datePeremption!.getTime() <= limite);

    return {
      delai,
      ruptures: actifs.filter((m) => m.stock <= 0).length,
      sousSeuil: actifs.filter((m) => m.stock > 0 && m.seuilAlerte > 0 && m.stock <= m.seuilAlerte).length,
      lotsPerimes: perimes.length,
      quantitePerimee: perimes.reduce((t, l) => t + l.quantite, 0),
      lotsProches: proches.length,
      // Quelques exemples à afficher (les plus urgents d'abord)
      exemplesPerimes: perimes
        .sort((a, b) => a.datePeremption!.getTime() - b.datePeremption!.getTime())
        .slice(0, 5)
        .map((l) => ({ designation: l.designation, numeroLot: l.numeroLot, datePeremption: l.datePeremption, quantite: l.quantite })),
      exemplesProches: proches
        .sort((a, b) => a.datePeremption!.getTime() - b.datePeremption!.getTime())
        .slice(0, 5)
        .map((l) => ({ designation: l.designation, numeroLot: l.numeroLot, datePeremption: l.datePeremption, quantite: l.quantite })),
      exemplesRuptures: actifs
        .filter((m) => m.stock <= 0 || (m.seuilAlerte > 0 && m.stock <= m.seuilAlerte))
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5)
        .map((m) => ({ designation: m.designation, stock: m.stock, seuilAlerte: m.seuilAlerte })),
    };
  }

  // ===========================================================================
  // OUTILS
  // ===========================================================================

  /** Identifiant du lot (médicament + n°), créé s'il n'existe pas (péremption complétée). */
  private async lotParNumero(tx: Prisma.TransactionClient, medicamentId: number, numeroLot: string, datePeremption?: string) {
    const lot = await tx.lot.upsert({
      where: { medicamentId_numeroLot: { medicamentId, numeroLot } },
      create: { medicamentId, numeroLot, datePeremption: datePeremption ? texteVersDate(datePeremption) : null },
      update: datePeremption ? { datePeremption: texteVersDate(datePeremption) } : {},
    });
    return lot.id;
  }

  /** Prix d'achat actuel d'un médicament (valorisation des mouvements). */
  private async prixAchatActuel(tx: Prisma.TransactionClient, medicamentId: number) {
    const pa = await tx.prixAchat.findFirst({ where: { medicamentId, dateFin: null }, orderBy: { dateEffet: 'desc' } });
    return pa?.prix ?? null;
  }
}

/** Filtre de période sur la date du mouvement (« au » inclus jusqu'à 23:59:59). */
function periode(du?: string, au?: string) {
  if (!du && !au) return {};
  const fin = au ? texteVersDate(au) : null;
  if (fin) fin.setUTCDate(fin.getUTCDate() + 1); // jusqu'à la fin de la journée
  return {
    dateMouvement: {
      ...(du ? { gte: texteVersDate(du) } : {}),
      ...(fin ? { lt: fin } : {}),
    },
  };
}
