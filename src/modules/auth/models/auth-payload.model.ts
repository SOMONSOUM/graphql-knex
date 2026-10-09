import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('AuthPayload')
export class AuthPayloadModel {
  @Field()
  accessToken: string;
  @Field()
  refreshToken: string;
}
