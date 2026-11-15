/**
 * =============================================================================
 * NUMÉROTATION DES DOCUMENTS (bons de commande, bons de réception, factures...)
 * =============================================================================
 * Format : PRÉFIXE-ANNÉE-NUMÉRO sur 5 chiffres, ex. BCF-2026-00001.
 * La numérotation REPART À 1 CHAQUE ANNÉE (année de la date du document).
 * Le dernier numéro utilisé est gardé dans la table "compteurs"
 * (type = préfixe, annee = année).
 *
 * ⚠ À appeler DANS la transaction qui crée le document : si la création
 *   échoue, le numéro n'est pas consommé.
 *
 *     const numero = await prochainNumero(tx, TYPE_COMPTEUR.COMMANDE_FOURNISSEUR, dateCommande);
 * =============================================================================
 */
import { Prisma } from '@prisma/client';

export async function prochainNumero(tx: Prisma.TransactionClient, prefixe: string, date: Date): Promise<string> {
  const annee = date.getUTCFullYear();
  // +1 sur le compteur de l'année (créé à 1 s'il n'existe pas encore)
  const compteur = await tx.compteur.upsert({
    where: { type_annee: { type: prefixe, annee } },
    create: { type: prefixe, annee, valeur: 1 },
    update: { valeur: { increment: 1 } },
  });
  return `${prefixe}-${annee}-${String(compteur.valeur).padStart(5, '0')}`;
}
