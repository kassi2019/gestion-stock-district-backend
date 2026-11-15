/**
 * =============================================================================
 * CONSTANTES : valeurs autorisées pour les statuts et les types
 * =============================================================================
 * Dans la base, les statuts sont enregistrés sous forme de texte
 * (ex. statut = 'BROUILLON'). Prisma ne permet pas de créer des listes fermées
 * ("enum") avec SQL Server, donc la liste des valeurs possibles est définie ICI.
 *
 * ➜ Règle : toujours utiliser ces constantes, ne jamais écrire le texte en dur.
 *
 *     ✔ statut: STATUT_RAPPORT.VALIDE
 *     ✘ statut: 'VALIDE'        (risque de faute de frappe : 'VALIDEE', 'valide'...)
 *
 * ➜ Pour ajouter un nouveau statut : l'ajouter dans la bonne liste ci-dessous.
 * =============================================================================
 */

/** Profils utilisateurs (cahier des charges §6). */
export const ROLES = {
  ADMIN: 'ADMIN',
  GESTIONNAIRE_DEPOT: 'GESTIONNAIRE_DEPOT',
  AGENT_SAISIE: 'AGENT_SAISIE',
  COMPTABLE: 'COMPTABLE',
  SUPERVISEUR: 'SUPERVISEUR',
  RESPONSABLE_DISTRICT: 'RESPONSABLE_DISTRICT',
} as const;
export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/**
 * Modules de l'application (mêmes codes que src/config/modules.js du frontend).
 * Les droits des profils sont donnés module par module (voir auth/droits.ts).
 * ➜ Pour un nouveau module : l'ajouter ici ET dans le frontend.
 */
export const MODULES_APPLICATION = [
  'parametrage',
  'utilisateurs',
  'achats',
  'stock',
  'livraisons',
  'consommations',
  'facturation',
  'paiements',
  'supervisions',
  'rapports',
] as const;

/**
 * Droits d'un profil sur un module (voir auth/droits.ts) : trois droits
 * indépendants. IMPRIMER ou MODIFIER entraîne VOIR.
 */
export const DROITS = {
  VOIR: 'VOIR', // ouvrir le module, consulter, rechercher
  IMPRIMER: 'IMPRIMER', // télécharger / imprimer les PDF
  MODIFIER: 'MODIFIER', // créer, modifier, importer, valider, désactiver
} as const;
export type Droit = (typeof DROITS)[keyof typeof DROITS];

/**
 * Niveau exigé par une route (étiquette @Acces) :
 *   LECTURE = droit VOIR ;  MODIFICATION = droit MODIFIER.
 * (Ce sont aussi les valeurs de l'ANCIEN format des droits, encore acceptées à la lecture.)
 */
export const NIVEAU_ACCES = {
  LECTURE: 'LECTURE',
  MODIFICATION: 'MODIFICATION',
} as const;
export type NiveauAcces = (typeof NIVEAU_ACCES)[keyof typeof NIVEAU_ACCES];

/** Commande passée par le district à un fournisseur. */
export const STATUT_COMMANDE_FOURNISSEUR = {
  BROUILLON: 'BROUILLON',
  VALIDEE: 'VALIDEE',
  PARTIELLEMENT_RECUE: 'PARTIELLEMENT_RECUE',
  RECUE: 'RECUE',
  ANNULEE: 'ANNULEE',
} as const;

/** Statut générique des pièces : réceptions et livraisons. Le stock ne bouge qu'à VALIDEE. */
export const STATUT_PIECE = {
  BROUILLON: 'BROUILLON',
  PREPAREE: 'PREPAREE',
  VALIDEE: 'VALIDEE',
  ANNULEE: 'ANNULEE',
} as const;

/** Commande (demande de médicaments) faite par un centre de santé. */
export const STATUT_COMMANDE_CENTRE = {
  BROUILLON: 'BROUILLON',
  SOUMISE: 'SOUMISE',
  VALIDEE: 'VALIDEE',
  PREPAREE: 'PREPAREE',
  PARTIELLEMENT_LIVREE: 'PARTIELLEMENT_LIVREE',
  LIVREE: 'LIVREE',
  ANNULEE: 'ANNULEE',
} as const;

/** Rapport mensuel de consommation : BROUILLON -> SOUMIS -> VALIDE -> FACTURE. */
export const STATUT_RAPPORT = {
  BROUILLON: 'BROUILLON',
  SOUMIS: 'SOUMIS',
  VALIDE: 'VALIDE',
  FACTURE: 'FACTURE',
} as const;

/** Origine de la facture. */
export const TYPE_FACTURE = {
  CONSOMMATION: 'CONSOMMATION',
  ECART_SUPERVISION: 'ECART_SUPERVISION',
  AVOIR: 'AVOIR',
} as const;

/** État de paiement d'une facture (calculé à partir des paiements imputés). */
export const STATUT_FACTURE = {
  EMISE: 'EMISE',
  PARTIELLEMENT_PAYEE: 'PARTIELLEMENT_PAYEE',
  PAYEE: 'PAYEE',
  ANNULEE: 'ANNULEE',
} as const;

/** PAIEMENT = règlement d'une facture ; AVANCE = argent versé avant facturation. */
export const TYPE_PAIEMENT = { PAIEMENT: 'PAIEMENT', AVANCE: 'AVANCE' } as const;
/** Moyen de paiement utilisé par le centre. */
export const MODE_PAIEMENT = {
  ESPECES: 'ESPECES',
  CHEQUE: 'CHEQUE',
  VIREMENT: 'VIREMENT',
  MOBILE_MONEY: 'MOBILE_MONEY',
} as const;

/** Supervision : constat (BROUILLON/SOUMISE) -> validation (VALIDEE) -> décision (CLOTUREE). */
export const STATUT_SUPERVISION = {
  BROUILLON: 'BROUILLON',
  SOUMISE: 'SOUMISE',
  VALIDEE: 'VALIDEE',
  CLOTUREE: 'CLOTUREE',
} as const;

/** Décision prise sur les écarts d'une supervision validée. Un écart ne crée jamais de dette automatiquement. */
export const DECISION_SUPERVISION = {
  AUCUNE: 'AUCUNE',
  REGULARISATION_STOCK: 'REGULARISATION_STOCK',
  FACTURATION: 'FACTURATION',
} as const;

/** Inventaire physique du dépôt. */
export const STATUT_INVENTAIRE = { EN_COURS: 'EN_COURS', VALIDE: 'VALIDE', ANNULE: 'ANNULE' } as const;

/** Types de mouvements du stock du DÉPÔT. Une entrée réelle (réception) est distincte d'un ajustement. */
export const TYPE_MOUVEMENT_DEPOT = {
  ENTREE_RECEPTION: 'ENTREE_RECEPTION',
  SORTIE_LIVRAISON: 'SORTIE_LIVRAISON',
  AJUSTEMENT_POSITIF: 'AJUSTEMENT_POSITIF',
  AJUSTEMENT_NEGATIF: 'AJUSTEMENT_NEGATIF',
  TRANSFERT_ENTREE: 'TRANSFERT_ENTREE',
  TRANSFERT_SORTIE: 'TRANSFERT_SORTIE',
  INVENTAIRE_POSITIF: 'INVENTAIRE_POSITIF',
  INVENTAIRE_NEGATIF: 'INVENTAIRE_NEGATIF',
  PERIME: 'PERIME',
  REGULARISATION: 'REGULARISATION',
  /** Lot compté à l'inventaire SANS écart (quantité 0) : trace du comptage */
  INVENTAIRE_CONFORME: 'INVENTAIRE_CONFORME',
  /** Stock « sans lot » rattaché à un lot : le stock TOTAL ne change pas */
  RATTACHEMENT_LOT: 'RATTACHEMENT_LOT',
} as const;

/** Types de mouvements du stock THÉORIQUE d'un centre. */
export const TYPE_MOUVEMENT_CENTRE = {
  LIVRAISON: 'LIVRAISON',
  CONSOMMATION: 'CONSOMMATION',
  ECART_SUPERVISION: 'ECART_SUPERVISION',
  REGULARISATION: 'REGULARISATION',
} as const;

/** Préfixes de numérotation des documents (ex. FAC-2026-00001). */
export const TYPE_COMPTEUR = {
  FACTURE: 'FAC',
  BON_LIVRAISON: 'BL',
  BON_RECEPTION: 'BR',
  COMMANDE_FOURNISSEUR: 'BCF',
  COMMANDE_CENTRE: 'CMD',
  RECU: 'REC',
  RAPPORT: 'RCM',
  SUPERVISION: 'SUP',
  INVENTAIRE: 'INV',
} as const;
