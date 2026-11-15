/*
  MODULE SUPERVISIONS ET INVENTAIRES DANS LES CENTRES
  - supervisions : motif de renvoi en brouillon, auteur et date de la DÉCISION ;
  - factures : supervisionOrigineId (facture d'écart annulée : la supervision
    est libérée pour une nouvelle décision, le lien reste mémorisé) ;
  - paramètre VALORISATION_ECARTS : PRIX_VENTE (défaut) ou PRIX_ACHAT.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[supervisions] ADD
    [motifRenvoi] NVARCHAR(500) NULL,
    [decidePar] INT NULL,
    [dateDecision] DATETIME2 NULL;

ALTER TABLE [dbo].[factures] ADD [supervisionOrigineId] INT NULL;

INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
SELECT N'VALORISATION_ECARTS', N'PRIX_VENTE', N'Prix utilisé pour valoriser les écarts de supervision (PRIX_VENTE ou PRIX_ACHAT)', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = N'VALORISATION_ECARTS');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
