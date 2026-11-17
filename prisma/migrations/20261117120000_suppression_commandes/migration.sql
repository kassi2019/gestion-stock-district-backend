/*
  Spec nov. 2026 — ÉTAPE 7 (nettoyage) : SUPPRESSION DES COMMANDES.
  Le district commande dans l'application nationale et les centres ne commandent
  plus (le rapport centre calcule la quantité à livrer).
  - Tables supprimées : commandes_fournisseur, lignes_commande_fournisseur,
    commandes_centre, lignes_commande_centre (avec leurs données).
  - Colonnes supprimées : receptions.commandeId, livraisons.commandeId
    (les réceptions et les bons de livraison sont conservés).
  - Pièces jointes des commandes : lignes supprimées (les fichiers restent sur le disque).
  - Bons de livraison encore en BROUILLON : passés à ANNULEE (on ne peut plus
    les valider ; le stock n'avait pas bougé).
  NB : les index uniques filtrés factures_rapportId_key / factures_supervisionId_key sont conservés.
*/
BEGIN TRY

BEGIN TRAN;

-- Données : pièces jointes des commandes, livraisons en préparation
DELETE FROM [dbo].[pieces_jointes] WHERE [entiteType] IN ('CommandeFournisseur', 'CommandeCentre');
UPDATE [dbo].[livraisons] SET [statut] = 'ANNULEE', [observations] = CONCAT([observations], N' [Annulée à la suppression des commandes — spec nov. 2026]') WHERE [statut] = 'BROUILLON';

-- DropForeignKey
ALTER TABLE [dbo].[commandes_centre] DROP CONSTRAINT [commandes_centre_centreId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[commandes_fournisseur] DROP CONSTRAINT [commandes_fournisseur_fournisseurId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[commandes_fournisseur] DROP CONSTRAINT [commandes_fournisseur_utilisateurId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[lignes_commande_centre] DROP CONSTRAINT [lignes_commande_centre_commandeId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[lignes_commande_centre] DROP CONSTRAINT [lignes_commande_centre_medicamentId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[lignes_commande_fournisseur] DROP CONSTRAINT [lignes_commande_fournisseur_commandeId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[lignes_commande_fournisseur] DROP CONSTRAINT [lignes_commande_fournisseur_medicamentId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[livraisons] DROP CONSTRAINT [livraisons_commandeId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[receptions] DROP CONSTRAINT [receptions_commandeId_fkey];

-- AlterTable
ALTER TABLE [dbo].[livraisons] DROP COLUMN [commandeId];

-- AlterTable
ALTER TABLE [dbo].[receptions] DROP COLUMN [commandeId];

-- DropTable
DROP TABLE [dbo].[commandes_centre];

-- DropTable
DROP TABLE [dbo].[commandes_fournisseur];

-- DropTable
DROP TABLE [dbo].[lignes_commande_centre];

-- DropTable
DROP TABLE [dbo].[lignes_commande_fournisseur];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

