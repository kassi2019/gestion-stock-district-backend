/**
 * =============================================================================
 * VIDER LES OPÉRATIONS DE LA BASE (garder le PARAMÉTRAGE)
 * =============================================================================
 * Sert à repartir d'une base « propre » pour un cas pratique ou une démonstration.
 *
 * GARDÉ  : paramètres généraux, centres, types de centres, fournisseurs,
 *          médicaments (familles, formes, unités), prix d'achat et de vente,
 *          utilisateurs, profils (rôles), personnel, fonctions.
 * VIDÉ   : réceptions, lots, stock du dépôt et ses mouvements, inventaires,
 *          inventaire initial, stock des centres et ses mouvements, anciennes
 *          livraisons, rapports centre, transferts, factures, paiements,
 *          supervisions, pièces jointes (et leurs fichiers), compteurs de
 *          numérotation (les numéros repartent à 00001), journal d'audit.
 *          L'inventaire initial est déverrouillé.
 *
 * Option --prix-depuis=AAAA-MM-JJ : le PREMIER prix de chaque médicament
 * (achat et vente) commence à cette date. Utile pour saisir des opérations
 * datées dans le passé (ex. un rapport d'octobre alors que les prix ont été
 * saisis en novembre).
 *
 * UTILISATION (dans le dossier stock-district-backend) :
 *     node scripts/vider-operations.js --oui
 *     node scripts/vider-operations.js --oui --prix-depuis=2026-01-01
 * Sans --oui, le script affiche ce qu'il ferait sans rien supprimer.
 *
 * ⚠ IRRÉVERSIBLE : faites une sauvegarde de la base avant (BACKUP DATABASE).
 *   Ne jamais lancer sur la base de PRODUCTION sans l'accord du district.
 * =============================================================================
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Tables d'opérations à vider (noms SQL Server)
const TABLES = [
  'imputations',
  'paiements',
  'lignes_supervision',
  'supervision_agents',
  'supervisions',
  'pieces_jointes',
  'lignes_facture',
  'factures',
  'transferts_centre',
  'lignes_consommation',
  'rapports_consommation',
  'inventaire_initial',
  'mouvements_stock_centre',
  'stocks_centre',
  'lignes_livraison',
  'livraisons',
  'lignes_inventaire_depot',
  'inventaires_depot',
  'mouvements_stock',
  'stocks_depot',
  'lignes_reception',
  'receptions',
  'lots',
  'compteurs',
  'journal_audit',
];

async function main() {
  const confirme = process.argv.includes('--oui');
  const optionPrix = process.argv.find((a) => a.startsWith('--prix-depuis='));
  const prixDepuis = optionPrix ? optionPrix.split('=')[1] : null;
  if (prixDepuis && !/^\d{4}-\d{2}-\d{2}$/.test(prixDepuis)) throw new Error('Date attendue : --prix-depuis=AAAA-MM-JJ');

  const prisma = new PrismaClient();
  try {
    // Base visée (pour éviter une erreur de cible)
    const [{ base }] = await prisma.$queryRawUnsafe('SELECT DB_NAME() AS base');
    console.log(`Base : ${base}`);
    for (const t of TABLES) {
      const [{ n }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM [dbo].[${t}]`);
      console.log(`  ${t.padEnd(26)} ${n} ligne(s)`);
    }
    if (!confirme) {
      console.log('\nRien n\'a été supprimé. Relancez avec --oui pour vider ces tables.');
      return;
    }

    await prisma.$transaction(
      async (tx) => {
        // Contraintes suspendues le temps du vidage (les tables se référencent entre elles)
        for (const t of TABLES) await tx.$executeRawUnsafe(`ALTER TABLE [dbo].[${t}] NOCHECK CONSTRAINT ALL`);
        for (const t of TABLES) await tx.$executeRawUnsafe(`DELETE FROM [dbo].[${t}]`);
        for (const t of TABLES) await tx.$executeRawUnsafe(`ALTER TABLE [dbo].[${t}] WITH CHECK CHECK CONSTRAINT ALL`);

        // Inventaire initial de nouveau modifiable
        await tx.$executeRawUnsafe(`DELETE FROM [dbo].[parametres] WHERE cle = 'INVENTAIRE_INITIAL_VERROUILLE'`);

        // Premier prix de chaque médicament (achat / vente) ramené à la date demandée
        if (prixDepuis) {
          await tx.$executeRawUnsafe(`
            UPDATE p SET dateEffet = '${prixDepuis}'
            FROM [dbo].[prix_achat] p
            WHERE p.dateEffet > '${prixDepuis}' AND NOT EXISTS (
              SELECT 1 FROM [dbo].[prix_achat] q
              WHERE q.medicamentId = p.medicamentId
                AND ISNULL(q.fournisseurId, -1) = ISNULL(p.fournisseurId, -1)
                AND q.dateEffet < p.dateEffet)`);
          await tx.$executeRawUnsafe(`
            UPDATE p SET dateEffet = '${prixDepuis}'
            FROM [dbo].[prix_vente] p
            WHERE p.dateEffet > '${prixDepuis}' AND NOT EXISTS (
              SELECT 1 FROM [dbo].[prix_vente] q
              WHERE q.medicamentId = p.medicamentId
                AND ISNULL(q.centreId, -1) = ISNULL(p.centreId, -1)
                AND q.dateEffet < p.dateEffet)`);
        }
      },
      { timeout: 120000 },
    );

    // Fichiers des pièces jointes (dossier « fichiers » du backend)
    const dossier = path.join(__dirname, '..', 'fichiers');
    if (fs.existsSync(dossier)) {
      for (const element of fs.readdirSync(dossier)) fs.rmSync(path.join(dossier, element), { recursive: true, force: true });
    }

    console.log('\nOpérations vidées. Paramétrage et utilisateurs conservés.');
    if (prixDepuis) console.log(`Premiers prix ramenés au ${prixDepuis}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('ERREUR :', e.message);
  process.exit(1);
});
