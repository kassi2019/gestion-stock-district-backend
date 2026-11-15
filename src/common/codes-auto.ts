/**
 * =============================================================================
 * CODES AUTOMATIQUES (quand l'utilisateur ne saisit pas de code)
 * =============================================================================
 * Le CODE des centres, fournisseurs, familles, médicaments et types de centres
 * est FACULTATIF à la saisie. S'il est laissé vide, un code est généré :
 *
 *     CEN-0001, CEN-0002...   centres de santé
 *     FOU-0001...             fournisseurs
 *     FAM-0001...             familles de produits
 *     MED-0001...             médicaments
 *     TYP-0001...             types de centres
 *
 * Le dernier numéro utilisé est gardé dans la table "compteurs"
 * (type = 'CODE_xxx', annee = 0 car la numérotation ne repart pas chaque année).
 * Si un code généré existe déjà (ex. saisi à la main), on passe au suivant.
 *
 * Utilisation dans un service :
 *
 *     const code = await codeOuAutomatique(this.prisma, dto.code, 'MED', (c) =>
 *       this.prisma.medicament.findUnique({ where: { code: c } }),
 *     );
 * =============================================================================
 */
import { PrismaService } from '../prisma/prisma.service';

/**
 * Renvoie le code saisi (nettoyé) s'il est rempli, sinon un nouveau code automatique.
 * @param prisma   service Prisma
 * @param saisi    code saisi par l'utilisateur (peut être vide)
 * @param prefixe  début du code (ex. 'MED')
 * @param existe   fonction qui cherche un élément ayant déjà ce code
 */
export async function codeOuAutomatique(
  prisma: PrismaService,
  saisi: string | null | undefined,
  prefixe: string,
  existe: (code: string) => Promise<unknown>,
): Promise<string> {
  const code = (saisi ?? '').trim();
  if (code) return code;

  const type = `CODE_${prefixe}`;
  // On essaie les numéros suivants jusqu'à trouver un code libre
  for (;;) {
    // +1 sur le compteur (créé à 1 s'il n'existe pas encore)
    const compteur = await prisma.compteur.upsert({
      where: { type_annee: { type, annee: 0 } },
      create: { type, annee: 0, valeur: 1 },
      update: { valeur: { increment: 1 } },
    });
    const nouveau = `${prefixe}-${String(compteur.valeur).padStart(4, '0')}`;
    if (!(await existe(nouveau))) return nouveau;
  }
}
