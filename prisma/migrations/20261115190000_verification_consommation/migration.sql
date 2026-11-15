/*
  Rapports mensuels de consommation : VÉRIFICATION SUR PLACE.
  L'agent du district se déplace dans le centre pour contrôler les quantités
  déclarées : date de la visite, agents présents, quantité vérifiée par ligne.
  Si la quantité vérifiée est saisie, c'est elle qui est retenue (montant, stock).
  Aussi : motif du renvoi en brouillon (rapport à corriger par le centre).
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[rapports_consommation] ADD
    [dateVerification] DATE NULL,
    [verifiePar] INT NULL,
    [agentsVerification] NVARCHAR(500) NULL,
    [observationsVerification] NVARCHAR(MAX) NULL,
    [motifRenvoi] NVARCHAR(500) NULL;

ALTER TABLE [dbo].[rapports_consommation] ADD CONSTRAINT [rapports_consommation_verifiePar_fkey]
    FOREIGN KEY ([verifiePar]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[lignes_consommation] ADD
    [quantiteVerifiee] INT NULL,
    [commentaire] NVARCHAR(255) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
