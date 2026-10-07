<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

Use Node.js `^22.22.3 || ^24.15.0 || >=26.0.0`, as required by the
NestJS schematics dependency, and make sure `pnpm` is available before installing.

```bash
$ pnpm install
```

## Local PostgreSQL

The project-root `compose.yaml` reuses `api-event-postgres-1`, its existing
`postgres:17-alpine` image (pinned by digest), the `api-event_postgres-data`
volume and the `api-event_default` network. PostgreSQL is exposed only at
`127.0.0.1:5432`. Both external resources must already exist.

Credentials are stored locally in the ignored project-root `.env.postgres` file.
Do not commit or share that file. The raw env-file format requires Docker Compose
2.30.0 or newer. Validate from the project root without printing credentials:

```bash
docker compose config --quiet
```

The existing container has been started without recreation. Its missing initialization
SQL mount was repaired with a no-op placeholder at `docker/init-databases.sql`.
That file does not initialize databases on a new volume. The existing `productos`
database is reused; previous tables are preserved.

## Products CRUD

Persistence uses Prisma Client 7 with `@prisma/adapter-pg`. The model in
`prisma/schema.prisma` maps `Product` to the prepared `products` table. CRUD
queries use `create`, `findMany`, `findUnique`, `update` and `delete`; Prisma
Decimal prices are converted to JSON numbers to preserve the HTTP contract.

The generated ESM client lives in `src/generated/prisma` and is excluded from Git,
lint and formatting. Build, typecheck, lint, development startup and test scripts
generate it automatically with either npm or pnpm. To generate or validate it directly:

```bash
npm run prisma:generate
npm run prisma:validate
```

Generating the client does not modify PostgreSQL. The explicit SQL migration remains
the schema-change mechanism, preserving database CHECK constraints and existing tables;
Prisma is used for application queries. `pg` remains the driver for the adapter and
the explicit migration runner.

The server reads `server/.env` when present; externally supplied DB_* variables
take priority. `.env.example` documents the required connection variables.
The authorized local credentials were copied from the existing container without
printing them. Keep `.env` private.

The prepared migration creates `products` and `app_products_migrations` in the
configured database. Migration `001-products` was authorized and applied to the
existing local `productos` database. It does not run at application startup.
The runner now also includes pending `002-inventory`; authorization is required before
running it against the real database. From `server/`, after authorization:

```bash
npm run db:migrate
npm run start:dev
```

The migration is transactional and repeatable; a conflicting pre-existing
`products` table is not silently adopted. No destructive rollback is supplied.

| Method | Route | Successful response |
| --- | --- | --- |
| POST | `/products` | 201 with created product |
| GET | `/products` | 200 with array of products |
| GET | `/products/:id` | 200 with product |
| PATCH | `/products/:id` | 200 with updated product |
| DELETE | `/products/:id` | 204 without a body |

Prepared create payload:

```json
{
  "nombre": "Teclado",
  "descripcion": "USB",
  "precio": 19.99
}
```

The ID is generated as UUID v4 and products start with stock zero. PATCH accepts any subset
of nombre, descripcion and precio,
requires at least one field and preserves omitted values; `descripcion: null`
clears the description. Unknown properties and invalid UUIDs produce 400.
Missing products produce 404. Price must be a JSON number. The stock field remains in
responses but is managed exclusively by inventory: including stock in POST or PATCH
returns 400. Consumers that previously wrote stock through products must use movements.

## Inventory

Inventory reuses products.stock as the only current quantity. Availability equals that
quantity; there are no reservations or multiple warehouses in this scope.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/inventory` | List available quantities |
| GET | `/inventory/:id` | Get product quantity and availability |
| GET | `/inventory/:id/movements` | Read movement history |
| POST | `/inventory/:id/movements` | Register an entry, exit or adjustment |

Example entry payload (use a new UUID for each new operation):

```json
{
  "idOperacion": "b832cfa1-6017-497c-872c-536591591bcb",
  "tipo": "entrada",
  "cantidad": 5,
  "motivo": "Recepción de mercadería",
  "responsable": "operador"
}
```

`entrada` adds quantity; `salida` subtracts it; `ajuste` sets the absolute quantity.
Entries and exits require a positive integer; adjustments allow zero. The maximum stock
is 2147483647. Insufficient stock, overflow and reusing an operation ID with different
data return 409. Retrying the same ID and payload returns the recorded movement without
changing stock again. Concurrent conflicts are retried up to five times; if exhausted,
503 indicates that the caller can retry with the same operation ID.

Each movement records previous/new stock, product ID/name, timestamp, reason and declared
operator. Operator is supplied by the caller; this feature adds no authentication.
Prisma updates stock and records the movement in one serializable transaction.
The history is retained even if the product is deleted, and cannot be edited through
the API. Existing balances are preserved; movements before enabling inventory are not
reconstructed. UUIDs and request bodies are validated before writes.

Migration `002-inventory` creates only the movement table and its index. It is prepared
and tested in an isolated schema but has not been applied to the real database.

Unit and isolated HTTP tests do not need PostgreSQL. The E2E suite requires
PostgreSQL and permission to create a separate random `products_test_*` schema
in DB_NAME. It applies the migration there, checks CRUD and persistence, and
removes only that test schema afterwards. It does not truncate production tables.

```bash
npm test
npm run test:e2e
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# compile the application
$ pnpm run build

# lint source and tests
$ pnpm run lint

# check TypeScript types, including tests and configuration
$ pnpm run typecheck

# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. Create a free account at [observe.nestjs.com](https://observe.nestjs.com), add an application, and paste the generated app key and secret into the `ObserveModule.forRoot()` call in `src/app.module.ts`.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
