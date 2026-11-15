/**
 * =============================================================================
 * DONNÉES ATTENDUES — MODULE 07 FACTURATION ET COMPTES CLIENTS
 * =============================================================================
 * Montants en FCFA.
 * =============================================================================
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MODE_PAIEMENT } from '../common/constants';

// -----------------------------------------------------------------------------
// FACTURES
// -----------------------------------------------------------------------------

/** Génération des factures de rapports validés (un ou plusieurs rapports). */
export class GenererFacturesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un rapport à facturer' })
  @IsInt({ each: true })
  rapportIds!: number[];

  /** Date d'émission (par défaut : aujourd'hui). */
  @IsOptional()
  @IsDateString({}, { message: "Date d'émission invalide" })
  dateEmission?: string;
}

export class AnnulerDto {
  @IsString({ message: "Indiquez le motif de l'annulation" })
  @MaxLength(255)
  motif!: string;
}

// -----------------------------------------------------------------------------
// PAIEMENTS ET AVANCES
// -----------------------------------------------------------------------------

export class ImputationDto {
  @IsInt()
  factureId!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Montant imputé invalide' })
  @Min(0.01, { message: 'Le montant imputé doit être positif' })
  montant!: number;
}

/**
 * Paiement d'un centre. La part non imputée sur des factures devient une
 * AVANCE (utilisable plus tard). Aucune imputation = avance.
 */
export class CreerPaiementDto {
  @IsInt({ message: 'Choisissez le centre de santé' })
  centreId!: number;

  @IsDateString({}, { message: 'Date du paiement invalide' })
  datePaiement!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Montant invalide' })
  @Min(1, { message: 'Le montant doit être positif' })
  @Max(1_000_000_000_000)
  montant!: number;

  @IsIn(Object.values(MODE_PAIEMENT), { message: 'Mode de paiement invalide' })
  mode!: string;

  /** N° de chèque, de virement, de transaction mobile money... */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  observations?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImputationDto)
  imputations?: ImputationDto[];
}

/** Imputation d'une avance (montant non imputé d'un paiement) sur des factures. */
export class ImputerDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Indiquez au moins une facture' })
  @ValidateNested({ each: true })
  @Type(() => ImputationDto)
  imputations!: ImputationDto[];
}
