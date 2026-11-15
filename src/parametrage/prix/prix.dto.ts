/** Données attendues pour enregistrer un NOUVEAU PRIX (achat ou vente). */
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Nouveau prix d'ACHAT (prix payé par le district au fournisseur). */
export class CreerPrixAchatDto {
  @IsInt()
  medicamentId!: number;

  /** Facultatif : prix propre à un fournisseur */
  @IsOptional() @IsInt()
  fournisseurId?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le prix doit être un nombre' })
  @Min(0, { message: 'Le prix ne peut pas être négatif' })
  prix!: number;

  /** Date à partir de laquelle le prix s'applique, format AAAA-MM-JJ */
  @IsDateString({}, { message: "La date d'effet n'est pas valide" })
  dateEffet!: string;
}

/** Nouveau prix de VENTE (prix appliqué aux centres de santé). */
export class CreerPrixVenteDto {
  @IsInt()
  medicamentId!: number;

  /**
   * Facultatif : prix SPÉCIFIQUE à un centre.
   * Vide = prix général valable pour tous les centres.
   * (Possible seulement si le paramètre PRIX_VENTE_PAR_CENTRE vaut "true".)
   */
  @IsOptional() @IsInt()
  centreId?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le prix doit être un nombre' })
  @Min(0, { message: 'Le prix ne peut pas être négatif' })
  prix!: number;

  @IsDateString({}, { message: "La date d'effet n'est pas valide" })
  dateEffet!: string;
}

/**
 * CORRECTION d'un prix en cours (erreur de saisie) : nouveau montant + motif.
 * Le prix est corrigé sur place (pas de nouvelle ligne dans l'historique) ;
 * l'ancien montant et le motif sont gardés dans le journal d'audit.
 */
export class CorrigerPrixDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le prix doit être un nombre' })
  @Min(0, { message: 'Le prix ne peut pas être négatif' })
  prix!: number;

  @IsString()
  @IsNotEmpty({ message: 'Le motif de la correction est obligatoire' })
  @MaxLength(255)
  motif!: string;
}
