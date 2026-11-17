/*
  Spec nov. 2026 « Réception, Facturation et Rapports » — ÉTAPE 1 (ajouts seulement, rien n'est supprimé).
  - Rapport centre : colonnes SI, R, P, T, SDU, CMM, QaC, quantité validée, prix d'achat figé ;
    réouverture d'un rapport validé (administrateur, avec motif).
  - Facture = sortie de stock du district : origine (RAPPORT / MANUELLE), sortieStock,
    avoir rattaché à sa facture ; lignes avec lot et prix d'achat figé.
  - Nouvelles tables : transferts_centre, inventaire_initial.
  - Nouveaux paramètres : MOIS_STOCK_MAX (2) et MOIS_CMM (3).
  NB : les index uniques filtrés factures_rapportId_key / factures_supervisionId_key
  (migration facturation) sont conservés tels quels.
*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[factures] ADD [factureOrigineId] INT,
[origine] NVARCHAR(30),
[sortieStock] BIT NOT NULL CONSTRAINT [factures_sortieStock_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[lignes_consommation] ADD [cmm] DECIMAL(18,2) NOT NULL CONSTRAINT [lignes_consommation_cmm_df] DEFAULT 0,
[pertes] INT NOT NULL CONSTRAINT [lignes_consommation_pertes_df] DEFAULT 0,
[prixAchat] DECIMAL(18,2),
[quantiteProposee] INT NOT NULL CONSTRAINT [lignes_consommation_quantiteProposee_df] DEFAULT 0,
[quantiteValidee] INT,
[recu] INT NOT NULL CONSTRAINT [lignes_consommation_recu_df] DEFAULT 0,
[stockDisponible] INT NOT NULL CONSTRAINT [lignes_consommation_stockDisponible_df] DEFAULT 0,
[stockInitial] INT NOT NULL CONSTRAINT [lignes_consommation_stockInitial_df] DEFAULT 0,
[transferts] INT NOT NULL CONSTRAINT [lignes_consommation_transferts_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[lignes_facture] ADD [lotId] INT,
[prixAchat] DECIMAL(18,2);

-- AlterTable
ALTER TABLE [dbo].[rapports_consommation] ADD [dateReouverture] DATETIME2,
[motifReouverture] NVARCHAR(500),
[reouvertPar] INT;

-- CreateTable
CREATE TABLE [dbo].[transferts_centre] (
    [id] INT NOT NULL IDENTITY(1,1),
    [annee] INT NOT NULL,
    [mois] INT NOT NULL,
    [centreSourceId] INT NOT NULL,
    [centreDestinationId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [quantite] INT NOT NULL,
    [motif] NVARCHAR(255),
    [utilisateurId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [transferts_centre_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [transferts_centre_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[inventaire_initial] (
    [id] INT NOT NULL IDENTITY(1,1),
    [centreId] INT,
    [medicamentId] INT NOT NULL,
    [numeroLot] NVARCHAR(50),
    [datePeremption] DATE,
    [quantite] INT NOT NULL,
    [dateInventaire] DATE NOT NULL,
    [utilisateurId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [inventaire_initial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [inventaire_initial_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transferts_centre_annee_mois_idx] ON [dbo].[transferts_centre]([annee], [mois]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [inventaire_initial_centreId_medicamentId_idx] ON [dbo].[inventaire_initial]([centreId], [medicamentId]);

-- AddForeignKey
ALTER TABLE [dbo].[rapports_consommation] ADD CONSTRAINT [rapports_consommation_reouvertPar_fkey] FOREIGN KEY ([reouvertPar]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[factures] ADD CONSTRAINT [factures_factureOrigineId_fkey] FOREIGN KEY ([factureOrigineId]) REFERENCES [dbo].[factures]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_facture] ADD CONSTRAINT [lignes_facture_lotId_fkey] FOREIGN KEY ([lotId]) REFERENCES [dbo].[lots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transferts_centre] ADD CONSTRAINT [transferts_centre_centreSourceId_fkey] FOREIGN KEY ([centreSourceId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transferts_centre] ADD CONSTRAINT [transferts_centre_centreDestinationId_fkey] FOREIGN KEY ([centreDestinationId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transferts_centre] ADD CONSTRAINT [transferts_centre_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transferts_centre] ADD CONSTRAINT [transferts_centre_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inventaire_initial] ADD CONSTRAINT [inventaire_initial_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inventaire_initial] ADD CONSTRAINT [inventaire_initial_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inventaire_initial] ADD CONSTRAINT [inventaire_initial_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Paramètres (créés seulement s'ils n'existent pas)
IF NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = 'MOIS_STOCK_MAX')
    INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
    VALUES ('MOIS_STOCK_MAX', '2', N'Nombre de mois de stock maximum (N) : quantité à livrer = N x CMM - SDU', CURRENT_TIMESTAMP);
IF NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = 'MOIS_CMM')
    INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
    VALUES ('MOIS_CMM', '3', N'Nombre de mois pour le calcul de la consommation mensuelle moyenne (CMM)', CURRENT_TIMESTAMP);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

