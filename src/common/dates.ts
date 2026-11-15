/**
 * =============================================================================
 * OUTILS POUR LES DATES
 * =============================================================================
 * Les dates "sans heure" (date d'effet d'un prix, date de livraison...) sont
 * échangées avec le frontend au format texte 'AAAA-MM-JJ' (ex. '2026-11-14').
 *
 * Pour éviter les décalages de fuseau horaire, on les manipule toujours
 * à minuit UTC.
 * =============================================================================
 */

/** Convertit '2026-11-14' en date (minuit UTC). */
export function texteVersDate(texte: string): Date {
  const [annee, mois, jour] = texte.substring(0, 10).split('-').map(Number);
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** Retourne la veille d'une date (ex. 14/11 -> 13/11). */
export function veille(date: Date): Date {
  const resultat = new Date(date);
  resultat.setUTCDate(resultat.getUTCDate() - 1);
  return resultat;
}

/** Date du jour (minuit UTC). */
export function aujourdhui(): Date {
  const maintenant = new Date();
  return new Date(Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()));
}
