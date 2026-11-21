/**
 * =============================================================================
 * DROITS PAR MODULE (profils)
 * =============================================================================
 * Chaque profil (table roles) a, pour chaque module, TROIS droits possibles,
 * indépendants :
 *   - VOIR      : ouvrir le module, consulter, rechercher ;
 *   - IMPRIMER  : télécharger / imprimer les PDF ;
 *   - MODIFIER  : créer, modifier, importer, valider, désactiver...
 * Règle : IMPRIMER ou MODIFIER entraîne VOIR (on ne peut pas imprimer ou
 * modifier ce qu'on ne voit pas).
 *
 * Les droits sont enregistrés dans roles.permissions, en JSON :
 *     {"parametrage":["VOIR","IMPRIMER","MODIFIER"],"stock":["VOIR"]}
 * (module absent = aucun accès)
 *
 * Ancien format accepté à la lecture (profils enregistrés avant) :
 *     "LECTURE" = VOIR + IMPRIMER ;  "MODIFICATION" = VOIR + IMPRIMER + MODIFIER
 *
 * L'ADMINISTRATEUR a TOUJOURS tous les droits (ses permissions sont ignorées).
 *
 * Utilisation sur une route (voir acces.guard.ts) :
 *     @Acces('parametrage', 'LECTURE')       -> il faut le droit VOIR
 *     @Acces('parametrage', 'MODIFICATION')  -> il faut le droit MODIFIER
 *     @Acces('parametrage|achats', 'MODIFICATION') -> MODIFIER sur L'UN de ces modules
 * (IMPRIMER est contrôlé à l'écran : les PDF sont fabriqués par le navigateur
 *  à partir des données déjà visibles.)
 * =============================================================================
 */
import { SetMetadata } from '@nestjs/common';
import { DROITS, Droit, MODULES_APPLICATION, NIVEAU_ACCES, NiveauAcces, ROLES } from '../common/constants';

/** Droits d'un profil : code du module -> liste des droits. */
export type Permissions = Record<string, Droit[]>;

/** Ordre d'affichage des droits. */
const TOUS_LES_DROITS: Droit[] = [DROITS.VOIR, DROITS.IMPRIMER, DROITS.MODIFIER];

/** Nom interne de l'étiquette @Acces (lue par AccesGuard). */
export const CLE_ACCES = 'acces';

/**
 * Réserve une route aux profils qui ont ce droit sur ce module.
 *   @Acces('utilisateurs', 'LECTURE')       droit VOIR
 *   @Acces('utilisateurs', 'MODIFICATION')  droit MODIFIER
 */
export const Acces = (module: string, niveau: NiveauAcces) => SetMetadata(CLE_ACCES, { module, niveau });

/**
 * Nettoie la liste des droits d'un module :
 *   - accepte l'ancien format ("LECTURE" / "MODIFICATION") ;
 *   - garde seulement VOIR / IMPRIMER / MODIFIER, sans doublon, dans l'ordre ;
 *   - IMPRIMER ou MODIFIER ajoute VOIR.
 * Renvoie [] si aucun droit (= pas d'accès au module).
 */
export function normaliserDroits(valeur: unknown): Droit[] {
  let liste: unknown[] = [];
  if (valeur === NIVEAU_ACCES.LECTURE) liste = [DROITS.VOIR, DROITS.IMPRIMER];
  else if (valeur === NIVEAU_ACCES.MODIFICATION) liste = [...TOUS_LES_DROITS];
  else if (Array.isArray(valeur)) liste = valeur;

  const droits = new Set(liste.filter((d): d is Droit => TOUS_LES_DROITS.includes(d as Droit)));
  if (droits.size > 0) droits.add(DROITS.VOIR);
  return TOUS_LES_DROITS.filter((d) => droits.has(d));
}

/**
 * Lit les droits d'un profil (texte JSON de la base) en objet propre.
 * L'ADMIN reçoit tous les droits sur tous les modules.
 * Les valeurs inconnues (module ou droit mal écrit) sont ignorées.
 */
export function lirePermissions(codeRole: string, texteJson: string | null | undefined): Permissions {
  if (codeRole === ROLES.ADMIN) {
    return Object.fromEntries(MODULES_APPLICATION.map((m) => [m, [...TOUS_LES_DROITS]]));
  }
  let brut: Record<string, unknown> = {};
  try {
    brut = texteJson ? JSON.parse(texteJson) : {};
  } catch {
    brut = {};
  }
  const resultat: Permissions = {};
  for (const module of MODULES_APPLICATION) {
    const droits = normaliserDroits(brut[module]);
    if (droits.length > 0) resultat[module] = droits;
  }
  return resultat;
}

/**
 * Vrai si les droits donnés permettent ce niveau sur ce module (LECTURE = VOIR, MODIFICATION = MODIFIER).
 * Plusieurs modules séparés par « | » (ex. 'parametrage|achats') : il suffit d'en avoir UN.
 */
export function aLeDroit(permissions: Permissions, module: string, niveau: NiveauAcces): boolean {
  const droitCherche = niveau === NIVEAU_ACCES.MODIFICATION ? DROITS.MODIFIER : DROITS.VOIR;
  return module.split('|').some((m) => (permissions[m] ?? []).includes(droitCherche));
}
