/**
 * =============================================================================
 * SERVICE DU CATALOGUE DES MÉDICAMENTS
 * =============================================================================
 * Code, désignation, forme (table formes_medicament), dosage, unité, conditionnement, famille,
 * seuil d'alerte, suivi par lot et CONSOMMABLE (cahier des charges §3.1).
 *
 * La liste renvoie aussi, pour chaque médicament :
 *   - son prix de vente général en cours et son dernier prix d'achat ;
 *   - son STOCK actuel au dépôt (total de tous les lots).
 *
 * Le formulaire du médicament permet aussi de saisir :
 *   - le PRIX DE VENTE : enregistré dans l'historique des prix (table prix_vente)
 *     à la date du jour. En modification, un nouveau prix n'est créé que si le
 *     montant a changé (l'ancien est clôturé, voir prix.service.ts) ; si le prix
 *     en cours date d'aujourd'hui, il est simplement corrigé ;
 *   - le PRIX D'ACHAT (même principe, table prix_achat), pour un fournisseur
 *     précis (fournisseurId) ou pour tous les fournisseurs (fournisseurId vide) ;
 *     ➜ un seul import Excel remplit ainsi médicaments + prix de vente + prix d'achat ;
 *   - le STOCK INITIAL (seulement à la création) : crée la ligne de stock du
 *     dépôt + un mouvement de stock « Stock initial ». Ensuite le stock ne
 *     change que par les réceptions, livraisons, inventaires...
 *
 * Règle : un médicament n'est jamais supprimé, on le désactive.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { aujourdhui, texteVersDate } from '../../common/dates';
import { PrixService } from '../prix/prix.service';
import { CreerMedicamentDto, ModifierMedicamentDto } from './medicaments.dto';

@Injectable()
export class MedicamentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private prixService: PrixService,
  ) {}

  /**
   * Liste des médicaments, triés par désignation.
   * @param recherche       texte cherché dans le code ou la désignation
   * @param familleId       filtrer sur une famille
   * @param actifsSeulement ne renvoyer que les médicaments actifs
   */
  async lister(recherche?: string, familleId?: number, actifsSeulement = false) {
    const medicaments = await this.prisma.medicament.findMany({
      where: {
        ...(actifsSeulement ? { actif: true } : {}),
        ...(familleId ? { familleId } : {}),
        ...(recherche
          ? { OR: [{ code: { contains: recherche } }, { designation: { contains: recherche } }] }
          : {}),
      },
      orderBy: { designation: 'asc' },
      include: {
        famille: true,
        forme: true,
        uniteVente: true,
        // Prix de vente GÉNÉRAL en cours (centreId vide, pas de date de fin)
        prixVente: { where: { centreId: null, dateFin: null }, take: 1 },
        // Dernier prix d'achat en cours
        prixAchat: { where: { dateFin: null }, orderBy: { dateEffet: 'desc' }, take: 1 },
        // Quantités en stock au dépôt (une ligne par lot)
        stocksDepot: { select: { quantite: true } },
      },
    });

    // On simplifie la réponse : prixVenteActuel / prixAchatActuel / stockActuel au lieu de tableaux
    return medicaments.map(({ prixVente, prixAchat, stocksDepot, ...medicament }) => ({
      ...medicament,
      prixVenteActuel: prixVente[0]?.prix ?? null,
      prixAchatActuel: prixAchat[0]?.prix ?? null,
      stockActuel: stocksDepot.reduce((total, ligne) => total + ligne.quantite, 0),
    }));
  }

  async trouver(id: number) {
    const medicament = await this.prisma.medicament.findUnique({
      where: { id },
      include: { famille: true, forme: true, uniteVente: true },
    });
    if (!medicament) throw new NotFoundException('Médicament introuvable.');
    return medicament;
  }

  async creer(dto: CreerMedicamentDto, utilisateurId: number) {
    // On sépare les colonnes du médicament des champs traités à part (prix, stock)
    const { prixVente, prixAchat, fournisseurId, stockInitial, numeroLot, datePeremption, ...donnees } = dto;
    const stock = stockInitial ?? 0;

    // Médicament suivi par lot : le stock initial doit avoir un n° de lot
    if (stock > 0 && (donnees.suiviLot ?? true) && !numeroLot?.trim()) {
      throw new BadRequestException(
        'Ce médicament est suivi par lot : indiquez le n° de lot du stock initial.',
      );
    }

    try {
      // Code vide -> code automatique (MED-0001, MED-0002...)
      const code = await codeOuAutomatique(this.prisma, donnees.code, 'MED', (c) =>
        this.prisma.medicament.findUnique({ where: { code: c } }),
      );

      // TRANSACTION : médicament + prix + stock sont enregistrés ensemble (ou rien)
      return await this.prisma.$transaction(async (tx) => {
        // Unité de dispensation non saisie : « unité » par défaut
        const unite = donnees.unite?.trim() || 'unité';
        // Unité de vente non choisie : Boîte (code BOITE) par défaut, si elle existe
        const uniteVenteId =
          donnees.uniteVenteId ?? (await tx.uniteVente.findUnique({ where: { code: 'BOITE' } }))?.id ?? null;
        const medicament = await tx.medicament.create({ data: { ...donnees, code, unite, uniteVenteId } });

        // Prix de vente général, valable à partir d'aujourd'hui
        if (prixVente !== undefined && prixVente !== null) {
          await tx.prixVente.create({
            data: { medicamentId: medicament.id, centreId: null, prix: prixVente, dateEffet: aujourdhui() },
          });
        }

        // Prix d'achat (du fournisseur indiqué, sinon de tous), valable à partir d'aujourd'hui
        if (prixAchat !== undefined && prixAchat !== null) {
          await tx.prixAchat.create({
            data: {
              medicamentId: medicament.id,
              fournisseurId: fournisseurId ?? null,
              prix: prixAchat,
              dateEffet: aujourdhui(),
            },
          });
        }

        // Stock initial au dépôt
        if (stock > 0) {
          await this.creerStockInitial(tx, medicament.id, stock, numeroLot, datePeremption, utilisateurId);
        }

        await this.audit.enregistrer(
          {
            utilisateurId,
            action: 'CREATION',
            entite: 'Medicament',
            entiteId: medicament.id,
            apres: { ...medicament, prixVente, prixAchat, fournisseurId, stockInitial: stock, numeroLot, datePeremption },
          },
          tx,
        );
        return medicament;
      });
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'médicament');
    }
  }

  async modifier(id: number, dto: ModifierMedicamentDto, utilisateurId: number) {
    const avant = await this.trouver(id);

    // Le stock initial n'est utilisé qu'à la création : on l'ignore ici
    // (ensuite le stock change par réceptions, livraisons, inventaires...)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { prixVente, prixAchat, fournisseurId, stockInitial, numeroLot, datePeremption, ...donnees } = dto;

    let apres;
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!donnees.code?.trim()) delete donnees.code;
      // Unité effacée : on garde l'ancienne (elle ne peut pas être vide)
      if (!donnees.unite?.trim()) delete donnees.unite;
      apres = await this.prisma.medicament.update({ where: { id }, data: donnees });
      await this.audit.enregistrer({
        utilisateurId,
        action: donnees.actif === false ? 'DESACTIVATION' : 'MODIFICATION',
        entite: 'Medicament',
        entiteId: id,
        avant,
        apres,
      });
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'médicament');
    }

    // Prix de vente et prix d'achat : nouveau prix SEULEMENT s'il a changé
    if (prixVente !== undefined && prixVente !== null) {
      await this.mettreAJourPrix('vente', id, prixVente, utilisateurId);
    }
    if (prixAchat !== undefined && prixAchat !== null) {
      await this.mettreAJourPrix('achat', id, prixAchat, utilisateurId, fournisseurId ?? null);
    }

    return apres;
  }

  /**
   * Met à jour le prix GÉNÉRAL de vente (tous centres) ou le prix d'achat
   * (d'un fournisseur, ou de tous si fournisseurId est vide) d'un médicament,
   * en gardant l'historique :
   *   - prix identique au prix en cours       : rien à faire ;
   *   - prix en cours créé AUJOURD'HUI         : on le CORRIGE (faute de frappe...),
   *     car un 2e prix le même jour est refusé par les règles des prix ;
   *   - sinon                                  : NOUVEAU prix à partir d'aujourd'hui
   *     (l'ancien est clôturé la veille, voir prix.service.ts).
   */
  private async mettreAJourPrix(
    type: 'vente' | 'achat',
    medicamentId: number,
    prix: number,
    utilisateurId: number,
    fournisseurId: number | null = null,
  ) {
    const table = type === 'vente' ? this.prisma.prixVente : this.prisma.prixAchat;
    const filtre =
      type === 'vente'
        ? { medicamentId, centreId: null, dateFin: null }
        : { medicamentId, fournisseurId, dateFin: null };

    // (le "as any" évite à TypeScript de mélanger les deux tables, qui ont les mêmes colonnes utiles)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prixEnCours = await (table as any).findFirst({ where: filtre });
    if (prixEnCours && Number(prixEnCours.prix) === Number(prix)) return;

    const dateDuJour = aujourdhui();
    if (prixEnCours && prixEnCours.dateEffet.getTime() === dateDuJour.getTime()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const corrige = await (table as any).update({ where: { id: prixEnCours.id }, data: { prix } });
      await this.audit.enregistrer({
        utilisateurId,
        action: type === 'vente' ? 'CORRECTION_PRIX_VENTE' : 'CORRECTION_PRIX_ACHAT',
        entite: type === 'vente' ? 'PrixVente' : 'PrixAchat',
        entiteId: corrige.id,
        avant: prixEnCours,
        apres: corrige,
      });
      return;
    }

    const donnees = { medicamentId, prix, dateEffet: dateDuJour.toISOString().substring(0, 10) };
    if (type === 'vente') await this.prixService.creerPrixVente(donnees, utilisateurId);
    else await this.prixService.creerPrixAchat({ ...donnees, fournisseurId: fournisseurId ?? undefined }, utilisateurId);
  }

  /**
   * Crée le stock initial du dépôt : lot (si n° de lot), ligne de stock,
   * et un mouvement de stock pour garder la trace de l'entrée.
   */
  private async creerStockInitial(
    tx: Prisma.TransactionClient,
    medicamentId: number,
    quantite: number,
    numeroLot: string | undefined,
    datePeremption: string | undefined,
    utilisateurId: number,
  ) {
    let lotId: number | null = null;
    if (numeroLot?.trim()) {
      const lot = await tx.lot.create({
        data: {
          medicamentId,
          numeroLot: numeroLot.trim(),
          datePeremption: datePeremption ? texteVersDate(datePeremption) : null,
        },
      });
      lotId = lot.id;
    }

    await tx.stockDepot.create({ data: { medicamentId, lotId, quantite } });

    await tx.mouvementStock.create({
      data: {
        type: 'AJUSTEMENT_POSITIF',
        medicamentId,
        lotId,
        quantite,
        stockAvant: 0,
        stockApres: quantite,
        motif: 'Stock initial (création du médicament)',
        sourceType: 'STOCK_INITIAL',
        utilisateurId,
      },
    });
  }
}
