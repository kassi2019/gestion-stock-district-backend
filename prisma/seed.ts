/**
 * =============================================================================
 * DONNÉES DE DÉPART (seed)
 * =============================================================================
 * Ce script remplit la base avec les données indispensables au démarrage :
 *   - les 6 profils utilisateurs (cahier des charges §6) ;
 *   - les paramètres généraux ;
 *   - les types de centres de santé courants (modifiables ensuite) ;
 *   - un compte administrateur.
 *
 * Commande pour l'exécuter :   npm run prisma:seed
 *
 * Le script peut être relancé sans risque : "upsert" = créer si absent,
 * sinon ne rien casser (les paramètres déjà modifiés ne sont pas écrasés).
 * =============================================================================
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Profils utilisateurs
// ---------------------------------------------------------------------------
const profils = [
  { code: 'ADMIN', libelle: 'Administrateur', description: 'Paramétrage, utilisateurs, rôles et accès à tous les modules' },
  { code: 'GESTIONNAIRE_DEPOT', libelle: 'Gestionnaire du dépôt', description: 'Achats, réceptions, stocks, inventaires et livraisons' },
  { code: 'AGENT_SAISIE', libelle: 'Agent de saisie', description: 'Saisie des rapports de consommation' },
  { code: 'COMPTABLE', libelle: 'Comptable / caissier', description: 'Factures, paiements, reçus et comptes clients' },
  { code: 'SUPERVISEUR', libelle: 'Superviseur', description: 'Contrôles physiques, rapports de supervision et écarts' },
  { code: 'RESPONSABLE_DISTRICT', libelle: 'Responsable du district', description: 'Tableaux de bord, rapports et validations autorisées' },
];

/**
 * Droits de départ des profils, par module : VOIR / IMPRIMER / MODIFIER
 * (module absent = aucun accès ; l'ADMIN a toujours tout).
 * Utilisés seulement à la CRÉATION d'un profil : ensuite, les droits se
 * gèrent dans l'application (Utilisateurs > Profils & droits).
 */
const TOUT = ['VOIR', 'IMPRIMER', 'MODIFIER'];
const droitsDeDepart: Record<string, Record<string, string[]>> = {
  GESTIONNAIRE_DEPOT: { achats: TOUT, stock: TOUT, livraisons: TOUT, rapports: TOUT },
  AGENT_SAISIE: { consommations: TOUT },
  COMPTABLE: { facturation: TOUT, paiements: TOUT, rapports: TOUT },
  SUPERVISEUR: { supervisions: TOUT },
  RESPONSABLE_DISTRICT: { stock: TOUT, consommations: TOUT, facturation: TOUT, supervisions: TOUT, rapports: TOUT },
};

// ---------------------------------------------------------------------------
// Paramètres généraux (modifiables ensuite depuis l'application)
// ---------------------------------------------------------------------------
const parametres = [
  { cle: 'SESSION_EXPIRATION_MINUTES', valeur: '30', description: 'Déconnexion après inactivité (minutes)' },
  { cle: 'ALERTE_PEREMPTION_JOURS', valeur: '90', description: 'Alerte produits proches de la péremption (jours)' },
  { cle: 'PRIX_VENTE_PAR_CENTRE', valeur: 'false', description: 'Autoriser des prix de vente spécifiques par centre' },
  { cle: 'DEVISE', valeur: 'FCFA', description: 'Devise' },
  { cle: 'NOM_DISTRICT', valeur: 'District sanitaire', description: 'Nom affiché sur les documents' },
  { cle: 'VALORISATION_ECARTS', valeur: 'PRIX_VENTE', description: 'Prix utilisé pour valoriser les écarts de supervision (PRIX_VENTE ou PRIX_ACHAT)' },
  { cle: 'DELAI_PAIEMENT_JOURS', valeur: '30', description: 'Délai de paiement des factures (jours après émission)' },
  { cle: 'SORTIE_AUTO_PERIMES', valeur: 'true', description: 'Sortir automatiquement du stock, chaque nuit, les lots périmés' },
  // Informations du district (Paramètres généraux > Informations du district)
  { cle: 'DISTRICT_CODE', valeur: '', description: 'Code du district' },
  { cle: 'DISTRICT_REGION', valeur: '', description: 'Région sanitaire' },
  { cle: 'DISTRICT_LOCALITE', valeur: '', description: 'Ville / localité du siège' },
  { cle: 'DISTRICT_ADRESSE', valeur: '', description: 'Adresse du siège' },
  { cle: 'DISTRICT_LATITUDE', valeur: '', description: 'Latitude GPS du siège (degrés décimaux)' },
  { cle: 'DISTRICT_LONGITUDE', valeur: '', description: 'Longitude GPS du siège (degrés décimaux)' },
  { cle: 'DISTRICT_RESPONSABLE', valeur: '', description: 'Responsable du district (directeur / médecin-chef)' },
  { cle: 'DISTRICT_TELEPHONE', valeur: '', description: 'Téléphone du district' },
  { cle: 'DISTRICT_EMAIL', valeur: '', description: 'E-mail du district' },
];

// ---------------------------------------------------------------------------
// Types de centres de santé (modifiables ensuite dans Paramétrage > Types de centres)
// ---------------------------------------------------------------------------
const typesCentre = [
  { code: 'CHR', libelle: 'Centre hospitalier régional' },
  { code: 'HG', libelle: 'Hôpital général' },
  { code: 'CSU', libelle: 'Centre de santé urbain' },
  { code: 'CSU-COM', libelle: 'Centre de santé urbain communautaire' },
  { code: 'CSR', libelle: 'Centre de santé rural' },
  { code: 'DISP', libelle: 'Dispensaire' },
  { code: 'MAT', libelle: 'Maternité' },
  { code: 'INFIRM', libelle: 'Infirmerie' },
];

async function main() {
  // 1. Profils : créés ou mis à jour (les droits ne sont mis qu'à la création,
  //    pour ne pas écraser ceux modifiés ensuite dans l'application)
  for (const profil of profils) {
    const droits = droitsDeDepart[profil.code];
    await prisma.role.upsert({
      where: { code: profil.code },
      update: profil,
      create: { ...profil, permissions: droits ? JSON.stringify(droits) : null },
    });
  }

  // 2. Paramètres : créés seulement s'ils n'existent pas (update vide)
  for (const parametre of parametres) {
    await prisma.parametre.upsert({
      where: { cle: parametre.cle },
      update: {},
      create: parametre,
    });
  }

  // 3. Types de centres : créés seulement s'ils n'existent pas
  for (const type of typesCentre) {
    await prisma.typeCentre.upsert({ where: { code: type.code }, update: {}, create: type });
  }

  // 4. Compte administrateur
  //    Mot de passe : variable ADMIN_PASSWORD si elle existe, sinon "Admin@2026".
  //    ⚠ À changer dès la première connexion.
  const profilAdmin = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const motDePasse = process.env.ADMIN_PASSWORD || 'Admin@2026';

  // Fiche personnel de l'administrateur (chaque compte appartient à un membre du personnel)
  const personnelAdmin = await prisma.personnel.upsert({
    where: { matricule: 'PER-0001' },
    update: {},
    create: { matricule: 'PER-0001', nom: 'Administrateur', prenoms: 'Système' },
  });

  await prisma.utilisateur.upsert({
    where: { login: 'admin' },
    update: {}, // si le compte existe déjà, on ne touche pas à son mot de passe
    create: {
      login: 'admin',
      nom: 'Administrateur',
      prenoms: 'Système',
      motDePasseHash: await bcrypt.hash(motDePasse, 10), // empreinte, jamais en clair
      roleId: profilAdmin.id,
      personnelId: personnelAdmin.id,
    },
  });

  console.log('Données de départ créées : profils, paramètres, types de centres et compte admin.');
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
