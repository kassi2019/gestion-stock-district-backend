/** Données attendues pour créer ou modifier un FOURNISSEUR. */
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreerFournisseurDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (voir common/codes-auto.ts) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'La raison sociale est obligatoire' })
  @MaxLength(150)
  raisonSociale!: string;

  /** Nom de la personne à contacter */
  @IsOptional() @IsString() @MaxLength(150)
  contact?: string;

  @IsOptional() @IsString() @MaxLength(30)
  telephone?: string;

  @IsOptional() @IsEmail({}, { message: "L'adresse e-mail n'est pas valide" })
  email?: string;

  @IsOptional() @IsString() @MaxLength(255)
  adresse?: string;
}

/** Modification : tous les champs facultatifs, + activer/désactiver. */
export class ModifierFournisseurDto extends PartialType(CreerFournisseurDto) {
  @IsOptional() @IsBoolean()
  actif?: boolean;
}
