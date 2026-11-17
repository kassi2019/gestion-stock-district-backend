/*
  Spec nov. 2026 — étape 4 : distingue les rapports du NOUVEAU circuit
  (rapport centre saisi par le district, qui génère la facture-sortie)
  des anciens rapports de consommation. Les rapports existants restent à false.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[rapports_consommation] ADD [nouveauCircuit] BIT NOT NULL CONSTRAINT [rapports_consommation_nouveauCircuit_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
