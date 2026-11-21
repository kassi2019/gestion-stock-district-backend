/*
  Codes-barres des médicaments (nov. 2026) :
  scan des boîtes à la création du médicament, à la réception et à la facture manuelle.
  Un médicament peut avoir plusieurs codes ; un code n'appartient qu'à un médicament.
*/
BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[codes_barres] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(50) NOT NULL,
    [medicamentId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [codes_barres_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [codes_barres_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [codes_barres_code_key] UNIQUE NONCLUSTERED ([code])
);

CREATE NONCLUSTERED INDEX [codes_barres_medicamentId_idx] ON [dbo].[codes_barres]([medicamentId]);

ALTER TABLE [dbo].[codes_barres] ADD CONSTRAINT [codes_barres_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
