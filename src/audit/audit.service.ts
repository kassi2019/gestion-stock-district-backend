/**
 * =============================================================================
 * JOURNAL D'AUDIT (traçabilité)
 * =============================================================================
 * Cahier des charges §5 et §8 : chaque opération importante doit conserver
 *   - l'utilisateur,
 *   - la date et l'heure,
 *   - le type d'opération,
 *   - les valeurs avant / après lorsque c'est pertinent.
 *
 * Ce service écrit une ligne dans la table "journal_audit".
 *
 * Exemple d'utilisation dans un autre service :
 *
 *     await this.audit.enregistrer({
 *       utilisateurId: utilisateur.id,
 *       action: 'MODIFICATION',
 *       entite: 'Medicament',
 *       entiteId: medicament.id,
 *       avant: ancienMedicament,
 *       apres: nouveauMedicament,
 *     });
 * =============================================================================
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Informations à fournir pour enregistrer une ligne de journal. */
export interface LigneJournal {
  /** Utilisateur qui fait l'opération (vide si inconnu, ex. échec de connexion) */
  utilisateurId?: number | null;
  /** Type d'opération : CREATION, MODIFICATION, VALIDATION, ANNULATION, CONNEXION, ... */
  action: string;
  /** Nom de l'élément concerné : 'Medicament', 'Facture', 'Livraison', ... */
  entite: string;
  /** Identifiant de l'élément concerné */
  entiteId?: string | number | null;
  /** Valeurs AVANT la modification (facultatif) */
  avant?: unknown;
  /** Valeurs APRÈS la modification (facultatif) */
  apres?: unknown;
  /** Adresse IP du poste de l'utilisateur (facultatif) */
  adresseIp?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Enregistre une ligne dans le journal d'audit.
   *
   * @param ligne       les informations à enregistrer
   * @param transaction (facultatif) la transaction en cours.
   *                    Si on la fournit, le journal est enregistré DANS la même
   *                    transaction que l'opération : si l'opération échoue,
   *                    le journal est annulé aussi (et inversement).
   */
  async enregistrer(ligne: LigneJournal, transaction?: Prisma.TransactionClient) {
    // On utilise la transaction si elle est fournie, sinon la connexion normale
    const base = transaction || this.prisma;

    // Les valeurs avant/après sont converties en texte JSON pour être stockées
    const donnees = {
      utilisateurId: ligne.utilisateurId ?? null,
      action: ligne.action,
      entite: ligne.entite,
      entiteId: ligne.entiteId != null ? String(ligne.entiteId) : null,
      valeursAvant: ligne.avant !== undefined ? JSON.stringify(ligne.avant) : null,
      valeursApres: ligne.apres !== undefined ? JSON.stringify(ligne.apres) : null,
      adresseIp: ligne.adresseIp ?? null,
    };

    try {
      await base.journalAudit.create({ data: donnees });
    } catch (erreur) {
      // Dans une transaction : on fait échouer toute l'opération
      // (une opération sensible ne doit pas passer sans trace).
      if (transaction) throw erreur;

      // Hors transaction (ex. connexion) : on note l'erreur dans la console
      // sans bloquer l'utilisateur.
      this.logger.error(`Impossible d'écrire dans le journal d'audit : ${(erreur as Error).message}`);
    }
  }
}
