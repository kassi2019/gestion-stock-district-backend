/**
 * =============================================================================
 * TRADUCTION DES ERREURS DE LA BASE DE DONNÉES EN MESSAGES CLAIRS
 * =============================================================================
 * Quand une opération échoue dans SQL Server, Prisma renvoie un code d'erreur
 * technique (ex. "P2002"). Cette fonction le transforme en erreur HTTP avec un
 * message en français compréhensible par l'utilisateur.
 *
 * Utilisation dans un service :
 *
 *     try {
 *       return await this.prisma.centreSante.create({ data });
 *     } catch (erreur) {
 *       traduireErreurPrisma(erreur, 'centre de santé');
 *     }
 * =============================================================================
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Transforme une erreur Prisma en erreur HTTP, puis la lance.
 * @param erreur  l'erreur attrapée
 * @param element nom de l'élément concerné, pour le message (ex. 'médicament')
 */
export function traduireErreurPrisma(erreur: unknown, element: string): never {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError) {
    switch (erreur.code) {
      // Valeur déjà utilisée sur un champ unique (ex. même code)
      case 'P2002':
        throw new ConflictException(`Ce code est déjà utilisé par un autre enregistrement (${element}). Choisissez un autre code.`);

      // Lien vers un élément qui n'existe pas, ou suppression d'un élément encore utilisé
      case 'P2003':
        throw new BadRequestException(
          `Opération impossible : ce/cette ${element} est lié(e) à d'autres données.`,
        );

      // Élément à modifier introuvable
      case 'P2025':
        throw new NotFoundException(`${element} introuvable.`);
    }
  }
  // Erreur inconnue : on la laisse remonter telle quelle
  throw erreur;
}
