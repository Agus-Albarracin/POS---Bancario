import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { configureApp } from "../configure-app.js";
import { DatabaseService } from "../database/database.service.js";
import { ProductsModule } from "./products.module.js";
import { ProductsRepository } from "./products.repository.js";

describe("Products HTTP validation (isolated database)", () => {
  let app: INestApplication<App>;
  const id = "4691b0c6-f34b-4a77-8a65-ed7b80081f57";
  const input = { nombre: "Teclado", precio: 19.99, stock: 4 };
  const repository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ProductsModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(ProductsRepository)
      .useValue(repository)
      .compile();
    app = module.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("valida el cuerpo y normaliza el nombre al crear", async () => {
    repository.create.mockResolvedValue({ id, ...input, descripcion: null });
    await request(app.getHttpServer())
      .post("/products")
      .send({ ...input, nombre: "  Teclado  " })
      .expect(201);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Teclado" }),
    );
  });

  it.each([
    {},
    { ...input, nombre: "   " },
    { ...input, precio: "19.99" },
    { ...input, precio: -1 },
    { ...input, precio: 1.001 },
    { ...input, precio: null },
    { ...input, stock: -1 },
    { ...input, stock: 0.5 },
    { ...input, descripcion: 1 },
    { ...input, extra: true },
    { ...input, id },
  ])(
    "rechaza un cuerpo inválido antes de acceder al repositorio (%#)",
    async (body) => {
      await request(app.getHttpServer())
        .post("/products")
        .send(body)
        .expect(400);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { nombre: null },
    { stock: null },
    { precio: null },
    { extra: true },
  ])("rechaza una actualización inválida (%#)", async (body) => {
    await request(app.getHttpServer())
      .patch(`/products/${id}`)
      .send(body)
      .expect(400);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("permite limpiar solo la descripción con null", async () => {
    repository.update.mockResolvedValue({ id, ...input, descripcion: null });
    await request(app.getHttpServer())
      .patch(`/products/${id}`)
      .send({ descripcion: null })
      .expect(200);
  });

  it("devuelve 400 ante un UUID inválido", async () => {
    await request(app.getHttpServer()).get("/products/invalid").expect(400);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it("devuelve 404 al obtener un producto inexistente", async () => {
    await request(app.getHttpServer()).get(`/products/${id}`).expect(404);
  });

  it("devuelve 204 sin cuerpo al eliminar un producto existente", async () => {
    repository.remove.mockResolvedValue(true);
    await request(app.getHttpServer())
      .delete(`/products/${id}`)
      .expect(204)
      .expect("");
  });
});
