/**
 * =============================================================================
 * CODES-BARRES : nettoyage et format (côté serveur)
 * =============================================================================
 * Même règle que le frontend (src/utils/codeBarre.js) :
 *   - espaces retirés, MAJUSCULES ;
 *   - DATA MATRIX (GS1, « 01 » + GTIN sur 14 chiffres) : on garde le GTIN et on
 *     le ramène à l'EAN-13 imprimé sur la même boîte ; ainsi le petit carré et
 *     le code-barres classique d'une même boîte donnent le MÊME code.
 * =============================================================================
 */

/** Format accepté : 4 à 50 chiffres ou lettres (et . - _ / +), sans espace. */
export const FORMAT_CODE_BARRE = /^[0-9A-Z.\-_/+]{4,50}$/;
export const MESSAGE_CODE_BARRE = 'Code-barres invalide (4 à 50 chiffres ou lettres, sans espace).';

export function normaliserCodeBarre(texte: unknown): string {
  let code = String(texte ?? '')
    .replace(/^\][A-Za-z]\d/, '') // préfixe ajouté par certains lecteurs (]d2, ]C1...)
    .replace(/\s+/g, '');
  // GS1 : identifiant 01 = GTIN sur 14 chiffres
  const gs1 = code.match(/^01(\d{14})/);
  if (gs1 && code.length > 16) code = gs1[1];
  else if (/^01\d{14}$/.test(code)) code = code.slice(2);
  // GTIN-14 commençant par 0 = EAN-13 précédé d'un zéro
  if (/^0\d{13}$/.test(code)) code = code.slice(1);
  return code.replace(/\u001d/g, '').toUpperCase();
}
