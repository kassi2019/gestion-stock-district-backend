/**
 * Données attendues pour créer ou modifier un CENTRE DE SANTÉ.
 * Les étiquettes (@IsString, @IsOptional...) vérifient automatiquement les données.
 */
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreerCentreDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (voir common/codes-auto.ts) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  @MaxLength(150)
  nom!: string;

  /** Type de centre (identifiant dans la table types_centre) */
  @IsOptional() @IsInt()
  typeId?: number;

  @IsOptional() @IsString() @MaxLength(100)
  localite?: string;

  @IsOptional() @IsString() @MaxLength(255)
  adresse?: string;

  /** Latitude GPS en degrés décimaux (entre -90 et 90). Ex. 5.3600 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'La latitude doit être un nombre (6 décimales max.)' })
  @Min(-90, { message: 'La latitude doit être comprise entre -90 et 90' })
  @Max(90, { message: 'La latitude doit être comprise entre -90 et 90' })
  latitude?: number;

  /** Longitude GPS en degrés décimaux (entre -180 et 180). Ex. -4.0083 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'La longitude doit être un nombre (6 décimales max.)' })
  @Min(-180, { message: 'La longitude doit être comprise entre -180 et 180' })
  @Max(180, { message: 'La longitude doit être comprise entre -180 et 180' })
  longitude?: number;

  @IsOptional() @IsString() @MaxLength(150)
  responsable?: string;

  @IsOptional() @IsString() @MaxLength(30)
  telephone?: string;

  @IsOptional() @IsEmail({}, { message: "L'adresse e-mail n'est pas valide" })
  email?: string;
}

/** Modification : tous les champs deviennent facultatifs, + possibilité d'activer/désactiver. */
export class ModifierCentreDto extends PartialType(CreerCentreDto) {
  @IsOptional() @IsBoolean()
  actif?: boolean;
}
