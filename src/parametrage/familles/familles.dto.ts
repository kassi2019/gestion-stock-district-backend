/** Données attendues pour créer ou modifier une FAMILLE de produits (ex. Antibiotiques). */
import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreerFamilleDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (voir common/codes-auto.ts) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le libellé est obligatoire' })
  @MaxLength(100)
  libelle!: string;

  /** Catégorie plus large (ex. "Anti-infectieux") — facultative */
  @IsOptional() @IsString() @MaxLength(100)
  categorie?: string;
}

export class ModifierFamilleDto extends PartialType(CreerFamilleDto) {}
