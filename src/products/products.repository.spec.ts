import { Test } from "@nestjs/testing";
import { Prisma } from "../generated/prisma/client.js";
import { DatabaseService } from "../database/database.service.js";
import { ProductsRepository } from "./products.repository.js";

describe("ProductsRepository (Prisma)", () => {
  let repository: ProductsRepository;
  const model = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const row = {
    id: "4691b0c6-f34b-4a77-8a65-ed7b80081f57",
    nombre: "Teclado",
    descripcion: "USB",
    precio: new Prisma.Decimal("19.99"),
    stock: 4,
  };
  const missing = new Prisma.PrismaClientKnownRequestError("Record missing", {
    code: "P2025",
    clientVersion: "7.10.0",
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProductsRepository,
        { provide: DatabaseService, useValue: { client: { product: model } } },
      ],
    }).compile();
    repository = module.get(ProductsRepository);
  });

  it("devuelve el precio como número al crear y omite el ID del input", async () => {
    model.create.mockResolvedValue({ ...row, stock: 0 });
    const product = await repository.create({
      nombre: "Teclado",
      precio: 19.99,
    });
    expect(product).toEqual({ ...row, precio: 19.99, stock: 0 });
    expect(model.create).toHaveBeenCalledWith({
      data: { nombre: "Teclado", descripcion: null, precio: 19.99, stock: 0 },
    });
  });

  it("convierte los importes Decimal de la lista", async () => {
    model.findMany.mockResolvedValue([row]);
    await expect(repository.findAll()).resolves.toEqual([
      { ...row, precio: 19.99 },
    ]);
  });

  it("devuelve undefined cuando findUnique no encuentra el producto", async () => {
    model.findUnique.mockResolvedValue(null);
    await expect(repository.findOne(row.id)).resolves.toBeUndefined();
  });

  it("conserva el contrato numérico al obtener un producto", async () => {
    model.findUnique.mockResolvedValue(row);
    await expect(repository.findOne(row.id)).resolves.toEqual({
      ...row,
      precio: 19.99,
    });
  });

  it("omite campos undefined y no modifica stock en PATCH", async () => {
    model.update.mockResolvedValue({
      ...row,
      precio: new Prisma.Decimal(0),
    });
    await expect(
      repository.update(row.id, {
        nombre: undefined,
        descripcion: undefined,
        precio: 0,
      }),
    ).resolves.toEqual({ ...row, precio: 0 });
    expect(model.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { precio: 0 },
    });
  });

  it("envía null explícito para quitar la descripción", async () => {
    model.update.mockResolvedValue({ ...row, descripcion: null });
    await expect(
      repository.update(row.id, { descripcion: null }),
    ).resolves.toMatchObject({ descripcion: null });
    expect(model.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { descripcion: null },
    });
  });

  it("traduce P2025 al resultado de producto inexistente en actualización", async () => {
    model.update.mockRejectedValue(missing);
    await expect(
      repository.update(row.id, { precio: 1 }),
    ).resolves.toBeUndefined();
  });

  it("devuelve true al eliminar un producto existente", async () => {
    model.delete.mockResolvedValue(row);
    await expect(repository.remove(row.id)).resolves.toBe(true);
  });

  it("traduce P2025 al resultado de producto inexistente en eliminación", async () => {
    model.delete.mockRejectedValue(missing);
    await expect(repository.remove(row.id)).resolves.toBe(false);
  });

  it("no oculta otros errores Prisma como si el producto no existiera", async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Constraint violation",
      {
        code: "P2002",
        clientVersion: "7.10.0",
      },
    );
    model.update.mockRejectedValue(error);
    model.delete.mockRejectedValue(error);
    await expect(repository.update(row.id, { precio: 1 })).rejects.toBe(error);
    await expect(repository.remove(row.id)).rejects.toBe(error);
  });

  it("propaga fallos de conexión al leer", async () => {
    const error = new Error("Connection unavailable");
    model.findMany.mockRejectedValue(error);
    await expect(repository.findAll()).rejects.toBe(error);
  });
});
