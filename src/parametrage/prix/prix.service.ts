/**
 * =============================================================================
 * SERVICE DES PRIX (achat et vente) — avec HISTORIQUE
 * =============================================================================
 * Cahier des charges §5 :
 *   - le prix d'achat est distinct du prix de vente ;
 *   - les prix conservent leur historique : une modification de tarif ne doit
 *     pas changer les anciennes factures ;
 *   - les prix de vente peuvent être identiques pour tous les centres, ou
 *     spécifiques à certains centres.
 *
 * FONCTIONNEMENT :
 *   ➜ Un prix n'est JAMAIS modifié ni supprimé.
 *   ➜ Pour changer un tarif, on crée un NOUVEAU prix avec une date d'effet.
 *     Le prix en cours est automatiquement "clôturé" la veille
 *     (dateFin = date d'effet - 1 jour).
 *
 *   Exemple : Paracétamol à 100 F depuis le 01/01, nouveau prix 120 F au 01/12
 *     -> ligne 1 : 100 F, du 01/01 au 30/11
 *     -> ligne 2 : 120 F, à partir du 01/12 (dateFin vide = prix en cours)
 *
 * EXCEPTION — CORRECTION D'UNE ERREUR DE SAISIE (corrigerPrix) :
 *   le prix EN COURS peut être corrigé sur place (nouveau montant + motif
 *   obligatoire). L'ancien montant, le nouveau et le motif sont gardés dans
 *   le journal d'audit. ➜ Quand la facturation existera, il faudra refuser la
 *   correction d'un prix déjà utilisé sur une facture (voir le TODO plus bas).
 *
 * La fonction prixVenteApplicable() sera utilisée par les modules
 * Livraisons, Consommations et Facturation pour trouver le bon prix à une date.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { texteVersDate, veille } from '../../common/dates';
import { CreerPrixAchatDto, CreerPrixVenteDto } from './prix.dto';

@Injectable()
export class PrixService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ===========================================================================
  // PRIX D'ACHAT
  // ===========================================================================

  /** Historique des prix d'achat d'un médicament (du plus récent au plus ancien). */
  historiqueAchat(medicamentId: number) {
    return this.prisma.prixAchat.findMany({
      where: { medicamentId },
      include: { fournisseur: { select: { id: true, raisonSociale: true } } },
      orderBy: { dateEffet: 'desc' },
    });
  }

  /** Enregistre un nouveau prix d'achat (et clôture le précédent). */
  async creerPrixAchat(dto: CreerPrixAchatDto, utilisateurId: number) {
    await this.verifierMedicament(dto.medicamentId);
    const dateEffet = texteVersDate(dto.dateEffet);
    const fournisseurId = dto.fournisseurId ?? null;

    // Tout se fait dans une TRANSACTION : soit tout réussit, soit rien n'est enregistré
    return this.prisma.$transaction(async (tx) => {
      // 1. Prix en cours pour ce médicament (et ce fournisseur)
      const prixEnCours = await tx.prixAchat.findFirst({
        where: { medicamentId: dto.medicamentId, fournisseurId, dateFin: null },
      });

      // 2. Le nouveau prix doit commencer APRÈS le prix en cours
      if (prixEnCours) {
        this.verifierDateEffet(prixEnCours.dateEffet, dateEffet);
        await tx.prixAchat.update({
          where: { id: prixEnCours.id },
          data: { dateFin: veille(dateEffet) },
        });
      }

      // 3. Création du nouveau prix
      const nouveauPrix = await tx.prixAchat.create({
        data: { medicamentId: dto.medicamentId, fournisseurId, prix: dto.prix, dateEffet },
      });

      // 4. Journal d'audit (dans la même transaction)
      await this.audit.enregistrer(
        {
          utilisateurId,
          action: 'NOUVEAU_PRIX_ACHAT',
          entite: 'PrixAchat',
          entiteId: nouveauPrix.id,
          avant: prixEnCours,
          apres: nouveauPrix,
        },
        tx,
      );
      return nouveauPrix;
    });
  }

  // ===========================================================================
  // PRIX DE VENTE
  // ===========================================================================

  /** Historique des prix de vente d'un médicament (prix généraux + par centre). */
  historiqueVente(medicamentId: number) {
    return this.prisma.prixVente.findMany({
      where: { medicamentId },
      include: { centre: { select: { id: true, nom: true } } },
      orderBy: [{ dateEffet: 'desc' }],
    });
  }

  /** Enregistre un nouveau prix de vente (et clôture le précédent). */
  async creerPrixVente(dto: CreerPrixVenteDto, utilisateurId: number) {
    await this.verifierMedicament(dto.medicamentId);
    const dateEffet = texteVersDate(dto.dateEffet);
    const centreId = dto.centreId ?? null;

    // Prix spécifique à un centre : autorisé seulement si le paramètre est activé
    if (centreId !== null) {
      const parametre = await this.prisma.parametre.findUnique({
        where: { cle: 'PRIX_VENTE_PAR_CENTRE' },
      });
      if (parametre?.valeur !== 'true') {
        throw new BadRequestException(
          'Les prix par centre ne sont pas activés (paramètre « Prix de vente par centre »).',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const prixEnCours = await tx.prixVente.findFirst({
        where: { medicamentId: dto.medicamentId, centreId, dateFin: null },
      });

      if (prixEnCours) {
        this.verifierDateEffet(prixEnCours.dateEffet, dateEffet);
        await tx.prixVente.update({
          where: { id: prixEnCours.id },
          data: { dateFin: veille(dateEffet) },
        });
      }

      const nouveauPrix = await tx.prixVente.create({
        data: { medicamentId: dto.medicamentId, centreId, prix: dto.prix, dateEffet },
      });

      await this.audit.enregistrer(
        {
          utilisateurId,
          action: 'NOUVEAU_PRIX_VENTE',
          entite: 'PrixVente',
          entiteId: nouveauPrix.id,
          avant: prixEnCours,
          apres: nouveauPrix,
        },
        tx,
      );
      return nouveauPrix;
    });
  }

  /**
   * Prix de vente APPLICABLE à un centre pour un médicament, à une date donnée.
   * Ordre de recherche :
   *   1. prix spécifique au centre valable à cette date ;
   *   2. sinon, prix général valable à cette date.
   * Retourne null si aucun prix n'est défini.
   *
   * ➜ Utilisée par les modules Livraisons, Consommations et Facturation.
   */
  async prixVenteApplicable(medicamentId: number, centreId: number, date: Date) {
    // Condition "valable à cette date" : commencé avant (ou le jour même)
    // et pas encore terminé (dateFin vide ou après la date)
    const valableALaDate = {
      dateEffet: { lte: date },
      OR: [{ dateFin: null }, { dateFin: { gte: date } }],
    };

    const prixCentre = await this.prisma.prixVente.findFirst({
      where: { medicamentId, centreId, ...valableALaDate },
      orderBy: { dateEffet: 'desc' },
    });
    if (prixCentre) return prixCentre.prix;

    const prixGeneral = await this.prisma.prixVente.findFirst({
      where: { medicamentId, centreId: null, ...valableALaDate },
      orderBy: { dateEffet: 'desc' },
    });
    return prixGeneral ? prixGeneral.prix : null;
  }

  /**
   * Prix d'ACHAT applicable à un médicament, à une date donnée.
   * Ordre de recherche :
   *   1. prix propre au fournisseur (si un fournisseur est indiqué) valable à cette date ;
   *   2. sinon, prix général (sans fournisseur) valable à cette date ;
   *   3. sinon, le prix le plus récent valable à cette date, quel que soit le fournisseur.
   * Retourne null si aucun prix n'est défini.
   *
   * ➜ Utilisée par les modules Réception (prix repris des paramètres, non
   *   modifiable), Facturation et Rapport district (prix d'achat figé).
   */
  async prixAchatApplicable(medicamentId: number, date: Date, fournisseurId?: number | null) {
    const valableALaDate = {
      medicamentId,
      dateEffet: { lte: date },
      OR: [{ dateFin: null }, { dateFin: { gte: date } }],
    };
    const ordre = { dateEffet: 'desc' as const };

    if (fournisseurId) {
      const prixFournisseur = await this.prisma.prixAchat.findFirst({ where: { ...valableALaDate, fournisseurId }, orderBy: ordre });
      if (prixFournisseur) return prixFournisseur.prix;
    }
    const prixGeneral = await this.prisma.prixAchat.findFirst({ where: { ...valableALaDate, fournisseurId: null }, orderBy: ordre });
    if (prixGeneral) return prixGeneral.prix;

    const autre = await this.prisma.prixAchat.findFirst({ where: valableALaDate, orderBy: ordre });
    return autre ? autre.prix : null;
  }

  // ===========================================================================
  // CONTRÔLES COMMUNS
  // ===========================================================================

  /** Vérifie que le médicament existe. */
  // ===========================================================================
  // CORRECTION D'UN PRIX EN COURS (erreur de saisie)
  // ===========================================================================

  /**
   * Corrige le montant d'un prix EN COURS (vente ou achat), avec un motif.
   * Seul le prix en cours (sans date de fin) peut être corrigé : un prix
   * clôturé fait partie de l'historique.
   */
  async corrigerPrix(type: 'vente' | 'achat', id: number, prix: number, motif: string, utilisateurId: number) {
    // (le "as any" évite à TypeScript de mélanger les deux tables, qui ont les mêmes colonnes utiles)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (type === 'vente' ? this.prisma.prixVente : this.prisma.prixAchat) as any;

    const avant = await table.findUnique({ where: { id } });
    if (!avant) throw new NotFoundException('Prix introuvable.');
    if (avant.dateFin !== null) {
      throw new BadRequestException(
        "Seul le prix en cours peut être corrigé. Un prix clôturé fait partie de l'historique.",
      );
    }
    if (Number(avant.prix) === Number(prix)) {
      throw new BadRequestException('Le nouveau montant est identique au montant actuel.');
    }
    // TODO (module Facturation) : refuser si ce prix a déjà servi sur une facture.

    return this.prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableTx = (type === 'vente' ? tx.prixVente : tx.prixAchat) as any;
      const apres = await tableTx.update({ where: { id }, data: { prix } });
      await this.audit.enregistrer(
        {
          utilisateurId,
          action: type === 'vente' ? 'CORRECTION_PRIX_VENTE' : 'CORRECTION_PRIX_ACHAT',
          entite: type === 'vente' ? 'PrixVente' : 'PrixAchat',
          entiteId: id,
          avant,
          apres: { ...apres, motif: motif.trim() },
        },
        tx,
      );
      return apres;
    });
  }

  private async verifierMedicament(medicamentId: number) {
    const existe = await this.prisma.medicament.findUnique({ where: { id: medicamentId } });
    if (!existe) throw new NotFoundException('Médicament introuvable.');
  }

  /** Le nouveau prix doit commencer strictement après le début du prix en cours. */
  private verifierDateEffet(debutPrixEnCours: Date, nouvelleDate: Date) {
    if (nouvelleDate <= debutPrixEnCours) {
      const dateTexte = debutPrixEnCours.toISOString().substring(0, 10);
      throw new BadRequestException(
        `La date d'effet doit être postérieure au ${dateTexte} (début du prix en cours).`,
      );
    }
  }
}
