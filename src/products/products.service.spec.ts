import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ProductsRepository } from "./products.repository.js";
import { ProductsService } from "./products.service.js";
import type { Product } from "./product.js";

describe("ProductsService", () => {
  let service: ProductsService;
  const repository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const product: Product = {
    id: "4691b0c6-f34b-4a77-8a65-ed7b80081f57",
    nombre: "Teclado",
    descripcion: null,
    precio: 10.5,
    stock: 2,
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it("crea y devuelve el producto persistido", async () => {
    repository.create.mockResolvedValue(product);
    await expect(
      service.create({ nombre: "Teclado", precio: 10.5, stock: 2 }),
    ).resolves.toEqual(product);
  });

  it("devuelve una lista vacía cuando no hay productos", async () => {
    repository.findAll.mockResolvedValue([]);
    await expect(service.findAll()).resolves.toEqual([]);
  });

  it("obtiene un producto existente", async () => {
    repository.findOne.mockResolvedValue(product);
    await expect(service.findOne(product.id)).resolves.toEqual(product);
  });

  it("devuelve 404 al obtener un producto inexistente", async () => {
    await expect(service.findOne(product.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("actualiza precio y stock a cero", async () => {
    repository.update.mockResolvedValue({ ...product, precio: 0, stock: 0 });
    await expect(
      service.update(product.id, { precio: 0, stock: 0 }),
    ).resolves.toMatchObject({ precio: 0, stock: 0 });
  });

  it.each([
    {},
    {
      nombre: undefined,
      descripcion: undefined,
      precio: undefined,
      stock: undefined,
    },
  ])("rechaza una actualización sin campos definidos", async (input) => {
    await expect(service.update(product.id, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("permite quitar la descripción con null", async () => {
    repository.update.mockResolvedValue(product);
    await expect(
      service.update(product.id, { descripcion: null }),
    ).resolves.toEqual(product);
  });

  it("devuelve 404 al actualizar un producto inexistente", async () => {
    await expect(
      service.update(product.id, { stock: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("elimina un producto existente", async () => {
    repository.remove.mockResolvedValue(true);
    await expect(service.remove(product.id)).resolves.toBeUndefined();
  });

  it("devuelve 404 al eliminar un producto inexistente", async () => {
    repository.remove.mockResolvedValue(false);
    await expect(service.remove(product.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("propaga errores de persistencia sin fingir que se creó el producto", async () => {
    repository.create.mockRejectedValue(new Error("database unavailable"));
    await expect(service.create(product)).rejects.toThrow(
      "database unavailable",
    );
  });
});
