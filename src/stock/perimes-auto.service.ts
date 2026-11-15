/**
 * =============================================================================
 * SORTIE AUTOMATIQUE DES LOTS PÉRIMÉS (traitement de nuit)
 * =============================================================================
 * Chaque nuit à 00 h 30, et au démarrage du serveur (pour rattraper une nuit
 * où il était éteint), les lots PÉRIMÉS encore en stock sont sortis
 * automatiquement : un mouvement « Sortie — périmés » par lot, avec le motif
 * « Sortie automatique » (origine AUTO_PERIMES dans les mouvements).
 *
 * ➜ Activé ou désactivé dans Paramétrage > Paramètres généraux >
 *   « Sortie automatique des lots périmés » (paramètre SORTIE_AUTO_PERIMES).
 * ➜ Le mouvement est enregistré au nom du premier ADMINISTRATEUR actif
 *   (un mouvement doit avoir un auteur) ; le journal d'audit indique
 *   « SORTIE_AUTO_PERIMES » sans utilisateur.
 *
 * ⚠ Les boîtes périmées doivent quand même être retirées physiquement des
 *   étagères (destruction / retour fournisseur) : le stock informatique les
 *   a sorties, le dépôt doit faire de même.
 * =============================================================================
 */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants';
import { StockService } from './stock.service';

@Injectable()
export class PerimesAutoService implements OnApplicationBootstrap {
  private readonly journal = new Logger('PerimesAuto');

  constructor(
    private prisma: PrismaService,
    private stock: StockService,
  ) {}

  /** Au démarrage du serveur : rattrapage (quelques secondes après le lancement). */
  onApplicationBootstrap() {
    setTimeout(() => this.executer('démarrage'), 10000);
  }

  /** Chaque nuit à 00 h 30. */
  @Cron('30 0 * * *')
  traitementDeNuit() {
    return this.executer('nuit');
  }

  /** Sort les lots périmés si le paramètre SORTIE_AUTO_PERIMES vaut « true ». */
  async executer(moment: string) {
    try {
      const parametre = await this.prisma.parametre.findUnique({ where: { cle: 'SORTIE_AUTO_PERIMES' } });
      if (parametre?.valeur !== 'true') return;

      const admin = await this.prisma.utilisateur.findFirst({
        where: { actif: true, role: { code: ROLES.ADMIN } },
        orderBy: { id: 'asc' },
      });
      if (!admin) return;

      const resultat = await this.stock.sortirLotsPerimes(admin.id, {
        motif: 'Sortie automatique — lot périmé',
        origine: 'AUTO_PERIMES',
      });
      if (resultat.lots > 0) {
        this.journal.log(`Sortie automatique (${moment}) : ${resultat.lots} lot(s) périmé(s), ${resultat.quantite} unité(s).`);
      }
    } catch (erreur) {
      this.journal.error(`Sortie automatique des lots périmés impossible : ${(erreur as Error).message}`);
    }
  }
}
