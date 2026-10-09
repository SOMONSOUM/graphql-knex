# NestJS 12 Production Guideline: GraphQL (Apollo) + Knex.js + MySQL + Redis + Kafka + Vitest

A from-scratch, production-oriented guide for a **code-first GraphQL API** built on **NestJS 12 (ESM)**, Apollo Server, Knex.js (MySQL), Redis (cache) and Kafka (domain events), tested with **Vitest**.

**What you get**

- NestJS 12 ESM project (`"type": "module"`), TypeScript 6, oxlint
- **Path-alias imports** (`#common/...`, `#users/...`) instead of `../../` relative imports, working in `tsc`, Node, the Knex CLI and Vitest
- **Vitest** (with SWC for decorator metadata) for unit and e2e tests
- Code-first GraphQL with Apollo Server 4 (depth limiting, introspection off in production, sanitized errors)
- Knex.js with migrations, repository pattern, soft delete, transactions, camelCase ⇄ snake_case mapping
- Argon2id password hashing, JWT access + refresh tokens with **rotation and reuse detection**, role-based access
- Three-tier throttling (Redis-backed, per resolver field)
- Redis read-through cache with explicit invalidation (fails soft)
- Kafka producer (`user.registered`) and consumer (idempotent, dead-letter topic) in a hybrid app
- Structured logging (pino), health endpoints, graceful shutdown
- Unit and e2e testing with Vitest, Dockerfile, CI, Kubernetes notes, production checklist

> **Assumptions.** Redis is used as a **cache** and Kafka for **domain-event pub/sub**. Package versions move quickly, so after installing check the peer dependencies of `@nestjs/graphql`, `@nestjs/apollo`, `@nestjs/throttler`, `@nest-lab/throttler-storage-redis` and `nestjs-pino`, and align `@apollo/server` / `graphql` with them. Install Nest packages with `^12.0.0` ranges so npm picks the newest 12.x patch release.

```
                     ┌─────────────────────────── NestJS (hybrid app) ───────────────────────────┐
 Client ── HTTP ───▶ │ Helmet/CORS ▶ Apollo /graphql ▶ Guards (Throttle, JWT, Roles) ▶ Resolvers │
 (GraphQL)           │                                       │                                   │
                     │                                   Services ──▶ Redis cache (ioredis)      │
                     │                                       │                                   │
                     │                                  Repositories ──▶ Knex ──▶ MySQL          │
                     │                                       │                                   │
                     │                       KafkaProducerService ──▶ Kafka ──▶ @EventPattern    │
                     │                                                          consumers        │
                     └───────────────────────────────────────────────────────────────────────────┘
                       GET /health/live, /health/ready (plain REST, for load balancers / k8s)
```

## Table of Contents

1. [Project Setup (Nest 12, ESM, path aliases)](#1-project-setup)
2. [Folder Structure](#2-folder-structure)
3. [Local Infrastructure (Docker Compose)](#3-local-infrastructure-docker-compose)
4. [Environment Configuration](#4-environment-configuration)
5. [Knex + MySQL Setup](#5-knex--mysql-setup)
6. [Base Fields, Soft Delete & BaseRepository](#6-base-fields-soft-delete--baserepository)
7. [Errors: Codes, Exceptions, Normalization, GraphQL `formatError`](#7-errors-codes-exceptions-normalization-graphql-formaterror)
8. [Validation](#8-validation)
9. [GraphQL Module (Apollo)](#9-graphql-module-apollo)
10. [Pagination](#10-pagination)
11. [Users Module](#11-users-module)
12. [Password Hashing with Argon2](#12-password-hashing-with-argon2)
13. [Authentication & Authorization](#13-authentication--authorization)
14. [Throttling](#14-throttling)
15. [Redis Cache](#15-redis-cache)
16. [Kafka Events](#16-kafka-events)
17. [DataLoader (N+1)](#17-dataloader-n1)
18. [Logging & Interceptors](#18-logging--interceptors)
19. [Health Checks](#19-health-checks)
20. [AppModule & main.ts](#20-appmodule--maints)
21. [Example Operations](#21-example-operations)
22. [Testing with Vitest](#22-testing-with-vitest)
23. [Security Hardening](#23-security-hardening)
24. [Docker, CI/CD & Deployment](#24-docker-cicd--deployment)
25. [Production Checklist](#25-production-checklist)

---

## 1. Project Setup

### 1.1 Versions and prerequisites

| Tool | Version |
|---|---|
| Node.js | **22.12+** (22 LTS recommended; 20.19+ also works) |
| NestJS | **12.x**: `@nestjs/common`, `core`, `platform-express`, `microservices`, `testing` at `^12.0.0` |
| `@nestjs/graphql`, `@nestjs/apollo` | `^14.0.0` (the Nest 12 line) |
| `@nestjs/config` | `^12.0.0` (validation is Standard Schema based; **Joi must be v18+**) |
| TypeScript | 6.x |
| Test runner | **Vitest** (latest) + `unplugin-swc` |
| Linter | oxlint (the Nest 12 ESM default) |

Use `^12.0.0` ranges. npm resolves the newest 12.x patch release (for example 12.0.1), and the lockfile pins what you actually deploy.

NestJS 12 packages are **ESM-only**, and a new Nest 12 project is an ESM project with Vitest by default. This guide follows that path end to end: `"type": "module"`, `NodeNext` module resolution, Vitest for unit and e2e tests, and **`#` path aliases instead of `../../` imports**.

### 1.2 Create the project and install packages

```bash
npm i -g @nestjs/cli@latest
nest new my-api --package-manager npm   # choose "ESM (ES Modules) [with vitest]" when prompted
cd my-api
```

Upgrading an existing v11 project instead? Run `nest upgrade` (alias `nest update`). It bumps the Nest packages, but it deliberately does **not** convert your app to ESM or Vitest, so follow this section by hand for those parts.

```bash
# Core (Joi 18+ implements Standard Schema, which @nestjs/config 12 requires)
npm install @nestjs/config@^12 joi@^18 dotenv

# GraphQL (Apollo)
npm install @nestjs/graphql@^14 @nestjs/apollo@^14 @apollo/server graphql graphql-depth-limit dataloader
npm install -D @types/graphql-depth-limit

# Database
npm install knex mysql2

# Auth
npm install @nestjs/jwt @nestjs/passport passport passport-jwt argon2
npm install -D @types/passport-jwt

# Validation, throttling, security
npm install class-validator class-transformer @nestjs/throttler @nest-lab/throttler-storage-redis helmet compression
npm install -D @types/compression

# Logging
npm install nestjs-pino pino-http
npm install -D pino-pretty

# Redis + Kafka
npm install ioredis
npm install @nestjs/microservices kafkajs

# Testing (Vitest) and linting
npm install -D vitest unplugin-swc @swc/core @vitest/coverage-v8 supertest @types/supertest oxlint
```

**Check peer dependencies.** `@nestjs/throttler`, `@nest-lab/throttler-storage-redis`, `nestjs-pino`, `@nestjs/jwt` and `@nestjs/passport` each declare a Nest peer range. Run `npm ls` and confirm every one allows Nest 12. If npm reports `ERESOLVE`, upgrade that package to the release that supports Nest 12 instead of forcing the install.

There is no `ts-node` or `tsconfig-paths` here. Nothing in this setup runs TypeScript directly: the app, migrations and seeds all run from the compiled `dist/`.

### 1.3 package.json

```json
{
  "name": "my-api",
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "imports": {
    "#src/*":      "./dist/*.js",
    "#common/*":   "./dist/common/*.js",
    "#config/*":   "./dist/config/*.js",
    "#database/*": "./dist/database/*.js",
    "#gql/*":      "./dist/graphql/*.js",
    "#health/*":   "./dist/health/*.js",
    "#kafka/*":    "./dist/kafka/*.js",
    "#auth/*":     "./dist/modules/auth/*.js",
    "#users/*":    "./dist/modules/users/*.js"
  },
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "oxlint src test",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts",
    "knex": "knex --knexfile dist/database/knexfile.js",
    "migration:make": "npm run build && npm run knex -- migrate:make -x ts --migrations-directory src/database/migrations",
    "migration:latest": "npm run build && npm run migration:latest:prod",
    "migration:latest:prod": "knex --knexfile dist/database/knexfile.js migrate:latest",
    "migration:rollback": "npm run build && npm run knex -- migrate:rollback",
    "migration:status": "npm run build && npm run knex -- migrate:status",
    "seed:run": "npm run build && npm run knex -- seed:run"
  }
}
```

The `imports` block is what Node uses **at runtime** (including inside the Knex CLI and the Docker image). It points at `dist/`. Keep the rest of the scaffolded `dependencies` and `devDependencies` that `nest new` generated.

### 1.4 tsconfig.json, tsconfig.build.json, nest-cli.json

**tsconfig.json** (editor, type-checking and tests; includes `src` and `test`)

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "outDir": "./dist",
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictPropertyInitialization": false,
    "esModuleInterop": true,
    "isolatedModules": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "skipLibCheck": true,
    "sourceMap": true,
    "incremental": true,
    "paths": {
      "#src/*":      ["./src/*.js"],
      "#common/*":   ["./src/common/*.js"],
      "#config/*":   ["./src/config/*.js"],
      "#database/*": ["./src/database/*.js"],
      "#gql/*":      ["./src/graphql/*.js"],
      "#health/*":   ["./src/health/*.js"],
      "#kafka/*":    ["./src/kafka/*.js"],
      "#auth/*":     ["./src/modules/auth/*.js"],
      "#users/*":    ["./src/modules/users/*.js"]
    }
  },
  "include": ["src/**/*", "test/**/*", "vitest.*.ts"]
}
```

**tsconfig.build.json** (what `nest build` compiles)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

**nest-cli.json**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true, "tsConfigPath": "tsconfig.build.json" }
}
```

Why the `.js` at the end of every `paths` target: under `NodeNext`, TypeScript does not add file extensions for you in ESM, but it does map `x.js` to `x.ts`. The alias *specifiers* you write in code have no extension (`#common/utils/hash.util`).

`useDefineForClassFields: false` keeps the classic decorator-friendly class-field behaviour that Nest, class-validator and GraphQL decorators were written for.

### 1.5 Path aliases: the rules

| Alias | Folder |
|---|---|
| `#src/*` | `src/*` (only for root files such as `app.module`) |
| `#common/*` | `src/common/*` |
| `#config/*` | `src/config/*` |
| `#database/*` | `src/database/*` |
| `#gql/*` | `src/graphql/*` |
| `#health/*` | `src/health/*` |
| `#kafka/*` | `src/kafka/*` |
| `#auth/*` | `src/modules/auth/*` |
| `#users/*` | `src/modules/users/*` |

1. **Every import of a project file uses an alias**, never `../x` or `./x`. Example: `import { UsersService } from '#users/users.service';`.
2. **No file extension** in alias specifiers: `#common/utils/hash.util`, not `...hash.util.js`.
3. Packages keep their normal names (`@nestjs/common`, `knex`, ...). Aliases never collide with npm packages because they start with `#`.
4. **A new top-level folder (or module) means updating three places**: `package.json#imports` (runtime), `tsconfig.json#paths` (compiler and editor) and `vitest.aliases.ts` (tests, §22).
5. The only files that use relative imports are the root tool configs (`vitest.config*.ts`), because they live outside `src/`.

**Why `#` and not `@`.** Node resolves aliases from the `imports` field of `package.json`, and that field only accepts specifiers that start with `#`. TypeScript `paths` alone does not help at runtime: `tsc` leaves the alias in the emitted JavaScript, so Node, the Knex CLI and the Docker image would fail with "module not found". Using the native `#` mechanism means **no build-time rewriting plugin** and the same specifier works in the compiler, Node, the Knex CLI and Vitest.

### 1.6 ESM rules and gotchas

- **No `__dirname` / `__filename` / `require`.** Use `import.meta.dirname` and `import.meta.filename` (Node 20.11+). `knex.config.ts` does this (§5.2).
- **`import type` for types.** Interfaces and type aliases must be imported with `import type`, especially when they appear in a *decorated* signature (a resolver argument, `@Payload()`, `@Context()`). With SWC/`isolatedModules` a plain `import { JwtPayload }` of an interface is kept for decorator metadata, and Node then fails at startup with *"does not provide an export named 'JwtPayload'"*. Classes (DTOs, services) are real values and use normal imports.
- **CommonJS packages.** Prefer default imports for CJS-only libraries (`import Joi from 'joi'`, `import passportJwt from 'passport-jwt'`). Named imports from CJS only work when Node can detect them statically. If you see *"Named export 'X' not found"* at startup, switch that import to a default import and destructure.
- **Circular imports plus decorator metadata.** In ESM a class referenced in `design:type` metadata before its module finishes loading throws a TDZ error. Keep GraphQL models and entities free of import cycles, and use lazy `@Field(() => X)` thunks for cross-references.
- **Jest is not used.** The Nest 12 packages are ESM-only, so Jest needs workarounds to load them. This guide uses Vitest (§22).
- **Top-level `await` and `import.meta` work**, but keep `main.ts` in the `bootstrap()` pattern for clarity.

### 1.7 Prefer `@` prefixes anyway?

Node cannot resolve `@common/*` through `package.json`, so you need an extra rewrite step: rename the keys in `tsconfig.json#paths` to `@common/*` and so on, delete the `imports` block, and run `tsc-alias` after the build (`nest build && tsc-alias -p tsconfig.build.json --resolve-full-paths`). `nest start --watch`, the Knex CLI and the seeds then need the same step, and I have not verified that variant against the Nest 12 CLI. The `#` setup above needs none of that, so it is the recommended one.

---

## 2. Folder Structure

```
src/
├── common/
│   ├── cache/
│   │   ├── redis-cache.module.ts        # ioredis provider + CacheService (global)
│   │   ├── redis.constants.ts
│   │   └── cache.service.ts             # get / set / del / delByPrefix / getOrSet (fails soft)
│   ├── decorators/
│   │   ├── public.decorator.ts
│   │   ├── roles.decorator.ts
│   │   └── current-user.decorator.ts
│   ├── dto/
│   │   ├── pagination.args.ts
│   │   ├── pagination-meta.model.ts
│   │   └── paginated.ts                 # generic Paginated<T> object type
│   ├── enums/
│   │   ├── error-code.enum.ts
│   │   └── user-role.enum.ts
│   ├── errors/
│   │   └── normalize-exception.ts       # shared by GraphQL formatError and anything else
│   ├── exceptions/
│   │   ├── app.exception.ts
│   │   └── http.exceptions.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── gql-throttler.guard.ts
│   ├── interceptors/
│   │   └── logging.interceptor.ts
│   ├── interfaces/
│   │   ├── base-row.interface.ts
│   │   └── paginated-result.interface.ts
│   ├── pipes/
│   │   └── validation.pipe.ts
│   ├── repositories/
│   │   └── base.repository.ts
│   └── utils/
│       ├── context.util.ts              # request extraction for graphql/http
│       ├── password.util.ts
│       ├── hash.util.ts                 # sha256
│       └── pagination.util.ts
├── config/
│   ├── configuration.ts
│   └── validation.schema.ts
├── database/
│   ├── helpers/
│   │   ├── base-columns.ts
│   │   └── case-converter.ts
│   ├── migrations/
│   ├── seeds/
│   ├── database.module.ts
│   ├── knex.config.ts
│   ├── knex.service.ts
│   └── knexfile.ts
├── graphql/
│   ├── graphql.module.ts
│   ├── format-error.ts
│   └── loaders/                         # DataLoader factory (optional, §17)
├── health/
│   ├── health.controller.ts
│   └── health.module.ts
├── kafka/
│   ├── kafka.config.ts
│   ├── kafka.module.ts
│   ├── kafka-producer.service.ts
│   └── kafka-topic.enum.ts
├── modules/
│   ├── auth/
│   │   ├── dto/auth.inputs.ts
│   │   ├── entities/refresh-token.entity.ts
│   │   ├── exceptions/
│   │   ├── interfaces/jwt-payload.interface.ts
│   │   ├── models/auth-payload.model.ts
│   │   ├── repositories/refresh-token.repository.ts
│   │   ├── strategies/jwt.strategy.ts
│   │   ├── auth.module.ts
│   │   ├── auth.resolver.ts
│   │   └── auth.service.ts
│   └── users/
│       ├── dto/
│       ├── entities/user.entity.ts
│       ├── events/user-events.controller.ts   # Kafka consumer
│       ├── exceptions/
│       ├── models/
│       ├── repositories/user.repository.ts
│       ├── users.module.ts
│       ├── users.resolver.ts
│       └── users.service.ts
├── app.module.ts
├── main.ts
└── schema.gql                           # generated in dev, commit it
test/
├── setup-e2e.ts
└── app.e2e-spec.ts
vitest.config.ts          # unit tests (src/**/*.spec.ts)
vitest.config.e2e.ts      # e2e tests (test/**/*.e2e-spec.ts)
vitest.aliases.ts         # the same import aliases, for Vitest
tsconfig.json  tsconfig.build.json  nest-cli.json
package.json              # holds the "imports" aliases used at runtime
```

Every folder above maps to an import alias (§1.5): `src/modules/users/*` is `#users/*`, `src/common/*` is `#common/*`, and so on. Unit tests (`*.spec.ts`) live next to the code they test.

---

## 3. Local Infrastructure (Docker Compose)

Run MySQL, Redis and Kafka (single-node KRaft) in Docker and the API on your host.

**docker-compose.yml**

```yaml
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: secret
      MYSQL_DATABASE: my_api_db
    ports: ["3306:3306"]
    command: ["--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci"]
    volumes: [mysql_data:/var/lib/mysql]
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-psecret"]
      interval: 5s
      retries: 20

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redis_data:/data]

  kafka:
    image: apache/kafka:3.9.0
    ports: ["9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0

volumes:
  mysql_data:
  redis_data:
```

```bash
docker compose up -d
# create topics once (auto-creation is disabled in production, so do it in dev too for parity)
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --if-not-exists --topic user.registered --partitions 3 --replication-factor 1
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --if-not-exists --topic user.registered.dlq --partitions 1 --replication-factor 1
```

---

## 4. Environment Configuration

**.env** (never commit; commit a `.env.example` without secrets)

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
GRAPHQL_SANDBOX_ENABLED=true
CORS_ORIGINS=http://localhost:3001

# Database (URL-encode special characters in the password)
DATABASE_URL="mysql://root:secret@localhost:3306/my_api_db"
DB_POOL_MIN=2
DB_POOL_MAX=10
KNEX_DEBUG=false

# JWT (use two different random secrets of 32+ chars, e.g. `openssl rand -base64 48`)
JWT_ACCESS_SECRET=change_me_access_secret_at_least_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change_me_refresh_secret_at_least_32_chars
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
CACHE_TTL_SECONDS=60

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=my-api
KAFKA_CONSUMER_GROUP_ID=my-api-consumers
KAFKA_SSL=false
KAFKA_SASL_MECHANISM=
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=
```

**src/config/validation.schema.ts**: the app refuses to boot on bad config.

```ts
import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').optional(),
  GRAPHQL_SANDBOX_ENABLED: Joi.boolean().default(false),
  CORS_ORIGINS: Joi.string().allow('').optional(),

  DATABASE_URL: Joi.string().uri({ scheme: ['mysql'] }).required(),
  DB_POOL_MIN: Joi.number().min(0).default(2),
  DB_POOL_MAX: Joi.number().min(1).default(10),
  KNEX_DEBUG: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required().invalid(Joi.ref('JWT_ACCESS_SECRET')),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  CACHE_TTL_SECONDS: Joi.number().min(1).default(60),

  KAFKA_BROKERS: Joi.string().required(),
  KAFKA_CLIENT_ID: Joi.string().default('my-api'),
  KAFKA_CONSUMER_GROUP_ID: Joi.string().default('my-api-consumers'),
  KAFKA_SSL: Joi.boolean().default(false),
  KAFKA_SASL_MECHANISM: Joi.string().valid('plain', 'scram-sha-256', 'scram-sha-512').allow('').optional(),
  KAFKA_SASL_USERNAME: Joi.string().allow('').optional(),
  KAFKA_SASL_PASSWORD: Joi.string().allow('').optional(),
});
```

**src/config/configuration.ts**

```ts
export type SaslMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

export interface KafkaConfigShape {
  brokers: string[];
  clientId: string;
  groupId: string;
  ssl: boolean;
  sasl?: { mechanism: SaslMechanism; username: string; password: string };
}

export interface JwtConfigShape {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  graphql: { sandboxEnabled: process.env.GRAPHQL_SANDBOX_ENABLED === 'true' },
  database: {
    url: process.env.DATABASE_URL as string,
    poolMin: parseInt(process.env.DB_POOL_MIN ?? '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    debug: process.env.KNEX_DEBUG === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  } satisfies JwtConfigShape,
  redis: {
    host: process.env.REDIS_HOST as string,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS ?? '60', 10),
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'my-api',
    groupId: process.env.KAFKA_CONSUMER_GROUP_ID ?? 'my-api-consumers',
    ssl: process.env.KAFKA_SSL === 'true',
    sasl: process.env.KAFKA_SASL_USERNAME
      ? {
          mechanism: (process.env.KAFKA_SASL_MECHANISM || 'scram-sha-512') as SaslMechanism,
          username: process.env.KAFKA_SASL_USERNAME,
          password: process.env.KAFKA_SASL_PASSWORD ?? '',
        }
      : undefined,
  } satisfies KafkaConfigShape,
});
```

---

## 5. Knex + MySQL Setup

Knex is a query builder, not an ORM: no schema file and no generated types. Migrations are the source of truth, and row types are small hand-written interfaces.

### 5.1 Case conversion

The database uses `snake_case`; application code uses `camelCase`. Two Knex hooks convert both directions globally.

**src/database/helpers/case-converter.ts**

```ts
export const toSnakeCase = (value: string): string =>
  value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export const toCamelCase = (value: string): string =>
  value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

const isRowObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value);

/** Converts top-level keys of result rows to camelCase. Nested values (JSON columns) are untouched. */
export function mapRowKeys(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(mapRowKeys);
  if (isRowObject(result)) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) mapped[toCamelCase(key)] = value;
    return mapped;
  }
  return result;
}
```

### 5.2 Knex config (shared by app and CLI)

**src/database/knex.config.ts**

```ts
import 'dotenv/config';
import { join } from 'path';
import type { Knex } from 'knex';
import { mapRowKeys, toSnakeCase } from '#database/helpers/case-converter';

// Compiled output (CLI, production) -> .js files; running from source (Vitest) -> .ts files.
// ESM has no __dirname/__filename: use import.meta.dirname / import.meta.filename.
const ext = import.meta.filename.endsWith('.ts') ? 'ts' : 'js';

export interface BuildKnexConfigOptions {
  url?: string;
  poolMin?: number;
  poolMax?: number;
}

export function buildKnexConfig(options: BuildKnexConfigOptions = {}): Knex.Config {
  const url = new URL(options.url ?? process.env.DATABASE_URL ?? '');

  return {
    client: 'mysql2',
    connection: {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      charset: 'utf8mb4',
      timezone: 'Z', // store and read everything as UTC
      // TINYINT(1) -> boolean (keep NULL as null)
      typeCast: (field: any, next: () => unknown) => {
        if (field.type === 'TINY' && field.length === 1) {
          const raw = field.string();
          return raw === null ? null : raw === '1';
        }
        return next();
      },
    },
    pool: {
      min: options.poolMin ?? Number(process.env.DB_POOL_MIN ?? 2),
      max: options.poolMax ?? Number(process.env.DB_POOL_MAX ?? 10),
    },
    acquireConnectionTimeout: 10_000,
    migrations: {
      directory: join(import.meta.dirname, 'migrations'),
      extension: ext,
      loadExtensions: [`.${ext}`],
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: join(import.meta.dirname, 'seeds'),
      extension: ext,
      loadExtensions: [`.${ext}`],
    },
    wrapIdentifier: (value, origImpl) => origImpl(toSnakeCase(value)), // code -> SQL
    postProcessResponse: (result) => mapRowKeys(result), //               SQL  -> code
  };
}
```

Rules to remember:

- `knex.raw('...')` strings are **not** rewritten by `wrapIdentifier`, so write snake_case inside raw SQL.
- Always pass values as bindings (`?` / `??`), never by string interpolation.
- Size the pool as `DB_POOL_MAX × number_of_instances` ≤ MySQL `max_connections` (minus headroom for migrations and admin tools).

**src/database/knexfile.ts** (Knex CLI entry point only)

```ts
import { buildKnexConfig } from '#database/knex.config';

export default buildKnexConfig();
```

### 5.3 KnexService & module

**src/database/knex.service.ts**

```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { knex } from 'knex';
import type { Knex } from 'knex';
import { buildKnexConfig } from '#database/knex.config';

interface DatabaseConfig {
  url: string;
  poolMin: number;
  poolMax: number;
  debug: boolean;
}

@Injectable()
export class KnexService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnexService.name);
  readonly db: Knex;

  constructor(config: ConfigService) {
    const database = config.getOrThrow<DatabaseConfig>('database');
    this.db = knex(buildKnexConfig(database));

    if (database.debug) {
      // SQL only, never bindings (they can contain emails or password hashes).
      this.db.on('query', (query) => this.logger.debug(query.sql));
    }
  }

  async onModuleInit() {
    await this.db.raw('select 1'); // fail fast if the database is unreachable
    this.logger.log('MySQL connection established');
  }

  async onModuleDestroy() {
    await this.db.destroy();
  }

  /** Commits on resolve, rolls back on throw. */
  transaction<T>(work: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.raw('select 1');
      return true;
    } catch {
      return false;
    }
  }
}
```

**src/database/database.module.ts**

```ts
import { Global, Module } from '@nestjs/common';
import { KnexService } from '#database/knex.service';

@Global()
@Module({ providers: [KnexService], exports: [KnexService] })
export class DatabaseModule {}
```

### 5.4 Migrations

Write column names in `snake_case` here.

**src/database/helpers/base-columns.ts**

```ts
import type { Knex } from 'knex';

/**
 * Columns every table carries:
 * - id          UUID primary key (generated by the application)
 * - created_at  set once by the database
 * - updated_at  refreshed by the database on every UPDATE
 * - deleted_at  NULL = live row, timestamp = soft-deleted
 */
export function addBaseColumns(knex: Knex, table: Knex.CreateTableBuilder): void {
  table.uuid('id').primary();
  table.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  table
    .datetime('updated_at', { precision: 3 })
    .notNullable()
    .defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));
  table.datetime('deleted_at', { precision: 3 }).nullable();
  table.index(['deleted_at']);
}
```

**src/database/migrations/20260101000000_create_users_table.ts**

```ts
import type { Knex } from 'knex';
import { addBaseColumns } from '#database/helpers/base-columns';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    addBaseColumns(knex, table);
    table.string('email', 191).notNullable().unique();
    table.string('password').notNullable();
    table.string('full_name');
    table.enu('role', ['user', 'admin']).notNullable().defaultTo('user');
    table.boolean('is_active').notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
```

**src/database/migrations/20260101000100_create_refresh_tokens_table.ts**

```ts
import type { Knex } from 'knex';
import { addBaseColumns } from '#database/helpers/base-columns';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_tokens', (table) => {
    addBaseColumns(knex, table);
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 191).notNullable().unique(); // sha256 hex of the token, never the token
    table.datetime('expires_at', { precision: 3 }).notNullable();
    table.boolean('revoked').notNullable().defaultTo(false);
    table.string('user_agent');
    table.index(['user_id']);
    table.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
```

> **Unique + soft delete.** `users.email` is `UNIQUE` at the database level, so a soft-deleted user still "owns" their email. `UserRepository.existsByEmail` therefore checks including soft-deleted rows. To make emails reusable after deletion, replace the plain unique index with a generated column such as `active_email AS (IF(deleted_at IS NULL, email, NULL))` and put the unique index on that.

> **Never edit a migration that has run in a shared environment.** Add a new migration. For zero-downtime deploys use expand/contract: add columns as nullable, deploy code, backfill, then tighten in a later release. Never drop a column that running code still reads.

### 5.5 CLI usage

The Knex CLI runs against the **compiled** output (`dist/database/knexfile.js`), so there is no ts-node or loader to configure in an ESM project. The npm scripts in §1.3 run `nest build` first where needed.

```bash
npm run migration:make -- create_orders_table   # builds, then creates a timestamped .ts file in src/database/migrations
npm run migration:latest                        # build + apply pending migrations
npm run migration:status
npm run migration:rollback                      # last batch, dev only
npm run seed:run                                # build + run seeds
```

Write migrations in TypeScript inside `src/database/migrations/` and import helpers with aliases (`#database/helpers/base-columns`). They are compiled to `dist/` and loaded as ES modules at runtime.

Production runs the compiled migrations as a separate step **before** the new version starts (see §24): `npm run migration:latest:prod`. `knex`, `mysql2` and `dotenv` are regular dependencies, so they survive `npm ci --omit=dev`. Run migrations from a single place (a CI job or a Kubernetes Job), never from every app replica on boot.

### 5.6 Seeds (dev/bootstrap)

**src/database/seeds/01_admin_user.ts**

```ts
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { PasswordUtil } from '#common/utils/password.util';

export async function seed(knex: Knex): Promise<void> {
  const email = 'admin@example.com';
  await knex('users').where({ email }).del();
  await knex('users').insert({
    id: randomUUID(),
    email,
    password: await PasswordUtil.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'),
    fullName: 'Admin',
    role: 'admin',
  });
}
```

Never run this seed against production with the default password.

### 5.7 MySQL + Knex behaviours worth knowing

- **No `RETURNING` on MySQL.** `insert()` returns the auto-increment id (meaningless for UUID keys), so `BaseRepository.create` inserts and re-reads by the known id.
- `count()` may return a number or string. Always wrap it in `Number()`.
- Dates come back as JS `Date` (UTC, thanks to `timezone: 'Z'`).
- `update()` returns the number of **matched** rows (mysql2 default), which `softDelete` relies on.

---

## 6. Base Fields, Soft Delete & BaseRepository

Soft delete lives in exactly one place: `BaseRepository.qb()`.

**src/common/interfaces/base-row.interface.ts**

```ts
export interface BaseRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

**src/common/repositories/base.repository.ts**

```ts
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { KnexService } from '#database/knex.service';
import type { BaseRow } from '#common/interfaces/base-row.interface';

export type CreateInput<T extends BaseRow> = Omit<T, keyof BaseRow>;
export type UpdateInput<T extends BaseRow> = Partial<Omit<T, keyof BaseRow>>;

export interface QueryOptions {
  /** Include soft-deleted rows. Default: false. */
  withTrashed?: boolean;
}

export abstract class BaseRepository<T extends BaseRow> {
  protected abstract readonly table: string;

  constructor(protected readonly knexService: KnexService) {}

  protected get db(): Knex {
    return this.knexService.db;
  }

  /** The transaction if one was passed, otherwise the shared pool. */
  protected conn(trx?: Knex.Transaction): Knex {
    return trx ?? this.db;
  }

  /** ALWAYS start reads from qb(), not from db(table). Excludes soft-deleted rows by default. */
  protected qb(trx?: Knex.Transaction, options: QueryOptions = {}): Knex.QueryBuilder {
    const query = this.conn(trx)(this.table);
    return options.withTrashed ? query : query.whereNull(`${this.table}.deletedAt`);
  }

  async findById(id: string, trx?: Knex.Transaction): Promise<T | undefined> {
    return this.qb(trx).where({ id }).first();
  }

  async create(data: CreateInput<T>, trx?: Knex.Transaction): Promise<T> {
    const id = randomUUID();
    await this.conn(trx)(this.table).insert({ id, ...data });
    // Re-read inside the same transaction so the uncommitted row is visible.
    return (await this.findById(id, trx)) as T;
  }

  async update(id: string, data: UpdateInput<T>, trx?: Knex.Transaction): Promise<T | undefined> {
    await this.qb(trx).where({ id }).update(data); // updated_at refreshed by MySQL
    return this.findById(id, trx);
  }

  /** Returns false if the row did not exist or was already deleted. */
  async softDelete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const affected = await this.qb(trx).where({ id }).update({ deletedAt: new Date() });
    return affected > 0;
  }

  async restore(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const affected = await this.qb(trx, { withTrashed: true })
      .where({ id })
      .whereNotNull('deletedAt')
      .update({ deletedAt: null });
    return affected > 0;
  }

  /** Permanent delete. Use sparingly (retention jobs, tests). */
  async hardDelete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const affected = await this.conn(trx)(this.table).where({ id }).del();
    return affected > 0;
  }
}
```

Rules that keep soft delete honest: reads start from `qb()`; deletes go through `softDelete()`; intentional hard deletes use `hardDelete()` or `this.db(this.table)` so they stand out in review. Joins are where deleted rows leak: add `.whereNull('other_table.deleted_at')` for every joined table.

**Transactions.** Every repository method takes an optional `trx`. Compose them in a service with `KnexService.transaction`. Throwing inside the callback rolls everything back. Passing `trx` explicitly keeps the unit of work visible at the call site, so pick that convention and keep it consistent.

---

## 7. Errors: Codes, Exceptions, Normalization, GraphQL `formatError`

GraphQL always answers `200 OK` with `{ data, errors }`. Clients branch on **`errors[0].extensions.code`**, so every error we throw carries a stable `ErrorCode`.

### 7.1 Error codes

**src/common/enums/error-code.enum.ts**

```ts
export enum ErrorCode {
  INTERNAL_SERVER_ERROR = 'ERR_INTERNAL_SERVER_ERROR',
  VALIDATION_ERROR = 'ERR_VALIDATION',
  NOT_FOUND = 'ERR_NOT_FOUND',
  BAD_REQUEST = 'ERR_BAD_REQUEST',
  CONFLICT = 'ERR_CONFLICT',
  FORBIDDEN = 'ERR_FORBIDDEN',
  TOO_MANY_REQUESTS = 'ERR_TOO_MANY_REQUESTS',
  UNAUTHORIZED = 'ERR_UNAUTHORIZED',
  INVALID_CREDENTIALS = 'ERR_INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN = 'ERR_INVALID_REFRESH_TOKEN',
  USER_NOT_FOUND = 'ERR_USER_NOT_FOUND',
  EMAIL_ALREADY_EXISTS = 'ERR_EMAIL_ALREADY_EXISTS',
}
```

### 7.2 Exception hierarchy

**src/common/exceptions/app.exception.ts**

```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '#common/enums/error-code.enum';

export abstract class AppException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
    super({ errorCode, message, details }, status);
  }
}
```

**src/common/exceptions/http.exceptions.ts**

```ts
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '#common/enums/error-code.enum';
import { AppException } from '#common/exceptions/app.exception';

export class BadRequestException extends AppException {
  constructor(message = 'Bad request', errorCode = ErrorCode.BAD_REQUEST, details?: unknown) {
    super(errorCode, message, HttpStatus.BAD_REQUEST, details);
  }
}
export class UnauthorizedException extends AppException {
  constructor(message = 'Unauthorized', errorCode = ErrorCode.UNAUTHORIZED, details?: unknown) {
    super(errorCode, message, HttpStatus.UNAUTHORIZED, details);
  }
}
export class ForbiddenException extends AppException {
  constructor(message = 'Forbidden', errorCode = ErrorCode.FORBIDDEN, details?: unknown) {
    super(errorCode, message, HttpStatus.FORBIDDEN, details);
  }
}
export class NotFoundException extends AppException {
  constructor(message = 'Resource not found', errorCode = ErrorCode.NOT_FOUND, details?: unknown) {
    super(errorCode, message, HttpStatus.NOT_FOUND, details);
  }
}
export class ConflictException extends AppException {
  constructor(message = 'Conflict', errorCode = ErrorCode.CONFLICT, details?: unknown) {
    super(errorCode, message, HttpStatus.CONFLICT, details);
  }
}
```

These share names with Nest's built-ins. Import ours from `common/exceptions/http.exceptions` and never import Nest's of the same name in the same file.

### 7.3 Domain exceptions (one class per case)

```ts
// src/modules/users/exceptions/email-already-exists.exception.ts
import { ConflictException } from '#common/exceptions/http.exceptions';
import { ErrorCode } from '#common/enums/error-code.enum';
export class EmailAlreadyExistsException extends ConflictException {
  constructor() { super('A user with this email already exists', ErrorCode.EMAIL_ALREADY_EXISTS); }
}

// src/modules/users/exceptions/user-not-found.exception.ts
import { NotFoundException } from '#common/exceptions/http.exceptions';
import { ErrorCode } from '#common/enums/error-code.enum';
export class UserNotFoundException extends NotFoundException {
  constructor() { super('User not found', ErrorCode.USER_NOT_FOUND); }
}

// src/modules/auth/exceptions/invalid-credentials.exception.ts
import { UnauthorizedException } from '#common/exceptions/http.exceptions';
import { ErrorCode } from '#common/enums/error-code.enum';
export class InvalidCredentialsException extends UnauthorizedException {
  constructor() { super('Invalid email or password', ErrorCode.INVALID_CREDENTIALS); }
}

// src/modules/auth/exceptions/invalid-refresh-token.exception.ts
import { UnauthorizedException } from '#common/exceptions/http.exceptions';
import { ErrorCode } from '#common/enums/error-code.enum';
export class InvalidRefreshTokenException extends UnauthorizedException {
  constructor() { super('Invalid or expired refresh token', ErrorCode.INVALID_REFRESH_TOKEN); }
}
```

### 7.4 Shared normalization

Maps any thrown value to `{ statusCode, errorCode, message, details }`. MySQL errors are translated; everything unknown becomes a generic 500 so internals never leak.

**src/common/errors/normalize-exception.ts**

```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '#common/enums/error-code.enum';
import { AppException } from '#common/exceptions/app.exception';

export interface MysqlError {
  code: string;
  errno: number;
  sqlMessage?: string;
}

export const isMysqlError = (error: unknown): error is MysqlError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as MysqlError).code === 'string' &&
  typeof (error as MysqlError).errno === 'number' &&
  ('sqlState' in error || 'sqlMessage' in error);

export interface NormalizedError {
  statusCode: number;
  errorCode: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.TOO_MANY_REQUESTS,
};

export function normalizeException(exception: unknown): NormalizedError {
  // 1. Our per-case exceptions
  if (exception instanceof AppException) {
    return {
      statusCode: exception.getStatus(),
      errorCode: exception.errorCode,
      message: exception.message,
      details: exception.details,
    };
  }

  // 2. Nest/HTTP exceptions (Passport 401, throttler 429, ...)
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    const message =
      typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
    return {
      statusCode,
      errorCode: STATUS_TO_CODE[statusCode] ?? ErrorCode.INTERNAL_SERVER_ERROR,
      message: Array.isArray(message) ? message.join(', ') : message,
    };
  }

  // 3. MySQL errors surfaced through Knex
  if (isMysqlError(exception)) {
    switch (exception.errno) {
      case 1062: // ER_DUP_ENTRY
        return { statusCode: HttpStatus.CONFLICT, errorCode: ErrorCode.CONFLICT, message: 'A record with the same unique value already exists' };
      case 1452: // ER_NO_REFERENCED_ROW_2
        return { statusCode: HttpStatus.BAD_REQUEST, errorCode: ErrorCode.BAD_REQUEST, message: 'A referenced record does not exist' };
      case 1451: // ER_ROW_IS_REFERENCED_2
        return { statusCode: HttpStatus.CONFLICT, errorCode: ErrorCode.CONFLICT, message: 'The record is still referenced by other records' };
    }
  }

  // 4. Everything else: never leak internals
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  };
}
```

A Knex query that matches nothing returns `undefined` / `0`, so each service throws its own `*NotFoundException` explicitly.

### 7.5 Apollo `formatError`

**src/graphql/format-error.ts**

```ts
import { HttpException, Logger } from '@nestjs/common';
import { GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { isMysqlError, normalizeException } from '#common/errors/normalize-exception';

const logger = new Logger('GraphQL');

export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error);
  const known = original instanceof HttpException || isMysqlError(original);

  // Syntax / validation errors produced by GraphQL itself pass through untouched.
  if (!known && formatted.extensions?.code !== 'INTERNAL_SERVER_ERROR') return formatted;

  const n = normalizeException(original);
  if (n.statusCode >= 500) {
    logger.error(`${formatted.path?.join('.') ?? ''}: ${(original as Error)?.stack ?? String(original)}`);
  }

  return {
    message: n.message,
    locations: formatted.locations,
    path: formatted.path,
    extensions: { code: n.errorCode, statusCode: n.statusCode, details: n.details },
  };
}
```

Client-side handling: read `errors[0].extensions.code` (for example `ERR_EMAIL_ALREADY_EXISTS`, `ERR_VALIDATION` with `details` = `[{ field, errors[] }]`, `ERR_UNAUTHORIZED`, `ERR_TOO_MANY_REQUESTS`).

---

## 8. Validation

`class-validator` decorators sit on `@InputType` / `@ArgsType` classes and the global `ValidationPipe` applies to resolver arguments.

**src/common/pipes/validation.pipe.ts**

```ts
import { ValidationError, ValidationPipe } from '@nestjs/common';
import { BadRequestException } from '#common/exceptions/http.exceptions';
import { ErrorCode } from '#common/enums/error-code.enum';

interface FieldError { field: string; errors: string[] }

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, errors: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export const globalValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true, // instantiates classes, so getters like `skip` work
  exceptionFactory: (errors: ValidationError[]) =>
    new BadRequestException('Validation failed', ErrorCode.VALIDATION_ERROR, flatten(errors)),
});
```

Register it globally in `main.ts` (§20). GraphQL itself already rejects wrong scalar types and missing required fields before resolvers run.

Nest 12 also supports **Standard Schema** libraries (Zod, Valibot, ArkType) through a `schema` option and `StandardSchemaValidationPipe`. This guide keeps `class-validator` because it composes naturally with code-first `@InputType` / `@ArgsType` classes. Don't mix both styles on the same input.

---

## 9. GraphQL Module (Apollo)

**src/common/utils/context.util.ts**: one place that knows how to get the Express request/response for both GraphQL and plain HTTP (health checks) handlers.

```ts
import { ExecutionContext } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';

export function getRequest(context: ExecutionContext): any {
  if (context.getType<GqlContextType>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext().req;
  }
  return context.switchToHttp().getRequest();
}

export function getResponse(context: ExecutionContext): any {
  if (context.getType<GqlContextType>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext().res;
  }
  return context.switchToHttp().getResponse();
}
```

**src/graphql/graphql.module.ts**

```ts
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ConfigService } from '@nestjs/config';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import depthLimit from 'graphql-depth-limit';
import { join } from 'path';
import { formatError } from '#gql/format-error';

export const AppGraphQLModule = GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const sandbox = config.get<boolean>('graphql.sandboxEnabled', false);
    const isProd = config.get<boolean>('isProd', false);
    const writeSchema = config.get<string>('nodeEnv') === 'development';
    return {
      // Only in development is the schema file written to disk (commit it); otherwise it stays in memory.
      autoSchemaFile: writeSchema ? join(process.cwd(), 'src/schema.gql') : true,
      sortSchema: true,
      path: '/graphql',
      introspection: sandbox,
      csrfPrevention: true,
      includeStacktraceInErrorResponses: false,
      hideSchemaDetailsFromClientErrors: isProd, // no "Did you mean ..." hints when introspection is off
      plugins: [
        sandbox
          ? ApolloServerPluginLandingPageLocalDefault({ embed: true })
          : ApolloServerPluginLandingPageDisabled(),
      ],
      validationRules: [depthLimit(8)],
      context: ({ req, res }) => ({ req, res }),
      formatError,
    };
  },
});
```

Notes:

- `GRAPHQL_SANDBOX_ENABLED=false` in production disables introspection **and** the landing page.
- `depthLimit(8)` stops deeply nested queries. For large schemas also add a complexity limit (for example `graphql-query-complexity` as an Apollo plugin) and consider persisted queries.
- Apollo Server 4 does not batch operations unless you enable it. Leave it off.
- Subscriptions and file uploads are intentionally not enabled.
- `@nestjs/graphql` 14 removed GraphQL Playground, so do not pass a `playground` option. We use Apollo's embedded Sandbox (dev only). If you add subscriptions later, use the `graphql-ws` transport.

---

## 10. Pagination

**src/common/dto/pagination-meta.model.ts**

```ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('PaginationMeta')
export class PaginationMetaModel {
  @Field(() => Int) page: number;
  @Field(() => Int) limit: number;
  @Field(() => Int) total: number;
  @Field(() => Int) totalPages: number;
  @Field() hasNextPage: boolean;
  @Field() hasPreviousPage: boolean;
}
```

**src/common/interfaces/paginated-result.interface.ts**

```ts
import { PaginationMetaModel } from '#common/dto/pagination-meta.model';

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMetaModel;
}
```

**src/common/dto/paginated.ts**: generic wrapper used per entity.

```ts
import { Type } from '@nestjs/common';
import { Field, ObjectType } from '@nestjs/graphql';
import { PaginationMetaModel } from '#common/dto/pagination-meta.model';
import type { PaginatedResult } from '#common/interfaces/paginated-result.interface';

export function Paginated<T>(ItemClass: Type<T>) {
  @ObjectType({ isAbstract: true })
  abstract class PaginatedType {
    @Field(() => [ItemClass]) data: T[];
    @Field(() => PaginationMetaModel) meta: PaginationMetaModel;
  }
  return PaginatedType as Type<PaginatedResult<T>>;
}
```

**src/common/dto/pagination.args.ts**

```ts
import { ArgsType, Field, Int, registerEnumType } from '@nestjs/graphql';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
registerEnumType(SortOrder, { name: 'SortOrder' });

@ArgsType()
export class PaginationArgs {
  @Field(() => Int, { defaultValue: 1 }) @IsInt() @Min(1)
  page: number;

  @Field(() => Int, { defaultValue: 20 }) @IsInt() @Min(1) @Max(100)
  limit: number;

  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @Field({ defaultValue: 'createdAt' }) @IsString()
  sortBy: string;

  @Field(() => SortOrder, { defaultValue: SortOrder.DESC }) @IsIn([SortOrder.ASC, SortOrder.DESC])
  sortOrder: SortOrder;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get sqlSortOrder(): 'asc' | 'desc' {
    return this.sortOrder === SortOrder.ASC ? 'asc' : 'desc';
  }

  /** Deterministic cache-key suffix. Subclasses MUST extend it with every extra filter. */
  get cacheKey(): string {
    return `${this.page}:${this.limit}:${this.search ?? ''}:${this.sortBy}:${this.sortOrder}`;
  }
}
```

**src/common/utils/pagination.util.ts**

```ts
import { PaginationMetaModel } from '#common/dto/pagination-meta.model';

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMetaModel {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}
```

`sortBy` comes from the client, so repositories **whitelist** sortable columns (§11). Knex quotes identifiers, so this is not an injection risk, but an unknown column would otherwise cause a 500.

---

## 11. Users Module

### 11.1 Enums, rows and GraphQL models

**src/common/enums/user-role.enum.ts**

```ts
import { registerEnumType } from '@nestjs/graphql';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}
registerEnumType(UserRole, { name: 'UserRole' });
```

**src/modules/users/entities/user.entity.ts** (Knex row type, internal only)

```ts
import type { BaseRow } from '#common/interfaces/base-row.interface';
import { UserRole } from '#common/enums/user-role.enum';

export interface UserRow extends BaseRow {
  email: string;
  password: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
}

/** What may leave the service layer: no password hash, no soft-delete marker. */
export type SafeUser = Omit<UserRow, 'password' | 'deletedAt'>;

export function toSafeUser(row: UserRow): SafeUser {
  const { password: _password, deletedAt: _deletedAt, ...safe } = row;
  return safe;
}
```

**src/modules/users/models/user.model.ts** (GraphQL type)

```ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { UserRole } from '#common/enums/user-role.enum';

@ObjectType('User')
export class UserModel {
  @Field(() => ID) id: string;
  @Field() email: string;
  @Field(() => String, { nullable: true }) fullName: string | null;
  @Field(() => UserRole) role: UserRole;
  @Field() isActive: boolean;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}
```

There is no `password` field, so the hash cannot be queried even by accident.

**src/modules/users/models/paginated-users.model.ts**

```ts
import { ObjectType } from '@nestjs/graphql';
import { Paginated } from '#common/dto/paginated';
import { UserModel } from '#users/models/user.model';

@ObjectType('PaginatedUsers')
export class PaginatedUsersModel extends Paginated(UserModel) {}
```

### 11.2 Inputs and args

**src/modules/users/dto/create-user.input.ts**

```ts
import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

@InputType()
export class CreateUserInput {
  @Field() @Transform(normalizeEmail) @IsEmail() @MaxLength(191)
  email: string;

  @Field() @IsString() @MinLength(8) @MaxLength(128)
  password: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(255)
  fullName?: string;
}
```

**src/modules/users/dto/update-user.input.ts**

```ts
import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(255)
  fullName?: string;
}
```

**src/modules/users/dto/list-users.args.ts**

```ts
import { ArgsType, Field } from '@nestjs/graphql';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationArgs } from '#common/dto/pagination.args';

@ArgsType()
export class ListUsersArgs extends PaginationArgs {
  @Field({ nullable: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;

  // Every filter must be part of the cache key, or different queries would share one entry.
  get cacheKey(): string {
    return `${super.cacheKey}:${this.isActive ?? ''}`;
  }
}
```

### 11.3 UserRepository

**src/modules/users/repositories/user.repository.ts**

```ts
import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from '#database/knex.service';
import { BaseRepository } from '#common/repositories/base.repository';
import type { PaginatedResult } from '#common/interfaces/paginated-result.interface';
import { buildPaginationMeta } from '#common/utils/pagination.util';
import { ListUsersArgs } from '#users/dto/list-users.args';
import type { SafeUser, UserRow } from '#users/entities/user.entity';

const SAFE_COLUMNS = ['id', 'email', 'fullName', 'role', 'isActive', 'createdAt', 'updatedAt'];
const SORTABLE_COLUMNS = ['createdAt', 'updatedAt', 'email', 'fullName'];
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class UserRepository extends BaseRepository<UserRow> {
  protected readonly table = 'users';

  constructor(knexService: KnexService) {
    super(knexService);
  }

  /** Includes the password hash: authentication only. */
  async findByEmail(email: string, trx?: Knex.Transaction): Promise<UserRow | undefined> {
    return this.qb(trx).where({ email }).first();
  }

  /** Includes soft-deleted rows: the UNIQUE index still covers them (see §5.4). */
  async existsByEmail(email: string): Promise<boolean> {
    const row = await this.qb(undefined, { withTrashed: true }).where({ email }).first('id');
    return !!row;
  }

  async findByIdSafe(id: string): Promise<SafeUser | undefined> {
    return this.qb().select(SAFE_COLUMNS).where({ id }).first();
  }

  async paginateUsers(query: ListUsersArgs): Promise<PaginatedResult<SafeUser>> {
    const applyFilters = (builder: Knex.QueryBuilder): Knex.QueryBuilder => {
      if (query.search) {
        const like = `%${escapeLike(query.search)}%`;
        builder.where((group) => group.where('email', 'like', like).orWhere('fullName', 'like', like));
      }
      if (query.isActive !== undefined) builder.where('isActive', query.isActive);
      return builder;
    };

    const sortBy = SORTABLE_COLUMNS.includes(query.sortBy) ? query.sortBy : 'createdAt';

    const [rows, countRow] = await Promise.all([
      applyFilters(this.qb())
        .select(SAFE_COLUMNS)
        .orderBy([
          { column: sortBy, order: query.sqlSortOrder },
          { column: 'id', order: 'asc' }, // tie-breaker -> stable pages
        ])
        .limit(query.limit)
        .offset(query.skip),
      applyFilters(this.qb()).count({ total: '*' }).first(),
    ]);

    const total = Number((countRow as { total: number | string } | undefined)?.total ?? 0);
    return { data: rows as SafeUser[], meta: buildPaginationMeta(total, query.page, query.limit) };
  }
}
```

Offset pagination gets slow on very large tables. If a list passes ~100k rows, move it to keyset (cursor) pagination on `(createdAt, id)`.

### 11.4 UsersService (cache-aware)

Caching sits in the service layer, above the repository. Writes invalidate **after** the database write succeeds.

**src/modules/users/users.service.ts**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '#common/cache/cache.service';
import type { PaginatedResult } from '#common/interfaces/paginated-result.interface';
import { PasswordUtil } from '#common/utils/password.util';
import { CreateUserInput } from '#users/dto/create-user.input';
import { ListUsersArgs } from '#users/dto/list-users.args';
import { UpdateUserInput } from '#users/dto/update-user.input';
import { toSafeUser, type SafeUser, type UserRow } from '#users/entities/user.entity';
import { EmailAlreadyExistsException } from '#users/exceptions/email-already-exists.exception';
import { UserNotFoundException } from '#users/exceptions/user-not-found.exception';
import { UserRepository } from '#users/repositories/user.repository';

const KEY_ONE = (id: string) => `users:one:${id}`;
const KEY_LIST = (suffix: string) => `users:list:${suffix}`;
const PREFIX_LIST = 'users:list:';

@Injectable()
export class UsersService {
  private readonly ttl: number;

  constructor(
    private readonly users: UserRepository,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.ttl = config.getOrThrow<number>('redis.ttlSeconds');
  }

  findAll(query: ListUsersArgs): Promise<PaginatedResult<SafeUser>> {
    return this.cache.getOrSet(KEY_LIST(query.cacheKey), this.ttl, () => this.users.paginateUsers(query)) as Promise<
      PaginatedResult<SafeUser>
    >;
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.cache.getOrSet<SafeUser>(KEY_ONE(id), this.ttl, async () => {
      return (await this.users.findByIdSafe(id)) ?? null; // null is never cached
    });
    if (!user) throw new UserNotFoundException();
    return user;
  }

  async create(input: CreateUserInput): Promise<SafeUser> {
    if (await this.users.existsByEmail(input.email)) throw new EmailAlreadyExistsException();

    const row = await this.users.create({
      email: input.email,
      password: await PasswordUtil.hash(input.password),
      fullName: input.fullName ?? null,
      role: 'user' as UserRow['role'], // role is never client-controlled
      isActive: true,
    });

    await this.cache.delByPrefix(PREFIX_LIST);
    return toSafeUser(row);
  }

  async update(id: string, input: UpdateUserInput): Promise<SafeUser> {
    const updated = await this.users.update(id, { fullName: input.fullName });
    if (!updated) throw new UserNotFoundException();
    await this.invalidate(id);
    return toSafeUser(updated);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.users.softDelete(id);
    if (!deleted) throw new UserNotFoundException();
    await this.invalidate(id);
  }

  /** For authentication only (includes the password hash). */
  findByEmailWithPassword(email: string): Promise<UserRow | undefined> {
    return this.users.findByEmail(email);
  }

  /** Uncached, used by token refresh where freshness matters. */
  findEntityById(id: string): Promise<UserRow | undefined> {
    return this.users.findById(id);
  }

  private async invalidate(id: string): Promise<void> {
    await Promise.all([this.cache.del(KEY_ONE(id)), this.cache.delByPrefix(PREFIX_LIST)]);
  }
}
```

Cache rules of thumb: short TTLs (60s here) bound staleness if an invalidation fails; never cache anything user-specific under a shared key; never cache secrets or the password hash.

### 11.5 Resolver

**src/modules/users/users.resolver.ts**

```ts
import { ParseUUIDPipe } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '#common/decorators/current-user.decorator';
import { Roles } from '#common/decorators/roles.decorator';
import { UserRole } from '#common/enums/user-role.enum';
import type { JwtPayload } from '#auth/interfaces/jwt-payload.interface';
import { ListUsersArgs } from '#users/dto/list-users.args';
import { UpdateUserInput } from '#users/dto/update-user.input';
import { PaginatedUsersModel } from '#users/models/paginated-users.model';
import { UserModel } from '#users/models/user.model';
import { UsersService } from '#users/users.service';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.ADMIN)
  @Query(() => PaginatedUsersModel)
  users(@Args() args: ListUsersArgs) {
    return this.usersService.findAll(args);
  }

  @Roles(UserRole.ADMIN)
  @Query(() => UserModel)
  user(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Query(() => UserModel)
  me(@CurrentUser() user: JwtPayload) {
    return this.usersService.findOne(user.sub);
  }

  @Mutation(() => UserModel)
  updateMe(@CurrentUser() user: JwtPayload, @Args('input') input: UpdateUserInput) {
    return this.usersService.update(user.sub, input);
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => Boolean)
  async deleteUser(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
    await this.usersService.remove(id);
    return true;
  }
}
```

### 11.6 Module

**src/modules/users/users.module.ts**

```ts
import { Module } from '@nestjs/common';
import { UserEventsController } from '#users/events/user-events.controller';
import { UserRepository } from '#users/repositories/user.repository';
import { UsersResolver } from '#users/users.resolver';
import { UsersService } from '#users/users.service';

@Module({
  controllers: [UserEventsController], // Kafka consumer (§16)
  providers: [UsersService, UserRepository, UsersResolver],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
```

---

## 12. Password Hashing with Argon2

**src/common/utils/password.util.ts**

```ts
import * as argon2 from 'argon2';

// OWASP-recommended argon2id baseline (19 MiB, 2 iterations, 1 lane). Benchmark on your hardware
// and raise memory/time until hashing takes roughly 100-300 ms.
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export class PasswordUtil {
  static hash(plain: string): Promise<string> {
    return argon2.hash(plain, OPTIONS);
  }

  static async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // malformed hash
    }
  }

  /** True when the stored hash was made with weaker parameters and should be re-hashed on login. */
  static needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
```

**src/common/utils/hash.util.ts**: refresh tokens are stored as SHA-256 digests (they are high-entropy, so a fast hash is appropriate).

```ts
import { createHash } from 'crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
```

Argon2 is deliberately CPU/memory heavy. That is one more reason to throttle `login` and `register` tightly (§14). Cap password length (128 here) so nobody can submit megabytes.

---

## 13. Authentication & Authorization

Design:

- **Access token**: short-lived JWT (15m), sent as `Authorization: Bearer <token>`.
- **Refresh token**: longer-lived JWT (7d) signed with a *different* secret, stored server-side as a **SHA-256 hash**.
- **Rotation**: every refresh revokes the used token and issues a new pair.
- **Reuse detection**: presenting an already-revoked refresh token means it was probably stolen, so **all** of that user's refresh tokens are revoked.
- **Authorization**: `@Roles()` + `RolesGuard`; routes are protected by default and opted out with `@Public()`.

### 13.1 Payload, decorators

**src/modules/auth/interfaces/jwt-payload.interface.ts**

```ts
import { UserRole } from '#common/enums/user-role.enum';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
}
```

**src/common/decorators/public.decorator.ts**

```ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

**src/common/decorators/roles.decorator.ts**

```ts
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '#common/enums/user-role.enum';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

**src/common/decorators/current-user.decorator.ts**

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getRequest } from '#common/utils/context.util';
import type { JwtPayload } from '#auth/interfaces/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, context: ExecutionContext) => {
    const user = getRequest(context).user as JwtPayload | undefined;
    return field ? user?.[field] : user;
  },
);
```

### 13.2 Guards

**src/common/guards/jwt-auth.guard.ts**

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '#common/decorators/public.decorator';
import { getRequest, getResponse } from '#common/utils/context.util';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Kafka handlers are internal and not JWT-protected (global guards also run on them).
    if (context.getType() === 'rpc') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    return getRequest(context);
  }

  getResponse(context: ExecutionContext) {
    return getResponse(context);
  }
}
```

**src/common/guards/roles.guard.ts**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '#common/decorators/roles.decorator';
import { UserRole } from '#common/enums/user-role.enum';
import { ForbiddenException } from '#common/exceptions/http.exceptions';
import { getRequest } from '#common/utils/context.util';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'rpc') return true;

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = getRequest(context).user as { role?: UserRole } | undefined;
    if (!user?.role || !required.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
```

The role is read from the access token, so a role change takes effect when the token expires (≤15 min). If you need instant revocation, load the user in `JwtStrategy.validate` (with a short Redis cache).

### 13.3 Strategy

**src/modules/auth/strategies/jwt.strategy.ts**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import passportJwt from 'passport-jwt';
import type { JwtPayload } from '#auth/interfaces/jwt-payload.interface';

// passport-jwt is a CommonJS package: take its members from the default export.
const { ExtractJwt, Strategy } = passportJwt;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }
}
```

### 13.4 Refresh-token row and repository

**src/modules/auth/entities/refresh-token.entity.ts**

```ts
import type { BaseRow } from '#common/interfaces/base-row.interface';

export interface RefreshTokenRow extends BaseRow {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  userAgent: string | null;
}
```

**src/modules/auth/repositories/refresh-token.repository.ts**

```ts
import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from '#database/knex.service';
import { BaseRepository } from '#common/repositories/base.repository';
import type { RefreshTokenRow } from '#auth/entities/refresh-token.entity';

@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshTokenRow> {
  protected readonly table = 'refresh_tokens';

  constructor(knexService: KnexService) {
    super(knexService);
  }

  /**
   * Any state (valid, revoked, expired). Inside a transaction the row is locked
   * (SELECT ... FOR UPDATE) so two concurrent refreshes with the same token cannot both win.
   */
  async findByHash(tokenHash: string, trx?: Knex.Transaction): Promise<RefreshTokenRow | undefined> {
    const query = this.qb(trx).where({ tokenHash }).first();
    if (trx) query.forUpdate();
    return query;
  }

  async revoke(id: string, trx?: Knex.Transaction): Promise<void> {
    await this.qb(trx).where({ id }).update({ revoked: true });
  }

  /** Logout: revoke only the caller's own token. */
  async revokeByHash(tokenHash: string, userId: string): Promise<void> {
    await this.qb().where({ tokenHash, userId }).update({ revoked: true });
  }

  async revokeAllForUser(userId: string, trx?: Knex.Transaction): Promise<void> {
    await this.qb(trx).where({ userId, revoked: false }).update({ revoked: true });
  }

  /** Retention job (cron / k8s CronJob): permanently remove tokens that expired before `before`. */
  async purgeExpired(before: Date = new Date()): Promise<number> {
    return this.db(this.table).where('expiresAt', '<', before).del();
  }
}
```

Schedule `purgeExpired` (daily) so the table does not grow forever.

### 13.5 Inputs and payload

**src/modules/auth/dto/auth.inputs.ts**

```ts
import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from '#users/dto/create-user.input';

@InputType()
export class LoginInput {
  @Field() @Transform(normalizeEmail) @IsEmail()
  email: string;

  @Field() @IsString() @MinLength(1) @MaxLength(128)
  password: string;
}

@InputType()
export class RefreshTokenInput {
  @Field() @IsString() @MinLength(20) @MaxLength(2048)
  refreshToken: string;
}
```

**src/modules/auth/models/auth-payload.model.ts**

```ts
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('AuthPayload')
export class AuthPayloadModel {
  @Field() accessToken: string;
  @Field() refreshToken: string;
}
```

### 13.6 AuthService

**src/modules/auth/auth.service.ts**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import type { JwtConfigShape } from '#config/configuration';
import { KnexService } from '#database/knex.service';
import { KafkaProducerService } from '#kafka/kafka-producer.service';
import { KafkaTopic } from '#kafka/kafka-topic.enum';
import { sha256 } from '#common/utils/hash.util';
import { PasswordUtil } from '#common/utils/password.util';
import { CreateUserInput } from '#users/dto/create-user.input';
import type { SafeUser, UserRow } from '#users/entities/user.entity';
import { UsersService } from '#users/users.service';
import { LoginInput } from '#auth/dto/auth.inputs';
import { InvalidCredentialsException } from '#auth/exceptions/invalid-credentials.exception';
import { InvalidRefreshTokenException } from '#auth/exceptions/invalid-refresh-token.exception';
import type { JwtPayload } from '#auth/interfaces/jwt-payload.interface';
import { RefreshTokenRepository } from '#auth/repositories/refresh-token.repository';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserRegisteredEvent {
  eventId: string;
  occurredAt: string;
  userId: string;
  email: string;
  fullName: string | null;
}

type RefreshOutcome = { type: 'ok'; tokens: TokenPair } | { type: 'invalid' } | { type: 'reuse' };

@Injectable()
export class AuthService {
  private readonly jwtConfig: JwtConfigShape;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UsersService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly knexService: KnexService,
    private readonly jwt: JwtService,
    private readonly producer: KafkaProducerService,
    config: ConfigService,
  ) {
    this.jwtConfig = config.getOrThrow<JwtConfigShape>('jwt');
  }

  async register(input: CreateUserInput): Promise<SafeUser> {
    const user = await this.users.create(input);

    // Published after the DB commit. Fire-and-forget: a Kafka outage must not fail signup.
    // For guaranteed delivery use the transactional-outbox pattern (see §16.6).
    await this.producer.publish<UserRegisteredEvent>(KafkaTopic.USER_REGISTERED, user.id, {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
    });

    return user;
  }

  async login(input: LoginInput, userAgent?: string): Promise<TokenPair> {
    const user = await this.users.findByEmailWithPassword(input.email);

    // Always run one argon2 verification so response time does not reveal whether the email exists.
    const hash = user?.password ?? (await this.getDummyHash());
    const valid = await PasswordUtil.verify(hash, input.password);
    if (!user || !valid || !user.isActive) throw new InvalidCredentialsException();

    return this.issueTokens(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    await this.verifyRefreshJwt(refreshToken); // signature + expiry
    const tokenHash = sha256(refreshToken);

    const outcome = await this.knexService.transaction<RefreshOutcome>(async (trx) => {
      const stored = await this.refreshTokens.findByHash(tokenHash, trx);
      if (!stored) return { type: 'invalid' };

      if (stored.revoked) {
        // A rotated-out token is being replayed: assume theft and kill every session.
        await this.refreshTokens.revokeAllForUser(stored.userId, trx);
        return { type: 'reuse' };
      }
      if (stored.expiresAt <= new Date()) return { type: 'invalid' };

      const user = await this.users.findEntityById(stored.userId);
      if (!user || !user.isActive) return { type: 'invalid' };

      await this.refreshTokens.revoke(stored.id, trx);
      return { type: 'ok', tokens: await this.issueTokens(user, userAgent, trx) };
    });

    // Throw AFTER the transaction so the revoke-all above is committed, not rolled back.
    if (outcome.type !== 'ok') throw new InvalidRefreshTokenException();
    return outcome.tokens;
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.refreshTokens.revokeByHash(sha256(refreshToken), userId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  // ---- internals -------------------------------------------------------------------------

  private async issueTokens(
    user: Pick<UserRow, 'id' | 'email' | 'role'>,
    userAgent?: string,
    trx?: Knex.Transaction,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.jwtConfig.accessSecret,
      expiresIn: this.jwtConfig.accessExpiresIn as JwtSignOptions['expiresIn'],
    });

    // `jwtid` makes every refresh token unique, even two issued within the same second.
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.jwtConfig.refreshSecret,
      expiresIn: this.jwtConfig.refreshExpiresIn as JwtSignOptions['expiresIn'],
      jwtid: randomUUID(),
    });

    // Expiry comes from the signed token itself, so config and DB can never disagree.
    const { exp } = this.jwt.decode(refreshToken) as { exp: number };

    await this.refreshTokens.create(
      {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(exp * 1000),
        revoked: false,
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
      trx,
    );

    return { accessToken, refreshToken };
  }

  private async verifyRefreshJwt(token: string): Promise<void> {
    try {
      await this.jwt.verifyAsync(token, { secret: this.jwtConfig.refreshSecret, algorithms: ['HS256'] });
    } catch {
      throw new InvalidRefreshTokenException();
    }
  }

  private getDummyHash(): Promise<string> {
    return (this.dummyHash ??= PasswordUtil.hash(randomUUID()));
  }
}
```

### 13.7 Resolver and module

**src/modules/auth/auth.resolver.ts**

```ts
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '#common/decorators/current-user.decorator';
import { Public } from '#common/decorators/public.decorator';
import { CreateUserInput } from '#users/dto/create-user.input';
import { UserModel } from '#users/models/user.model';
import { AuthService } from '#auth/auth.service';
import { LoginInput, RefreshTokenInput } from '#auth/dto/auth.inputs';
import type { JwtPayload } from '#auth/interfaces/jwt-payload.interface';
import { AuthPayloadModel } from '#auth/models/auth-payload.model';

// Brute-force protection: 5 attempts per minute per client on the sensitive mutations (ttl in ms).
const STRICT = { short: { limit: 5, ttl: 60_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 5, ttl: 60_000 } };

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(STRICT)
  @Mutation(() => UserModel)
  register(@Args('input') input: CreateUserInput) {
    return this.authService.register(input);
  }

  @Public()
  @Throttle(STRICT)
  @Mutation(() => AuthPayloadModel)
  login(@Args('input') input: LoginInput, @Context('req') req: Request) {
    return this.authService.login(input, req.headers['user-agent']);
  }

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 10, ttl: 60_000 } })
  @Mutation(() => AuthPayloadModel)
  refreshToken(@Args('input') input: RefreshTokenInput, @Context('req') req: Request) {
    return this.authService.refresh(input.refreshToken, req.headers['user-agent']);
  }

  @Mutation(() => Boolean)
  async logout(@CurrentUser() user: JwtPayload, @Args('input') input: RefreshTokenInput) {
    await this.authService.logout(user.sub, input.refreshToken);
    return true;
  }

  @Mutation(() => Boolean)
  async logoutAll(@CurrentUser() user: JwtPayload) {
    await this.authService.logoutAll(user.sub);
    return true;
  }
}
```

**src/modules/auth/auth.module.ts**

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '#users/users.module';
import { AuthResolver } from '#auth/auth.resolver';
import { AuthService } from '#auth/auth.service';
import { RefreshTokenRepository } from '#auth/repositories/refresh-token.repository';
import { JwtStrategy } from '#auth/strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule], // secrets are passed per call
  providers: [AuthService, AuthResolver, JwtStrategy, RefreshTokenRepository],
  exports: [AuthService],
})
export class AuthModule {}
```

Client contract: store the access token in memory and the refresh token in secure storage (an `HttpOnly; Secure; SameSite` cookie if you move it to a cookie). On `ERR_UNAUTHORIZED`, call `refreshToken` once, then retry; if that returns `ERR_INVALID_REFRESH_TOKEN`, send the user to login.

---

## 14. Throttling

Three named tiers apply to every resolver field; sensitive mutations override them (see `STRICT` above). `ttl` is in **milliseconds** in `@nestjs/throttler` v5+.

**src/common/guards/gql-throttler.guard.ts**

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getRequest, getResponse } from '#common/utils/context.util';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    return { req: getRequest(context), res: getResponse(context) };
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() === 'rpc'; // never throttle Kafka handlers
  }
}
```

**Module registration** (inside `AppModule.imports`; shown in full in §20)

```ts
ThrottlerModule.forRootAsync({
  inject: [REDIS_CLIENT],
  useFactory: (redis: Redis) => ({
    throttlers: [
      { name: 'short', ttl: 1_000, limit: 10 },   // burst:     10 / second
      { name: 'medium', ttl: 10_000, limit: 50 }, // sustained: 50 / 10 seconds
      { name: 'long', ttl: 60_000, limit: 200 },  // per minute: 200
    ],
    storage: new ThrottlerStorageRedisService(redis), // shared across replicas
  }),
})
```

Use `@SkipThrottle()` on health endpoints. Two GraphQL-specific caveats:

- Throttling counts **per resolver field**, not per HTTP request. A query with five root fields uses five hits, so size the limits for that.
- Behind a load balancer set `app.set('trust proxy', 1)` (done in `main.ts`) so the tracker sees the client IP, not the proxy's.

---

## 15. Redis Cache

Redis is a **cache**: if it is down, the API still works (slower). Every cache operation is wrapped so a Redis failure is logged, not surfaced.

**src/common/cache/redis.constants.ts**

```ts
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
```

**src/common/cache/redis-cache.module.ts**

```ts
import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from '#common/cache/cache.service';
import { REDIS_CLIENT } from '#common/cache/redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('Redis');
        const redis = new Redis({
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
          password: config.get<string | undefined>('redis.password'),
          maxRetriesPerRequest: 1,
          connectTimeout: 5_000,
          commandTimeout: 1_000, // a slow Redis must not make requests slow
          retryStrategy: (times) => Math.min(times * 200, 5_000),
        });
        redis.on('error', (err) => logger.error(err.message)); // without a listener, errors are fatal
        redis.on('ready', () => logger.log('Redis ready'));
        return redis;
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisCacheModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
```

**src/common/cache/cache.service.ts**

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '#common/cache/redis.constants';

const PREFIX = 'app:';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// JSON turns Dates into strings; turn them back so cached values match fresh ones.
const reviver = (_key: string, value: unknown) =>
  typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(PREFIX + key);
      return raw === null ? null : (JSON.parse(raw, reviver) as T);
    } catch (err) {
      this.logger.warn(`get(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`set(${key}) failed: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.redis.unlink(...keys.map((k) => PREFIX + k));
    } catch (err) {
      this.logger.warn(`del failed: ${(err as Error).message}`);
    }
  }

  /** SCAN-based (never KEYS, which blocks Redis). Fine for small key sets; use tags/versioning at scale. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      const stream = this.redis.scanStream({ match: `${PREFIX}${prefix}*`, count: 200 });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length) await this.redis.unlink(...keys);
      }
    } catch (err) {
      this.logger.warn(`delByPrefix(${prefix}) failed: ${(err as Error).message}`);
    }
  }

  /** Read-through. A null result from the loader is returned but never cached. */
  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T | null>): Promise<T | null> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /** SET NX EX. True if this caller won the key (used for consumer idempotency). Fails open. */
  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return (await this.redis.set(PREFIX + key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch (err) {
      this.logger.warn(`setIfAbsent(${key}) failed: ${(err as Error).message}`);
      return true;
    }
  }
}
```

Production notes: set `maxmemory` and `maxmemory-policy allkeys-lru` (or `volatile-lru`) on the Redis server; use TLS and a password on managed Redis; if the throttler storage and the cache share an instance, give the throttler its own logical DB or instance for isolation at scale.

---

## 16. Kafka Events

`AuthService` publishes `user.registered`; a consumer in the same hybrid app reacts asynchronously (for example a welcome email) without slowing the GraphQL request.

### 16.1 Topics and config helper

**src/kafka/kafka-topic.enum.ts**

```ts
export enum KafkaTopic {
  USER_REGISTERED = 'user.registered',
  USER_REGISTERED_DLQ = 'user.registered.dlq',
}
```

**src/kafka/kafka.config.ts**

```ts
import type { KafkaConfig, SASLOptions } from 'kafkajs';
import type { KafkaConfigShape } from '#config/configuration';

export function buildKafkaClientConfig(k: KafkaConfigShape): KafkaConfig {
  return {
    clientId: k.clientId,
    brokers: k.brokers,
    ssl: k.ssl,
    ...(k.sasl ? { sasl: { mechanism: k.sasl.mechanism, username: k.sasl.username, password: k.sasl.password } as SASLOptions } : {}),
    retry: { retries: 8, initialRetryTime: 300 },
  };
}
```

### 16.2 Producer

`producerOnlyMode: true` stops the producer client from creating a pointless consumer group.

**src/kafka/kafka.module.ts**

```ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import type { KafkaConfigShape } from '#config/configuration';
import { buildKafkaClientConfig } from '#kafka/kafka.config';
import { KafkaProducerService } from '#kafka/kafka-producer.service';

export const KAFKA_CLIENT = 'KAFKA_CLIENT';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: KAFKA_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: buildKafkaClientConfig(config.getOrThrow<KafkaConfigShape>('kafka')),
            producerOnlyMode: true,
            producer: { allowAutoTopicCreation: !config.get<boolean>('isProd', false) },
          },
        }),
      },
    ]),
  ],
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
```

**src/kafka/kafka-producer.service.ts**

```ts
import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { KAFKA_CLIENT } from '#kafka/kafka.module';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(@Inject(KAFKA_CLIENT) private readonly client: ClientKafka) {}

  async onModuleInit() {
    // Note: no subscribeToResponseOf(): that is only for request/response (send), not emit.
    try {
      await this.client.connect();
      this.logger.log('Kafka producer connected');
    } catch (err) {
      // Do not crash the API if Kafka is briefly down; publish() will retry connection lazily.
      this.logger.error(`Kafka producer failed to connect: ${(err as Error).message}`);
    }
  }

  async onApplicationShutdown() {
    await this.client.close();
  }

  /** Fire-and-forget safe: logs failures instead of throwing, so callers are never broken by Kafka. */
  async publish<T extends object>(topic: string, key: string, value: T): Promise<boolean> {
    try {
      await lastValueFrom(this.client.emit(topic, { key, value }).pipe(timeout(5_000)));
      return true;
    } catch (err) {
      this.logger.error(`Failed to publish to ${topic}: ${(err as Error).message}`);
      return false;
    }
  }
}
```

The message **key** (the user id) guarantees ordering of events for the same user within a partition. Never put passwords, tokens or full PII dumps in event payloads. Treat topics as long-lived, shared data.

### 16.3 Consumer (idempotent, with dead-letter topic)

Kafka delivery is **at-least-once**, so handlers must be idempotent. Here a Redis `SET NX` on the `eventId` skips duplicates; failures go to a DLQ topic.

**src/modules/users/events/user-events.controller.ts**

```ts
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CacheService } from '#common/cache/cache.service';
import { KafkaProducerService } from '#kafka/kafka-producer.service';
import { KafkaTopic } from '#kafka/kafka-topic.enum';
import type { UserRegisteredEvent } from '#auth/auth.service';

@Controller()
export class UserEventsController {
  private readonly logger = new Logger(UserEventsController.name);

  constructor(
    private readonly cache: CacheService,
    private readonly producer: KafkaProducerService,
  ) {}

  @EventPattern(KafkaTopic.USER_REGISTERED)
  async onUserRegistered(@Payload() event: UserRegisteredEvent) {
    const firstTime = await this.cache.setIfAbsent(`events:processed:${event.eventId}`, 24 * 3600);
    if (!firstTime) {
      this.logger.debug(`Skipping duplicate event ${event.eventId}`);
      return;
    }

    try {
      // Replace with a real MailService call (use a provider API with its own idempotency key).
      this.logger.log(`Sending welcome email to ${event.email} (user ${event.userId})`);
    } catch (err) {
      this.logger.error(`Handling ${event.eventId} failed: ${(err as Error).message}`);
      await this.producer.publish(KafkaTopic.USER_REGISTERED_DLQ, event.userId, event);
    }
  }
}
```

Inspect and replay the DLQ with a separate tool or job. Do not silently drop poisoned messages.

### 16.4 Hybrid app wiring (in `main.ts`, §20)

```ts
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.KAFKA,
  options: {
    client: buildKafkaClientConfig(kafka),
    consumer: { groupId: kafka.groupId, allowAutoTopicCreation: !isProd },
  },
});
await app.startAllMicroservices();
```

All replicas share one `groupId`, so Kafka splits partitions between them. The max parallelism is the partition count (we created 3). Global `APP_GUARD`s still run on Kafka handlers, which is why the guards above return `true` for `rpc` contexts. To scale consumers independently of the API later, move controllers like this into a second entry point that uses `NestFactory.createMicroservice`.

### 16.5 Production Kafka checklist

- Create topics explicitly (partitions, replication factor ≥ 3, retention) and disable auto-creation.
- Use TLS + SASL (`KAFKA_SSL`, `KAFKA_SASL_*`) and least-privilege ACLs per service.
- Monitor consumer lag and DLQ depth; alert on both.
- Version event schemas (add fields, don't rename). Consider a schema registry once several teams consume the topic.

### 16.6 Guaranteed delivery: the outbox pattern (when you need it)

`publish()` after commit can lose an event if the process dies between the commit and the send. If an event must never be lost, write it to an `outbox_events` table **in the same Knex transaction** as the data change, and let a small relay job read unsent rows, publish them, and mark them sent. Consumers are already idempotent, so retries are safe.

---

## 17. DataLoader (N+1)

Right now `User` has no relations, so nothing needs batching. The moment you add a field resolver that hits the database per parent row (for example `User.sessions`, `Order.customer`), you get N+1 queries. The fix is a **per-request** DataLoader built on a Knex `whereIn` batch method.

**Repository batch method**

```ts
// RefreshTokenRepository
async findActiveByUserIds(ids: readonly string[]): Promise<RefreshTokenRow[]> {
  return this.qb()
    .whereIn('userId', ids as string[])
    .where({ revoked: false })
    .andWhere('expiresAt', '>', new Date());
}
```

**src/graphql/loaders/loaders.service.ts**

```ts
import { Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import type { RefreshTokenRow } from '#auth/entities/refresh-token.entity';
import { RefreshTokenRepository } from '#auth/repositories/refresh-token.repository';

export interface Loaders {
  sessionsByUserId: DataLoader<string, RefreshTokenRow[]>;
}

@Injectable()
export class LoadersService {
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  /** Call once per request. Never share a loader across requests: its cache would leak data between users. */
  create(): Loaders {
    return {
      sessionsByUserId: new DataLoader(async (ids) => {
        const rows = await this.refreshTokens.findActiveByUserIds(ids);
        return ids.map((id) => rows.filter((row) => row.userId === id)); // same order as `ids`
      }),
    };
  }
}
```

**Build the loaders in the GraphQL context** (change in `graphql.module.ts`; the module must import whichever module provides `RefreshTokenRepository`, and `LoadersService` must be provided and exported there):

```ts
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [AuthModule, LoadersModule],
  inject: [ConfigService, LoadersService],
  useFactory: (config: ConfigService, loaders: LoadersService) => ({
    // ...everything from §9...
    context: ({ req, res }) => ({ req, res, loaders: loaders.create() }),
  }),
});
```

**Use it in a field resolver**

```ts
@ResolveField(() => [SessionModel])
sessions(@Parent() user: UserModel, @Context('loaders') loaders: Loaders) {
  return loaders.sessionsByUserId.load(user.id);
}
```

Return rows in exactly the order of the incoming `ids` and an empty array (not `undefined`) for ids with no rows. Import the `Loaders` interface with `import type { Loaders } from '#gql/loaders/loaders.service';`, because it appears in a decorated parameter (see §1.6).

---

## 18. Logging & Interceptors

### 18.1 Structured logging (pino)

Registered in `AppModule` (§20) via `LoggerModule.forRootAsync`:

```ts
LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const isProd = config.get<boolean>('isProd', false);
    return {
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
        transport: isProd ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' },
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
        autoLogging: { ignore: (req) => !!req.url?.startsWith('/health') },
      },
    };
  },
}),
```

In production, ship the JSON to stdout and let the platform collect it. Never log request bodies for `login`, `register` or `refreshToken` (they contain passwords and tokens). GraphQL variables arrive in the body, so keep body logging off.

### 18.2 Resolver timing

**src/common/interceptors/logging.interceptor.ts**

```ts
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQL');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<GqlContextType>() !== 'graphql') return next.handle();

    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo<GraphQLResolveInfo>();
    // Log root operations only; per-field logging on list results is far too noisy.
    if (info.path.prev) return next.handle();

    const userId = (gql.getContext().req?.user as { sub?: string } | undefined)?.sub ?? 'anonymous';
    const label = `${info.parentType.name}.${info.fieldName}`;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${label} user=${userId} ${Date.now() - start}ms`),
        error: (err: Error) => this.logger.warn(`${label} user=${userId} ${Date.now() - start}ms failed: ${err.message}`),
      }),
    );
  }
}
```

---

## 19. Health Checks

Load balancers and Kubernetes probes want a plain HTTP endpoint, not a GraphQL query.

**src/health/health.controller.ts**

```ts
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '#common/cache/redis.constants';
import { Public } from '#common/decorators/public.decorator';
import { KnexService } from '#database/knex.service';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly knex: KnexService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Do not check dependencies here, or a DB blip restarts every pod. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the database is required; Redis is optional (it is only a cache). */
  @Get('ready')
  async ready() {
    const database = await this.knex.ping();
    const redis = await this.redis.ping().then(() => true).catch(() => false);
    if (!database) throw new ServiceUnavailableException({ status: 'error', database, redis });
    return { status: 'ok', database, redis };
  }
}
```

**src/health/health.module.ts**

```ts
import { Module } from '@nestjs/common';
import { HealthController } from '#health/health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

---

## 20. AppModule & main.ts

**src/app.module.ts**

```ts
import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { LoggerModule } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '#common/cache/redis.constants';
import { RedisCacheModule } from '#common/cache/redis-cache.module';
import { GqlThrottlerGuard } from '#common/guards/gql-throttler.guard';
import { JwtAuthGuard } from '#common/guards/jwt-auth.guard';
import { RolesGuard } from '#common/guards/roles.guard';
import { LoggingInterceptor } from '#common/interceptors/logging.interceptor';
import configuration from '#config/configuration';
import { validationSchema } from '#config/validation.schema';
import { DatabaseModule } from '#database/database.module';
import { AppGraphQLModule } from '#gql/graphql.module';
import { HealthModule } from '#health/health.module';
import { KafkaModule } from '#kafka/kafka.module';
import { AuthModule } from '#auth/auth.module';
import { UsersModule } from '#users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { libraryOptions: { abortEarly: true } }, // Joi settings live under libraryOptions in @nestjs/config 12
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<boolean>('isProd', false);
        return {
          pinoHttp: {
            level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
            transport: isProd ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' },
            genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
            autoLogging: { ignore: (req) => !!req.url?.startsWith('/health') },
          },
        };
      },
    }),
    DatabaseModule,
    RedisCacheModule,
    KafkaModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: 1_000, limit: 10 },
          { name: 'medium', ttl: 10_000, limit: 50 },
          { name: 'long', ttl: 60_000, limit: 200 },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    AppGraphQLModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle first (cheap), authenticate, then authorize.
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
```

If your throttler storage package version expects a connection options object instead of an `ioredis` instance, check its README. Keeping a single shared client is preferable where supported.

**src/main.ts**

```ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { KafkaConfigShape } from '#config/configuration';
import { globalValidationPipe } from '#common/pipes/validation.pipe';
import { buildKafkaClientConfig } from '#kafka/kafka.config';
import { AppModule } from '#src/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const isProd = config.get<boolean>('isProd', false);
  const kafka = config.getOrThrow<KafkaConfigShape>('kafka');

  app.set('trust proxy', 1); // correct client IPs behind a load balancer (throttling, logs)
  app.use(helmet({ contentSecurityPolicy: isProd })); // default CSP would block the embedded Sandbox in dev
  app.use(compression());
  app.useBodyParser('json', { limit: '100kb' });

  const origins = config.get<string[]>('corsOrigins', []);
  app.enableCors({
    origin: origins.length ? origins : false, // empty list = no cross-origin access
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  app.useGlobalPipes(globalValidationPipe);
  app.enableShutdownHooks(); // SIGTERM -> onModuleDestroy / onApplicationShutdown (closes DB, Redis, Kafka)

  // Kafka consumer in the same process (hybrid app)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: buildKafkaClientConfig(kafka),
      consumer: { groupId: kafka.groupId, allowAutoTopicCreation: !isProd },
    },
  });
  await app.startAllMicroservices();

  await app.listen(config.getOrThrow<number>('port'), '0.0.0.0');
  app.get(Logger).log(`API ready on :${config.get('port')} (graphql at /graphql)`);
}

bootstrap();
```

---

## 21. Example Operations

```graphql
# Public
mutation Register {
  register(input: { email: "sokha@example.com", password: "S3cure-Passw0rd", fullName: "Sokha Chan" }) {
    id email role
  }
}

mutation Login {
  login(input: { email: "sokha@example.com", password: "S3cure-Passw0rd" }) {
    accessToken refreshToken
  }
}

mutation Refresh {
  refreshToken(input: { refreshToken: "<refresh token>" }) { accessToken refreshToken }
}
```

Send `Authorization: Bearer <accessToken>` for everything below.

```graphql
query Me { me { id email fullName role createdAt } }

mutation UpdateMe { updateMe(input: { fullName: "Sokha C." }) { id fullName } }

# Admin only
query Users {
  users(page: 1, limit: 10, search: "sokha", isActive: true, sortBy: "createdAt", sortOrder: DESC) {
    data { id email fullName }
    meta { total totalPages hasNextPage }
  }
}

mutation DeleteUser { deleteUser(id: "00000000-0000-0000-0000-000000000000") }

mutation Logout { logout(input: { refreshToken: "<refresh token>" }) }
```

Typical error response (HTTP 200):

```json
{
  "errors": [{
    "message": "A user with this email already exists",
    "path": ["register"],
    "extensions": { "code": "ERR_EMAIL_ALREADY_EXISTS", "statusCode": 409 }
  }],
  "data": null
}
```

Calling with curl:

```bash
curl -s localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"mutation { login(input:{email:\"sokha@example.com\",password:\"S3cure-Passw0rd\"}) { accessToken } }"}'
```

---

## 22. Testing with Vitest

Vitest is the Nest 12 default for ESM projects and loads the ESM-only Nest packages natively. Two things need care in a Nest app:

1. **Decorator metadata.** Vitest's default compiler (esbuild/oxc) does not emit `emitDecoratorMetadata`, and Nest's dependency injection needs it. `unplugin-swc` routes TypeScript through SWC with metadata enabled.
2. **Path aliases.** Vitest does not read `package.json#imports` for `src`, so the same aliases are repeated once in `vitest.aliases.ts`.

Packages were installed in §1.2 (`vitest`, `unplugin-swc`, `@swc/core`, `@vitest/coverage-v8`, `supertest`).

### 22.1 Config files

**vitest.aliases.ts** (the third copy of the alias list; see §1.5 rule 4)

```ts
import { resolve } from 'node:path';

const src = (path: string) => resolve(import.meta.dirname, 'src', path);

export const aliases = [
  { find: /^#src\/(.*)$/, replacement: src('$1') },
  { find: /^#common\/(.*)$/, replacement: src('common/$1') },
  { find: /^#config\/(.*)$/, replacement: src('config/$1') },
  { find: /^#database\/(.*)$/, replacement: src('database/$1') },
  { find: /^#gql\/(.*)$/, replacement: src('graphql/$1') },
  { find: /^#health\/(.*)$/, replacement: src('health/$1') },
  { find: /^#kafka\/(.*)$/, replacement: src('kafka/$1') },
  { find: /^#auth\/(.*)$/, replacement: src('modules/auth/$1') },
  { find: /^#users\/(.*)$/, replacement: src('modules/users/$1') },
];
```

**vitest.config.ts** (unit tests)

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { aliases } from './vitest.aliases';

export default defineConfig({
  resolve: { alias: aliases },
  plugins: [
    swc.vite({
      tsconfigFile: false, // options are explicit below, so tsconfig `paths` never reach SWC
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
        keepClassNames: true, // GraphQL type names and Nest provider tokens come from class names
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/database/migrations/**', 'src/database/seeds/**', 'src/**/*.spec.ts'],
    },
  },
});
```

If your `unplugin-swc` version does not accept `tsconfigFile`, remove that line; the explicit `jsc` options still apply.

**vitest.config.e2e.ts** (e2e tests: real MySQL and Redis, Kafka mocked)

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { aliases } from './vitest.aliases';

export default defineConfig({
  resolve: { alias: aliases },
  plugins: [
    swc.vite({
      tsconfigFile: false,
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
        keepClassNames: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    pool: 'forks',
    fileParallelism: false, // tests share one database
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

**test/setup-e2e.ts**

```ts
import { config } from 'dotenv';

// .env.test wins over .env; real environment variables (CI) win over both.
config({ path: '.env.test' });
process.env.NODE_ENV = 'test';
```

**.env.test** (use a **dedicated test database**, never dev or prod)

```env
NODE_ENV=test
DATABASE_URL="mysql://root:secret@localhost:3306/my_api_test"
JWT_ACCESS_SECRET=test_access_secret_test_access_secret_1234
JWT_REFRESH_SECRET=test_refresh_secret_test_refresh_secret_12
REDIS_HOST=localhost
KAFKA_BROKERS=localhost:9092
```

Prepare the test database once with `DATABASE_URL=mysql://root:secret@localhost:3306/my_api_test npm run migration:latest`.

### 22.2 Unit tests (colocated `*.spec.ts`)

Import test helpers explicitly from `vitest` (no globals needed). Use `vi.fn()` where Jest used `jest.fn()`.

**src/modules/users/users.service.spec.ts**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { CacheService } from '#common/cache/cache.service';
import { UserNotFoundException } from '#users/exceptions/user-not-found.exception';
import type { UserRepository } from '#users/repositories/user.repository';
import { UsersService } from '#users/users.service';

describe('UsersService', () => {
  const repo = { findByIdSafe: vi.fn(), softDelete: vi.fn() };
  const cache = {
    getOrSet: vi.fn((_key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
    del: vi.fn(),
    delByPrefix: vi.fn(),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(60) };

  const service = new UsersService(
    repo as unknown as UserRepository,
    cache as unknown as CacheService,
    config as unknown as ConfigService,
  );

  afterEach(() => vi.clearAllMocks());

  it('throws UserNotFoundException when the user does not exist', async () => {
    repo.findByIdSafe.mockResolvedValue(undefined);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(UserNotFoundException);
  });

  it('invalidates the item and list caches after a soft delete', async () => {
    repo.softDelete.mockResolvedValue(true);
    await service.remove('abc');
    expect(cache.del).toHaveBeenCalledWith('users:one:abc');
    expect(cache.delByPrefix).toHaveBeenCalledWith('users:list:');
  });

  it('does not touch the cache when the delete matched no row', async () => {
    repo.softDelete.mockResolvedValue(false);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(UserNotFoundException);
    expect(cache.del).not.toHaveBeenCalled();
  });
});
```

**src/common/errors/normalize-exception.spec.ts**

```ts
import { describe, expect, it } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '#common/enums/error-code.enum';
import { normalizeException } from '#common/errors/normalize-exception';
import { UserNotFoundException } from '#users/exceptions/user-not-found.exception';

describe('normalizeException', () => {
  it('keeps the error code of our own exceptions', () => {
    expect(normalizeException(new UserNotFoundException())).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: ErrorCode.USER_NOT_FOUND,
    });
  });

  it('maps MySQL ER_DUP_ENTRY to a 409', () => {
    const mysqlError = { code: 'ER_DUP_ENTRY', errno: 1062, sqlState: '23000', sqlMessage: 'Duplicate entry' };
    expect(normalizeException(mysqlError)).toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      errorCode: ErrorCode.CONFLICT,
    });
  });

  it('never leaks internals of unknown errors', () => {
    const normalized = normalizeException(new Error('db password is hunter2'));
    expect(normalized.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(normalized.message).toBe('Internal server error');
  });
});
```

**src/common/utils/password.util.spec.ts**

```ts
import { describe, expect, it } from 'vitest';
import { PasswordUtil } from '#common/utils/password.util';

describe('PasswordUtil', () => {
  it('hashes with argon2id and verifies the right password only', async () => {
    const hash = await PasswordUtil.hash('S3cure-Passw0rd');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await PasswordUtil.verify(hash, 'S3cure-Passw0rd')).toBe(true);
    expect(await PasswordUtil.verify(hash, 'wrong-password')).toBe(false);
  });

  it('returns false (instead of throwing) for a malformed hash', async () => {
    expect(await PasswordUtil.verify('not-a-hash', 'anything')).toBe(false);
  });
});
```

### 22.3 e2e test (real GraphQL endpoint)

Replace the Kafka producer so tests need no broker. Everything else (MySQL, Redis, guards, throttler) is real.

**test/app.e2e-spec.ts**

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { globalValidationPipe } from '#common/pipes/validation.pipe';
import { KafkaProducerService } from '#kafka/kafka-producer.service';
import { AppModule } from '#src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'S3cure-Passw0rd';

  const gql = (query: string, token?: string) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set(token ? { Authorization: `Bearer ${token}` } : {})
      .send({ query });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KafkaProducerService)
      .useValue({ publish: vi.fn().mockResolvedValue(true) })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(globalValidationPipe);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, logs in, and reads /me', async () => {
    const reg = await gql(`mutation { register(input:{email:"${email}",password:"${password}"}) { id email } }`);
    expect(reg.body.errors).toBeUndefined();

    const login = await gql(
      `mutation { login(input:{email:"${email}",password:"${password}"}) { accessToken refreshToken } }`,
    );
    const { accessToken, refreshToken } = login.body.data.login;

    const me = await gql(`query { me { email role } }`, accessToken);
    expect(me.body.data.me).toEqual({ email, role: 'USER' });

    // rotation: the first refresh works, replaying the old token fails and revokes the family
    const first = await gql(`mutation { refreshToken(input:{refreshToken:"${refreshToken}"}) { refreshToken } }`);
    expect(first.body.errors).toBeUndefined();
    const replay = await gql(`mutation { refreshToken(input:{refreshToken:"${refreshToken}"}) { accessToken } }`);
    expect(replay.body.errors[0].extensions.code).toBe('ERR_INVALID_REFRESH_TOKEN');
  });

  it('rejects unauthenticated access with ERR_UNAUTHORIZED', async () => {
    const res = await gql(`query { me { id } }`);
    expect(res.body.errors[0].extensions.code).toBe('ERR_UNAUTHORIZED');
  });

  it('forbids non-admins from listing users', async () => {
    const login = await gql(`mutation { login(input:{email:"${email}",password:"${password}"}) { accessToken } }`);
    const res = await gql(`query { users { data { id } } }`, login.body.data.login.accessToken);
    expect(res.body.errors[0].extensions.code).toBe('ERR_FORBIDDEN');
  });
});
```

GraphQL enums are serialized by **name**, so `role` comes back as `USER`/`ADMIN` (the enum keys), not `'user'`/`'admin'`.

Throttling counts survive between runs because they live in Redis, and `login` is limited to 5 per minute. If you rerun the e2e suite within a minute, flush Redis first (`docker compose exec redis redis-cli FLUSHALL`) or point the tests at a separate Redis.

### 22.4 Conventions

- **Where tests live:** unit tests next to the code (`*.spec.ts`), e2e tests in `test/` (`*.e2e-spec.ts`).
- **Jest to Vitest cheat sheet:** `jest.fn()` is `vi.fn()`, `jest.spyOn` is `vi.spyOn`, `jest.mock` is `vi.mock` (hoisted automatically; the path can be an alias, for example `vi.mock('#common/utils/password.util')`), `jest.useFakeTimers()` is `vi.useFakeTimers()`.
- **Type-check tests too:** `npm run typecheck` covers `src` and `test`, and `vitest` itself does not type-check.
- **Coverage:** `npm run test:cov` (v8 provider). Add `coverage.thresholds` in `vitest.config.ts` once you want CI to enforce a minimum.
- **Don't test through Kafka and Redis in unit tests.** Mock `CacheService` and `KafkaProducerService`; cover the real thing in e2e.

---

## 23. Security Hardening

| Area | What to do |
|---|---|
| Transport | Terminate TLS at the load balancer; HSTS via Helmet (enabled by default in production CSP mode). |
| Introspection | Off in production (`GRAPHQL_SANDBOX_ENABLED=false`); `hideSchemaDetailsFromClientErrors` on. |
| Query abuse | Depth limit (8), body limit (100 kb), throttling per field. Add query-complexity limits and persisted queries for public APIs. |
| CSRF | `csrfPrevention: true` (Apollo). If you ever move tokens into cookies, also set `SameSite` and verify the `Origin` header. |
| Passwords | argon2id; cap length at 128; constant-time-ish login (dummy hash); throttle `login`/`register`. |
| Tokens | Different secrets for access and refresh (≥32 chars); refresh tokens hashed at rest, rotated, reuse-detected; keep access TTL short. |
| Authorization | Default-deny: global `JwtAuthGuard`; opt out with `@Public()`. Check ownership in services (users may only touch their own rows), not just roles. |
| Data exposure | The GraphQL `User` type has no `password`; services return `SafeUser`; logs redact `Authorization`. |
| SQL | Knex bindings only; whitelist sortable columns; escape `LIKE` wildcards. |
| Secrets | Environment or a secret manager (never in git or images); rotate JWT secrets with a planned overlap window. |
| Dependencies | `npm audit` in CI, Dependabot/Renovate, pin the Node base image by digest in production. |
| Container | Non-root user, read-only filesystem where possible, no dev dependencies in the final image. |
| Kafka/Redis | TLS + auth on both; private networks only; ACLs on topics. |

---

## 24. Docker, CI/CD & Deployment

### 24.1 Dockerfile (multi-stage)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
```

**.dockerignore**

```
node_modules
dist
.git
.env
.env.*
test
vitest.*.ts
*.md
docker-compose*.yml
```

`argon2` ships prebuilt binaries for Alpine (musl), so no compiler toolchain is needed in the image. If you hit a native-module error, switch the base image to `node:22-slim`. The runtime image must contain `package.json`: Node reads the `"imports"` aliases and `"type": "module"` from it at startup (the Dockerfile above copies it). Keep the base image on Node 22.12 or newer.

### 24.2 Release flow

1. **CI**: install → lint → unit tests → build → e2e (with MySQL/Redis service containers) → build and push image.
2. **Migrate** (one job, before rolling out):
   ```bash
   docker run --rm --env-file prod.env my-api:TAG \
     node_modules/.bin/knex --knexfile dist/database/knexfile.js migrate:latest
   ```
3. **Deploy** the new image with a rolling update. Migrations must be backward compatible with the previous version (expand/contract, §5.4).
4. **Verify** `/health/ready`, error rate and Kafka consumer lag before shifting all traffic.
5. **Rollback** by redeploying the previous image; avoid `migrate:rollback` in production, write a forward fix instead.

### 24.3 GitHub Actions (CI skeleton)

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.4
        env: { MYSQL_ROOT_PASSWORD: secret, MYSQL_DATABASE: my_api_test }
        ports: ["3306:3306"]
        options: >-
          --health-cmd="mysqladmin ping -h localhost -psecret" --health-interval=5s --health-retries=20
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    env:
      NODE_ENV: test
      DATABASE_URL: mysql://root:secret@127.0.0.1:3306/my_api_test
      JWT_ACCESS_SECRET: test_access_secret_test_access_secret_1234
      JWT_REFRESH_SECRET: test_refresh_secret_test_refresh_secret_12
      REDIS_HOST: 127.0.0.1
      KAFKA_BROKERS: localhost:9092
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run migration:latest:prod
      - run: npm run typecheck
      - run: npm run test:e2e
      - run: npm audit --omit=dev --audit-level=high
```

### 24.4 Kubernetes essentials

```yaml
containers:
  - name: api
    image: registry.example.com/my-api:TAG
    ports: [{ containerPort: 3000 }]
    envFrom: [{ secretRef: { name: my-api-secrets } }, { configMapRef: { name: my-api-config } }]
    resources:
      requests: { cpu: 250m, memory: 256Mi }
      limits: { memory: 512Mi }
    readinessProbe: { httpGet: { path: /health/ready, port: 3000 }, periodSeconds: 5 }
    livenessProbe:  { httpGet: { path: /health/live,  port: 3000 }, periodSeconds: 10, failureThreshold: 3 }
    lifecycle: { preStop: { exec: { command: ["sleep", "5"] } } }   # let the LB drain before SIGTERM
terminationGracePeriodSeconds: 30
```

- Run migrations as a **Job** (or a pre-deploy pipeline step), not in the app's startup.
- Run `purgeExpired` for refresh tokens as a **CronJob**.
- Use a HorizontalPodAutoscaler on CPU; remember the DB pool math (`DB_POOL_MAX × replicas`).
- Argon2 is CPU- and memory-hungry: load-test `login` and size memory limits accordingly.

---

## 25. Production Checklist

**Config & secrets**
- [ ] `NODE_ENV=production`, all secrets from a secret manager, strong distinct JWT secrets
- [ ] `GRAPHQL_SANDBOX_ENABLED=false` (introspection and landing page off)
- [ ] `CORS_ORIGINS` set to exact frontend origins
- [ ] Config validation passes at boot (the app refuses to start otherwise)

**Database**
- [ ] Migrations run as a single pre-deploy step; no edits to already-applied migrations
- [ ] Pool sized against `max_connections`; MySQL backups and point-in-time recovery tested
- [ ] Default seed password never used; admin account bootstrapped securely
- [ ] Refresh-token purge job scheduled

**API**
- [ ] Depth limit active; complexity limits for public APIs
- [ ] Throttling backed by Redis; strict limits on `login`, `register`, `refreshToken`
- [ ] Every resolver is protected by default; `@Public()` only where intended; admin-only operations use `@Roles`
- [ ] Ownership checks in services for user-scoped data
- [ ] `schema.gql` committed (or generated in CI) and reviewed for breaking changes

**Caching & events**
- [ ] Redis `maxmemory` + eviction policy; TLS/auth enabled; app works with Redis down
- [ ] Kafka topics pre-created, auto-creation off, TLS + SASL, ACLs set
- [ ] Consumers idempotent; DLQ monitored; consumer lag alerts
- [ ] Outbox pattern implemented for events that must never be lost

**Observability**
- [ ] JSON logs with request ids; `Authorization` redacted; no credentials in logs
- [ ] Metrics/tracing (OpenTelemetry or APM) for resolvers, SQL, Redis and Kafka
- [ ] Alerts: error rate, p95 latency, readiness failures, DB connections, DLQ depth

**Runtime**
- [ ] Node 22.12+ everywhere; `package.json` (with `type` and `imports`) shipped in the image
- [ ] `enableShutdownHooks()` verified: SIGTERM drains requests and closes DB, Redis and Kafka cleanly
- [ ] Liveness vs readiness probes configured correctly
- [ ] Non-root container, pinned base image, `npm audit` in CI
- [ ] Load test for `login` (argon2) and the busiest queries; rollback plan documented