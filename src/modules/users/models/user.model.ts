import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Permission')
export class PermissionModel {
  @Field()
  action: string;

  @Field()
  resource: string;
}

@ObjectType('User')
export class UserModel {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field(() => String, { nullable: true })
  fullName: string | null;

  @Field(() => [String])
  roles: string[];

  @Field(() => [PermissionModel])
  permissions: PermissionModel[];

  @Field()
  isActive: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
