import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/configure-app.js";
import { getDatabaseConfig } from "../src/database/database.config.js";
import { DatabaseService } from "../src/database/database.service.js";
import { migrate } from "../src/database/migrate.js";

describe("Products CRUD (HTTP + PostgreSQL)", () => {
  const schema = `products_test_${randomUUID().replaceAll("-", "")}`;
  let admin: Pool;
  let pool: Pool;
  let prisma: PrismaClient;
  let app: INestApplication<App> | undefined;
  let schemaCreated = false;
  const input = {
    nombre: "Teclado",
    descripcion: "USB",
    precio: 19.99,
    stock: 4,
  };

  async function createApp(): Promise<INestApplication<App>> {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ client: prisma })
      .compile();
    const application = module.createNestApplication<INestApplication<App>>();
    configureApp(application);
    await application.init();
    return application;
  }

  function api() {
    if (!app) {
      throw new Error("Aplicación de pruebas no inicializada.");
    }
    return request(app.getHttpServer());
  }

  async function createProduct(): Promise<string> {
    const response = await api().post("/products").send(input).expect(201);
    const id: unknown = response.body.id;
    if (typeof id !== "string") {
      throw new Error("La respuesta debe incluir un ID.");
    }
    return id;
  }

  beforeAll(async () => {
    const config = getDatabaseConfig();
    admin = new Pool(config);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    pool = new Pool({ ...config, options: `-c search_path=${schema}` });
    await migrate(pool);
    await migrate(pool);
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    await prisma.$connect();
    app = await createApp();
  }, 20000);

  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await pool?.end();
    if (schemaCreated && /^products_test_[a-f0-9]{32}$/.test(schema)) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await admin?.end();
  });

  it("conserva la ruta raíz existente", async () => {
    await api().get("/").expect(200).expect("Hello World!");
  });

  it("crea, lista, obtiene, actualiza y elimina un producto", async () => {
    const id = await createProduct();
    const expected = { id, ...input };
    await api().get("/products").expect(200).expect([expected]);
    await api().get(`/products/${id}`).expect(200).expect(expected);
    await api()
      .patch(`/products/${id}`)
      .send({ stock: 0, precio: 0 })
      .expect(200)
      .expect({ ...expected, stock: 0, precio: 0 });
    await api().delete(`/products/${id}`).expect(204).expect("");
    await api().get(`/products/${id}`).expect(404);
    await api().get("/products").expect(200).expect([]);
  });

  it("persiste después de reiniciar la aplicación y abrir otra conexión", async () => {
    const id = await createProduct();
    await app?.close();
    app = await createApp();
    await api()
      .get(`/products/${id}`)
      .expect(200)
      .expect({ id, ...input });
    const independent = new PrismaClient({
      adapter: new PrismaPg(getDatabaseConfig(), { schema }),
    });
    try {
      const result = await independent.product.findUniqueOrThrow({
        where: { id },
      });
      expect(result.nombre).toBe("Teclado");
      expect(result.precio.toString()).toBe("19.99");
      expect(result.stock).toBe(4);
    } finally {
      await independent.$disconnect();
    }
  });

  it("permite descripción omitida y limpiar una descripción con null", async () => {
    const created = await api()
      .post("/products")
      .send({ nombre: "Mouse", precio: 0, stock: 0 })
      .expect(201);
    expect(created.body.descripcion).toBeNull();
    const id = await createProduct();
    await api()
      .patch(`/products/${id}`)
      .send({ descripcion: null })
      .expect(200)
      .expect({ id, ...input, descripcion: null });
  });

  it("acepta texto con comillas sin interpretarlo como SQL", async () => {
    const nombre = "Mouse'); DROP TABLE products; --";
    const created = await api()
      .post("/products")
      .send({ ...input, nombre })
      .expect(201);
    expect(created.body.nombre).toBe(nombre);
    await api().get("/products").expect(200);
  });

  it.each([
    {},
    { ...input, nombre: "   " },
    { ...input, nombre: "x".repeat(201) },
    { ...input, descripcion: 10 },
    { ...input, descripcion: "x".repeat(2001) },
    { ...input, precio: -1 },
    { ...input, precio: 1.001 },
    { ...input, precio: 10000000000 },
    { ...input, precio: "19.99" },
    { ...input, precio: null },
    { ...input, stock: -1 },
    { ...input, stock: 1.5 },
    { ...input, stock: 2147483648 },
    { ...input, stock: null },
    { ...input, id: randomUUID() },
    { ...input, extra: true },
  ])("rechaza una creación inválida (%#)", async (body) => {
    await api().post("/products").send(body).expect(400);
    await api().get("/products").expect(200).expect([]);
  });

  it.each([
    {},
    { stock: -1 },
    { stock: null },
    { nombre: null },
    { precio: null },
    { extra: true },
  ])(
    "rechaza una actualización inválida sin alterar el producto (%#)",
    async (body) => {
      const id = await createProduct();
      await api().patch(`/products/${id}`).send(body).expect(400);
      await api()
        .get(`/products/${id}`)
        .expect(200)
        .expect({ id, ...input });
    },
  );

  it("rechaza IDs inválidos y devuelve 404 para IDs inexistentes", async () => {
    const id = randomUUID();
    await api().get("/products/invalid").expect(400);
    await api().patch("/products/invalid").send({ stock: 1 }).expect(400);
    await api().delete("/products/invalid").expect(400);
    await api().get(`/products/${id}`).expect(404);
    await api().patch(`/products/${id}`).send({ stock: 1 }).expect(404);
    await api().delete(`/products/${id}`).expect(404);
  });

  it("conserva actualizaciones concurrentes de campos distintos", async () => {
    const id = await createProduct();
    await Promise.all([
      api()
        .patch(`/products/${id}`)
        .send({ nombre: "Nuevo nombre" })
        .expect(200),
      api().patch(`/products/${id}`).send({ stock: 10 }).expect(200),
    ]);
    await api()
      .get(`/products/${id}`)
      .expect(200)
      .expect({ id, ...input, nombre: "Nuevo nombre", stock: 10 });
  });
});
