import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { InventoryError, type StockMovement } from "./inventory.js";
import { InventoryRepository } from "./inventory.repository.js";

function availability(product: { id: string; nombre: string; stock: number }) {
  return {
    productoId: product.id,
    nombre: product.nombre,
    cantidadDisponible: product.stock,
    disponible: product.stock > 0,
  };
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(InventoryRepository)
    private readonly repository: InventoryRepository,
  ) {}

  async findAll() {
    return (await this.repository.findAll()).map(availability);
  }

  async findOne(id: string) {
    const product = await this.repository.findOne(id);
    if (!product) {
      throw new NotFoundException("Producto no encontrado.");
    }
    return availability(product);
  }

  async history(id: string) {
    const movements = await this.repository.history(id);
    if (movements.length === 0) {
      await this.findOne(id);
    }
    return movements;
  }

  async register(id: string, input: StockMovement) {
    if (input.tipo !== "ajuste" && input.cantidad === 0) {
      throw new BadRequestException(
        "Las entradas y salidas requieren una cantidad mayor que cero.",
      );
    }
    try {
      return await this.repository.register(id, input);
    } catch (error) {
      if (error instanceof InventoryError) {
        if (error.reason === "missing_product") {
          throw new NotFoundException("Producto no encontrado.");
        }
        if (error.reason === "invalid_quantity") {
          throw new BadRequestException("Cantidad inválida.");
        }
        const messages = {
          insufficient_stock: "Stock insuficiente.",
          stock_limit: "La operación excede el límite de stock.",
          operation_conflict:
            "El ID de operación ya fue utilizado con otros datos.",
        };
        throw new ConflictException(messages[error.reason]);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      ) {
        throw new ServiceUnavailableException(
          "Conflicto concurrente. Reintenta con el mismo ID de operación.",
        );
      }
      throw error;
    }
  }
}
