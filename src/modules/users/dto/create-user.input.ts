import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

@InputType()
export class CreateUserInput {
  @Field()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(191)
  email: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;
}
