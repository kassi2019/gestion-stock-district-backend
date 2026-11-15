/**
 * =============================================================================
 * SERVICE D'ACCÈS À LA BASE DE DONNÉES
 * =============================================================================
 * Prisma est l'outil qui permet de lire et d'écrire dans SQL Server sans écrire
 * de requêtes SQL à la main.
 *
 * Ce service représente la connexion à la base "bd_stock_district".
 * Pour l'utiliser dans un autre service, il suffit de le recevoir dans le
 * constructeur :
 *
 *     constructor(private prisma: PrismaService) {}
 *
 *     // Exemple : lire tous les centres de santé actifs
 *     this.prisma.centreSante.findMany({ where: { actif: true } });
 *
 * Les noms disponibles (centreSante, medicament, facture, ...) correspondent
 * aux "model" déclarés dans le fichier prisma/schema.prisma.
 * =============================================================================
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Appelée automatiquement au démarrage de l'API : ouvre la connexion. */
  async onModuleInit() {
    await this.$connect();
  }

  /** Appelée automatiquement à l'arrêt de l'API : ferme la connexion. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
