import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  calculateStock,
  InventoryError,
  type StockMovement,
} from "./inventory.js";

@Injectable()
export class InventoryRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  findAll() {
    return this.database.client.product.findMany({
      select: { id: true, nombre: true, stock: true },
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });
  }

  findOne(id: string) {
    return this.database.client.product.findUnique({
      where: { id },
      select: { id: true, nombre: true, stock: true },
    });
  }

  history(productoId: string) {
    return this.database.client.inventoryMovement.findMany({
      where: { productoId },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    });
  }

  async register(productoId: string, input: StockMovement) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.database.client.$transaction(
          async (tx) => {
            const previous = await tx.inventoryMovement.findUnique({
              where: { id: input.idOperacion },
            });
            if (previous) {
              if (
                previous.productoId !== productoId.toLowerCase() ||
                previous.tipo !== input.tipo ||
                previous.cantidad !== input.cantidad ||
                previous.motivo !== input.motivo ||
                previous.responsable !== input.responsable
              ) {
                throw new InventoryError("operation_conflict");
              }
              return previous;
            }
            const product = await tx.product.findUnique({
              where: { id: productoId },
              select: { nombre: true, stock: true },
            });
            if (!product) {
              throw new InventoryError("missing_product");
            }
            const stockPosterior = calculateStock(
              product.stock,
              input.tipo,
              input.cantidad,
            );
            await tx.product.update({
              where: { id: productoId },
              data: { stock: stockPosterior },
            });
            return tx.inventoryMovement.create({
              data: {
                id: input.idOperacion,
                productoId,
                nombreProducto: product.nombre,
                tipo: input.tipo,
                cantidad: input.cantidad,
                stockAnterior: product.stock,
                stockPosterior,
                motivo: input.motivo,
                responsable: input.responsable,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2034", "P2002"].includes(error.code);
        if (!retryable || attempt === 4) {
          throw error;
        }
      }
    }
    throw new Error("No se pudo completar la transacción de inventario.");
  }
}
