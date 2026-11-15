/*
  MODULE FACTURATION ET COMPTES CLIENTS
  1. Unicité « une facture par rapport / par supervision » : sur SQL Server une
     contrainte UNIQUE n'accepte qu'UNE seule valeur NULL (la 2e facture sans
     supervision serait refusée). Remplacée par un index unique FILTRÉ
     (seulement les valeurs renseignées).
  2. Annulation tracée d'une facture (date, auteur) ; à l'annulation, le lien
     au rapport passe dans rapportOrigineId (le rapport peut être refacturé).
  3. Annulation tracée d'un paiement (motif, date, auteur).
  4. Paramètre DELAI_PAIEMENT_JOURS (échéance des factures, 30 jours).
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[factures] DROP CONSTRAINT [factures_rapportId_key];
ALTER TABLE [dbo].[factures] DROP CONSTRAINT [factures_supervisionId_key];
CREATE UNIQUE NONCLUSTERED INDEX [factures_rapportId_key] ON [dbo].[factures]([rapportId]) WHERE [rapportId] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [factures_supervisionId_key] ON [dbo].[factures]([supervisionId]) WHERE [supervisionId] IS NOT NULL;

ALTER TABLE [dbo].[factures] ADD
    [rapportOrigineId] INT NULL,
    [annulePar] INT NULL,
    [dateAnnulation] DATETIME2 NULL;

ALTER TABLE [dbo].[paiements] ADD
    [motifAnnulation] NVARCHAR(255) NULL,
    [annulePar] INT NULL,
    [dateAnnulation] DATETIME2 NULL;

INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
SELECT N'DELAI_PAIEMENT_JOURS', N'30', N'Délai de paiement des factures (jours après émission)', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = N'DELAI_PAIEMENT_JOURS');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
