/**
 * =============================================================================
 * SERVICE DES COMMANDES DES CENTRES (module 05 Commandes et livraisons)
 * =============================================================================
 * Demande de médicaments d'un centre de santé au dépôt du district.
 *
 *   BROUILLON ──valider (quantités ACCORDÉES)──► VALIDEE
 *       │                                          │ (livraisons validées)
 *       │                                          ▼
 *       │                        PARTIELLEMENT_LIVREE ──► LIVREE
 *       └──────────annuler (rien de livré)──► ANNULEE
 *
 * - DISPONIBILITÉS : pour chaque médicament, stock du dépôt UTILISABLE
 *   (lots non périmés) — affiché à la saisie et à la validation
 *   (cahier des charges §3.4 « vérification des disponibilités ») ;
 * - VALIDATION : quantité accordée par ligne (≤ demandée) ;
 * - les quantités LIVRÉES viennent des livraisons validées (livraisons.service.ts).
 *
 * Numéro automatique : CMD-2026-00001.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STATUT_COMMANDE_CENTRE, STATUT_PIECE, TYPE_COMPTEUR } from '../common/constants';
import { texteVersDate } from '../common/dates';
import { prochainNumero } from '../common/numerotation';
import { CreerCommandeCentreDto, LigneCommandeCentreDto, ModifierCommandeCentreDto, ValiderCommandeCentreDto } from './livraisons.dto';

const S = STATUT_COMMANDE_CENTRE;

const INCLURE_DETAIL = {
  centre: { include: { type: { select: { libelle: true } } } },
  lignes: {
    include: {
      medicament: { select: { id: true, code: true, designation: true, dosage: true, uniteVente: { select: { libelle: true } } } },
    },
    orderBy: { id: 'asc' },
  },
  livraisons: { select: { id: true, numero: true, dateLivraison: true, statut: true, montantTotal: true } },
} satisfies Prisma.CommandeCentreInclude;

export interface FiltresCommandesCentre {
  centreId?: number;
  statut?: string;
  du?: string;
  au?: string;
}

@Injectable()
export class CommandesCentreService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des commandes (les plus récentes d'abord), avec avancement de la livraison. */
  async lister(filtres: FiltresCommandesCentre) {
    const commandes = await this.prisma.commandeCentre.findMany({
      where: {
        ...(filtres.centreId ? { centreId: filtres.centreId } : {}),
        ...(filtres.statut ? { statut: filtres.statut } : {}),
        ...(filtres.du || filtres.au
          ? { dateCommande: { ...(filtres.du ? { gte: texteVersDate(filtres.du) } : {}), ...(filtres.au ? { lte: texteVersDate(filtres.au) } : {}) } }
          : {}),
      },
      include: {
        centre: { select: { id: true, code: true, nom: true } },
        lignes: { select: { medicamentId: true, quantiteDemandee: true, quantiteAccordee: true } },
      },
      orderBy: [{ dateCommande: 'desc' }, { id: 'desc' }],
    });
    const livre = await this.quantitesLivrees(commandes.map((c) => c.id));
    return commandes.map(({ lignes, ...c }) => ({
      ...c,
      nombreLignes: lignes.length,
      quantiteDemandee: lignes.reduce((t, l) => t + l.quantiteDemandee, 0),
      quantiteAccordee: lignes.reduce((t, l) => t + (l.quantiteAccordee ?? 0), 0),
      quantiteLivree: [...(livre.get(c.id)?.values() ?? [])].reduce((t, q) => t + q, 0),
    }));
  }

  /** Une commande avec ses lignes, les quantités livrées et les disponibilités du dépôt. */
  async trouver(id: number) {
    const commande = await this.prisma.commandeCentre.findUnique({ where: { id }, include: INCLURE_DETAIL });
    if (!commande) throw new NotFoundException('Commande introuvable.');
    const livre = (await this.quantitesLivrees([id])).get(id) ?? new Map<number, number>();
    const dispo = await this.disponibilites(commande.lignes.map((l) => l.medicamentId));
    return {
      ...commande,
      lignes: commande.lignes.map((l) => ({
        ...l,
        quantiteLivree: livre.get(l.medicamentId) ?? 0,
        disponible: dispo.get(l.medicamentId) ?? 0,
      })),
    };
  }

  async creer(dto: CreerCommandeCentreDto, utilisateurId: number) {
    await this.verifierCentre(dto.centreId);
    await this.verifierMedicaments(dto.lignes);
    const dateCommande = texteVersDate(dto.dateCommande);
    const id = await this.prisma.$transaction(async (tx) => {
      const numero = await prochainNumero(tx, TYPE_COMPTEUR.COMMANDE_CENTRE, dateCommande);
      const commande = await tx.commandeCentre.create({
        data: {
          numero,
          centreId: dto.centreId,
          dateCommande,
          observations: dto.observations,
          statut: S.BROUILLON,
          lignes: { create: dto.lignes.map((l) => ({ medicamentId: l.medicamentId, quantiteDemandee: l.quantiteDemandee })) },
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'CREATION', entite: 'CommandeCentre', entiteId: commande.id, apres: { ...commande, lignes: dto.lignes } }, tx);
      return commande.id;
    });
    return this.trouver(id);
  }

  /** Modification d'une commande EN BROUILLON (les lignes sont remplacées). */
  async modifier(id: number, dto: ModifierCommandeCentreDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une commande en brouillon peut être modifiée.');
    if (dto.centreId) await this.verifierCentre(dto.centreId);
    if (dto.lignes) await this.verifierMedicaments(dto.lignes);
    await this.prisma.$transaction(async (tx) => {
      if (dto.lignes) {
        await tx.ligneCommandeCentre.deleteMany({ where: { commandeId: id } });
        await tx.ligneCommandeCentre.createMany({
          data: dto.lignes.map((l) => ({ commandeId: id, medicamentId: l.medicamentId, quantiteDemandee: l.quantiteDemandee })),
        });
      }
      const apres = await tx.commandeCentre.update({
        where: { id },
        data: {
          ...(dto.centreId ? { centreId: dto.centreId } : {}),
          ...(dto.dateCommande ? { dateCommande: texteVersDate(dto.dateCommande) } : {}),
          ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
        },
      });
      await this.audit.enregistrer({ utilisateurId, action: 'MODIFICATION', entite: 'CommandeCentre', entiteId: id, avant, apres }, tx);
    });
    return this.trouver(id);
  }

  /** Validation : quantités ACCORDÉES (≤ demandées). La commande peut alors être livrée. */
  async valider(id: number, dto: ValiderCommandeCentreDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON) throw new BadRequestException('Seule une commande en brouillon peut être validée.');
    const accords = new Map(dto.lignes.map((l) => [l.ligneId, l.quantiteAccordee]));
    for (const ligne of avant.lignes) {
      const accordee = accords.get(ligne.id) ?? ligne.quantiteDemandee;
      if (accordee > ligne.quantiteDemandee) {
        throw new BadRequestException(`« ${ligne.medicament.designation} » : ${accordee} accordé(s) pour ${ligne.quantiteDemandee} demandé(s).`);
      }
    }
    if (avant.lignes.every((l) => (accords.get(l.id) ?? l.quantiteDemandee) === 0)) {
      throw new BadRequestException('Aucune quantité accordée : annulez plutôt la commande.');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const ligne of avant.lignes) {
        await tx.ligneCommandeCentre.update({ where: { id: ligne.id }, data: { quantiteAccordee: accords.get(ligne.id) ?? ligne.quantiteDemandee } });
      }
      const apres = await tx.commandeCentre.update({ where: { id }, data: { statut: S.VALIDEE } });
      await this.audit.enregistrer({ utilisateurId, action: 'VALIDATION', entite: 'CommandeCentre', entiteId: id, avant, apres: { ...apres, accords: dto.lignes } }, tx);
    });
    return this.trouver(id);
  }

  /** Annulation (seulement si aucune livraison n'est validée ou en préparation). */
  async annuler(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    if (avant.statut !== S.BROUILLON && avant.statut !== S.VALIDEE) {
      throw new BadRequestException("Impossible d'annuler : des médicaments ont déjà été livrés sur cette commande.");
    }
    if (avant.livraisons.some((l) => l.statut !== STATUT_PIECE.ANNULEE)) {
      throw new BadRequestException("Impossible d'annuler : une livraison est en préparation sur cette commande (annulez-la d'abord).");
    }
    await this.prisma.$transaction(async (tx) => {
      const apres = await tx.commandeCentre.update({ where: { id }, data: { statut: S.ANNULEE } });
      await this.audit.enregistrer({ utilisateurId, action: 'ANNULATION', entite: 'CommandeCentre', entiteId: id, avant, apres }, tx);
    });
    return this.trouver(id);
  }

  // ===========================================================================
  // OUTILS (utilisés aussi par le service des livraisons)
  // ===========================================================================

  /**
   * Stock UTILISABLE au dépôt par médicament : lots non périmés (et stock sans
   * lot), en excluant ce qui est déjà réservé par des livraisons en brouillon.
   */
  async disponibilites(medicamentIds: number[] | null, saufLivraisonId?: number) {
    const aujourdhui = texteVersDate(new Date().toISOString().substring(0, 10));
    // null = tous les médicaments
    const filtreMedicaments = medicamentIds ? { medicamentId: { in: medicamentIds } } : {};
    const stocks = await this.prisma.stockDepot.findMany({
      where: {
        ...filtreMedicaments,
        quantite: { gt: 0 },
        OR: [{ lotId: null }, { lot: { datePeremption: null } }, { lot: { datePeremption: { gte: aujourdhui } } }],
      },
    });
    const reserve = await this.prisma.ligneLivraison.findMany({
      where: {
        ...filtreMedicaments,
        livraison: { statut: STATUT_PIECE.BROUILLON, ...(saufLivraisonId ? { id: { not: saufLivraisonId } } : {}) },
      },
      select: { medicamentId: true, quantitePreparee: true },
    });
    const dispo = new Map<number, number>();
    for (const s of stocks) dispo.set(s.medicamentId, (dispo.get(s.medicamentId) ?? 0) + s.quantite);
    for (const r of reserve) dispo.set(r.medicamentId, (dispo.get(r.medicamentId) ?? 0) - r.quantitePreparee);
    return dispo;
  }

  /** Quantités LIVRÉES (livraisons validées) par commande puis par médicament. */
  async quantitesLivrees(commandeIds: number[]) {
    const lignes = await this.prisma.ligneLivraison.findMany({
      where: { livraison: { commandeId: { in: commandeIds }, statut: STATUT_PIECE.VALIDEE } },
      select: { medicamentId: true, quantiteLivree: true, livraison: { select: { commandeId: true } } },
    });
    const resultat = new Map<number, Map<number, number>>();
    for (const l of lignes) {
      const cid = l.livraison.commandeId!;
      if (!resultat.has(cid)) resultat.set(cid, new Map());
      const parMed = resultat.get(cid)!;
      parMed.set(l.medicamentId, (parMed.get(l.medicamentId) ?? 0) + l.quantiteLivree);
    }
    return resultat;
  }

  private async verifierCentre(centreId: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id: centreId } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    if (!centre.actif) throw new BadRequestException(`Le centre « ${centre.nom} » est désactivé.`);
  }

  private async verifierMedicaments(lignes: LigneCommandeCentreDto[]) {
    const ids = lignes.map((l) => l.medicamentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Un même médicament apparaît plusieurs fois : regroupez les quantités sur une seule ligne.');
    }
    const medicaments = await this.prisma.medicament.findMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      const med = medicaments.find((m) => m.id === id);
      if (!med) throw new NotFoundException('Médicament introuvable.');
      if (!med.actif) throw new BadRequestException(`Le médicament « ${med.designation} » est désactivé.`);
    }
    // La quantité demandée ne peut pas dépasser le DISPONIBLE au dépôt
    // (lots non périmés, préparations de livraison en cours déduites)
    const dispo = await this.disponibilites(ids);
    const depassements = lignes
      .filter((l) => l.quantiteDemandee > Math.max(dispo.get(l.medicamentId) ?? 0, 0))
      .map((l) => {
        const med = medicaments.find((m) => m.id === l.medicamentId)!;
        return `« ${med.designation} » : ${l.quantiteDemandee} demandé(s), ${Math.max(dispo.get(l.medicamentId) ?? 0, 0)} disponible(s)`;
      });
    if (depassements.length) {
      throw new BadRequestException(`Quantité demandée supérieure au disponible au dépôt — ${depassements.join(' ; ')}.`);
    }
  }
}
