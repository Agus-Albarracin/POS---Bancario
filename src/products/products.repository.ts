import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import {
  Prisma,
  type Product as PrismaProduct,
} from "../generated/prisma/client.js";
import type { CreateProduct, Product, UpdateProduct } from "./product.js";

function toProduct(row: PrismaProduct): Product {
  return { ...row, precio: row.precio.toNumber() };
}

function isMissingProduct(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

@Injectable()
export class ProductsRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async create(input: CreateProduct): Promise<Product> {
    const product = await this.database.client.product.create({
      data: {
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        precio: input.precio,
        stock: input.stock,
      },
    });
    return toProduct(product);
  }

  async findAll(): Promise<Product[]> {
    const products = await this.database.client.product.findMany({
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });
    return products.map(toProduct);
  }

  async findOne(id: string): Promise<Product | undefined> {
    const product = await this.database.client.product.findUnique({
      where: { id },
    });
    return product ? toProduct(product) : undefined;
  }

  async update(id: string, input: UpdateProduct): Promise<Product | undefined> {
    const data: Prisma.ProductUpdateInput = {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.descripcion !== undefined
        ? { descripcion: input.descripcion }
        : {}),
      ...(input.precio !== undefined ? { precio: input.precio } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
    };
    try {
      const product = await this.database.client.product.update({
        where: { id },
        data,
      });
      return toProduct(product);
    } catch (error) {
      if (isMissingProduct(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      await this.database.client.product.delete({ where: { id } });
      return true;
    } catch (error) {
      if (isMissingProduct(error)) {
        return false;
      }
      throw error;
    }
  }
}
