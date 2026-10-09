import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from '@/modules/users/dto/create-user.input';

@InputType()
export class LoginInput {
  @Field()
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

@InputType()
export class RefreshTokenInput {
  @Field()
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  refreshToken: string;
}
