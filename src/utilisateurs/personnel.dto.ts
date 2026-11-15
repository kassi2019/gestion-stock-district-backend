/**
 * Données attendues pour le PERSONNEL (module 02 Utilisateurs).
 * À la création, un compte utilisateur peut être créé en même temps
 * (champ « compte », facultatif).
 */
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CompteDto, MESSAGE_MATRICULE, REGLE_MATRICULE } from './utilisateurs.dto';

export class CreerPersonnelDto {
  /**
   * Matricule OBLIGATOIRE et unique.
   * Il sert d'IDENTIFIANT DE CONNEXION si la personne a un compte.
   */
  @IsString()
  @IsNotEmpty({ message: 'Le matricule est obligatoire' })
  @MaxLength(30)
  @Matches(REGLE_MATRICULE, { message: MESSAGE_MATRICULE })
  matricule!: string;

  @IsString()
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  @MaxLength(100)
  nom!: string;

  @IsString()
  @IsNotEmpty({ message: 'Les prénoms sont obligatoires' })
  @MaxLength(150)
  prenoms!: string;

  /** Fonction (table fonctions, gérée dans Paramétrage > Fonctions) */
  @IsOptional() @IsInt()
  fonctionId?: number;

  /** Lieu d'affectation : un centre de santé (vide = district / siège) */
  @IsOptional() @IsInt()
  centreId?: number;

  @IsOptional() @IsString() @MaxLength(30)
  telephone?: string;

  @IsOptional() @IsEmail({}, { message: "L'adresse e-mail n'est pas valide" })
  @MaxLength(150)
  email?: string;

  /**
   * Photo d'identité (facultative) : image au format
   * « data:image/jpeg;base64,... » (réduite à 256 px par l'écran).
   * null = retirer la photo.
   */
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, { message: "La photo n'est pas une image valide" })
  @MaxLength(700000, { message: 'La photo est trop lourde' })
  photo?: string;

  /** Facultatif : créer AUSSI un compte utilisateur pour cette personne */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompteDto)
  compte?: CompteDto;
}

/** Modification : tous les champs facultatifs (sans le compte), + activer/désactiver. */
export class ModifierPersonnelDto extends PartialType(OmitType(CreerPersonnelDto, ['compte'] as const)) {
  @IsOptional() @IsBoolean()
  actif?: boolean;
}
