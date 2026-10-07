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
import type { StockMovement } from "../src/inventory/inventory.js";
import { InventoryRepository } from "../src/inventory/inventory.repository.js";

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
    await prisma.inventoryMovement.deleteMany();
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
    const expected = { id, ...input, stock: 0 };
    await api().get("/products").expect(200).expect([expected]);
    await api().get(`/products/${id}`).expect(200).expect(expected);
    await api()
      .patch(`/products/${id}`)
      .send({ precio: 0 })
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
      .expect({ id, ...input, stock: 0 });
    const independent = new PrismaClient({
      adapter: new PrismaPg(getDatabaseConfig(), { schema }),
    });
    try {
      const result = await independent.product.findUniqueOrThrow({
        where: { id },
      });
      expect(result.nombre).toBe("Teclado");
      expect(result.precio.toString()).toBe("19.99");
      expect(result.stock).toBe(0);
    } finally {
      await independent.$disconnect();
    }
  });

  it("permite descripción omitida y limpiar una descripción con null", async () => {
    const created = await api()
      .post("/products")
      .send({ nombre: "Mouse", precio: 0 })
      .expect(201);
    expect(created.body.descripcion).toBeNull();
    const id = await createProduct();
    await api()
      .patch(`/products/${id}`)
      .send({ descripcion: null })
      .expect(200)
      .expect({ id, ...input, descripcion: null, stock: 0 });
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
    { ...input, stock: 0 },
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
    { stock: 1 },
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
        .expect({ id, ...input, stock: 0 });
    },
  );

  it("rechaza IDs inválidos y devuelve 404 para IDs inexistentes", async () => {
    const id = randomUUID();
    await api().get("/products/invalid").expect(400);
    await api().patch("/products/invalid").send({ stock: 1 }).expect(400);
    await api().delete("/products/invalid").expect(400);
    await api().get(`/products/${id}`).expect(404);
    await api().patch(`/products/${id}`).send({ precio: 1 }).expect(404);
    await api().delete(`/products/${id}`).expect(404);
  });

  it("conserva actualizaciones concurrentes de campos distintos", async () => {
    const id = await createProduct();
    await Promise.all([
      api()
        .patch(`/products/${id}`)
        .send({ nombre: "Nuevo nombre" })
        .expect(200),
      api().patch(`/products/${id}`).send({ precio: 10 }).expect(200),
    ]);
    await api()
      .get(`/products/${id}`)
      .expect(200)
      .expect({ id, ...input, nombre: "Nuevo nombre", precio: 10, stock: 0 });
  });

  function movement(overrides: Partial<StockMovement> = {}): StockMovement {
    return {
      idOperacion: randomUUID(),
      tipo: "entrada",
      cantidad: 5,
      motivo: "Ingreso",
      responsable: "operador",
      ...overrides,
    };
  }

  it("consulta disponibilidad y registra entradas, salidas y ajustes", async () => {
    const id = await createProduct();
    await api().get(`/inventory/${id}`).expect(200).expect({
      productoId: id,
      nombre: input.nombre,
      cantidadDisponible: 0,
      disponible: false,
    });
    await api().post(`/inventory/${id}/movements`).send(movement()).expect(201);
    await api()
      .post(`/inventory/${id}/movements`)
      .send(movement({ tipo: "salida", cantidad: 2 }))
      .expect(201);
    await api().get(`/inventory/${id}`).expect(200).expect({
      productoId: id,
      nombre: input.nombre,
      cantidadDisponible: 3,
      disponible: true,
    });
    await api()
      .post(`/inventory/${id}/movements`)
      .send(movement({ tipo: "ajuste", cantidad: 0 }))
      .expect(201);
    const history = await api().get(`/inventory/${id}/movements`).expect(200);
    expect(history.body).toHaveLength(3);
    expect(await prisma.inventoryMovement.count()).toBe(3);
    const product = await api().get(`/products/${id}`).expect(200);
    expect(product.body.stock).toBe(0);
    await api()
      .get("/inventory")
      .expect(200)
      .expect([
        {
          productoId: id,
          nombre: input.nombre,
          cantidadDisponible: 0,
          disponible: false,
        },
      ]);
  });

  it("rechaza salidas insuficientes sin cambiar stock ni historial", async () => {
    const id = await createProduct();
    await api()
      .post(`/inventory/${id}/movements`)
      .send(movement({ tipo: "salida", cantidad: 1 }))
      .expect(409);
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id } })).stock,
    ).toBe(0);
  });

  it("reintenta el mismo movimiento sin duplicar el stock", async () => {
    const id = await createProduct();
    const body = movement();
    const first = await api()
      .post(`/inventory/${id}/movements`)
      .send(body)
      .expect(201);
    const second = await api()
      .post(`/inventory/${id}/movements`)
      .send(body)
      .expect(201);
    expect(second.body).toEqual(first.body);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id } })).stock,
    ).toBe(5);
    expect(await prisma.inventoryMovement.count()).toBe(1);
    await api()
      .post(`/inventory/${id}/movements`)
      .send({ ...body, cantidad: 6 })
      .expect(409);
  });

  it("dos salidas concurrentes no consumen el mismo stock", async () => {
    const id = await createProduct();
    await api().post(`/inventory/${id}/movements`).send(movement()).expect(201);
    const responses = await Promise.all([
      api()
        .post(`/inventory/${id}/movements`)
        .send(movement({ tipo: "salida", cantidad: 4 })),
      api()
        .post(`/inventory/${id}/movements`)
        .send(movement({ tipo: "salida", cantidad: 4 })),
    ]);
    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([201, 409]);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id } })).stock,
    ).toBe(1);
    expect(await prisma.inventoryMovement.count()).toBe(2);
  });

  it("dos reintentos concurrentes crean un solo movimiento", async () => {
    const id = await createProduct();
    const body = movement();
    await Promise.all([
      api().post(`/inventory/${id}/movements`).send(body).expect(201),
      api().post(`/inventory/${id}/movements`).send(body).expect(201),
    ]);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id } })).stock,
    ).toBe(5);
    expect(await prisma.inventoryMovement.count()).toBe(1);
  });

  it.each([
    { cantidad: -1 },
    { cantidad: 0 },
    { cantidad: 1.5 },
    { cantidad: "1" },
    { tipo: "invalid" },
    { motivo: " " },
    { responsable: " " },
    { idOperacion: "invalid" },
    { extra: true },
  ])("rechaza movimientos inválidos (%#)", async (invalid) => {
    const id = await createProduct();
    await api()
      .post(`/inventory/${id}/movements`)
      .send({ ...movement(), ...invalid })
      .expect(400);
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it("mantiene el historial después de borrar el producto", async () => {
    const id = await createProduct();
    await api().post(`/inventory/${id}/movements`).send(movement()).expect(201);
    await api().delete(`/products/${id}`).expect(204);
    const response = await api().get(`/inventory/${id}/movements`).expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].nombreProducto).toBe(input.nombre);
    await api().get(`/inventory/${id}`).expect(404);
  });

  it("revierte el saldo si falla la escritura del historial", async () => {
    const id = await createProduct();
    if (!app) {
      throw new Error("Aplicación no inicializada.");
    }
    const repository = app.get(InventoryRepository);
    await expect(
      repository.register(id, movement({ responsable: "x".repeat(121) })),
    ).rejects.toThrow();
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id } })).stock,
    ).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it("rechaza desbordamientos sin alterar el saldo", async () => {
    const id = await createProduct();
    await api()
      .post(`/inventory/${id}/movements`)
      .send(movement({ tipo: "ajuste", cantidad: 2147483647 }))
      .expect(201);
    await api()
      .post(`/inventory/${id}/movements`)
      .send(movement({ cantidad: 1 }))
      .expect(409);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id } })).stock,
    ).toBe(2147483647);
    expect(await prisma.inventoryMovement.count()).toBe(1);
  });

  it("identifica el mismo UUID independientemente de mayúsculas", async () => {
    const id = await createProduct();
    const body = movement();
    await api().post(`/inventory/${id}/movements`).send(body).expect(201);
    await api()
      .post(`/inventory/${id.toUpperCase()}/movements`)
      .send(body)
      .expect(201);
    expect(await prisma.inventoryMovement.count()).toBe(1);
  });

  it("devuelve 404 para productos inexistentes y rechaza UUID inválidos", async () => {
    const id = randomUUID();
    await api().get(`/inventory/${id}`).expect(404);
    await api().get(`/inventory/${id}/movements`).expect(404);
    await api().post(`/inventory/${id}/movements`).send(movement()).expect(404);
    await api().get("/inventory/invalid").expect(400);
  });
});
