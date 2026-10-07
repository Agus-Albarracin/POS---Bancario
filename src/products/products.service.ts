import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateProduct, Product, UpdateProduct } from "./product.js";
import { ProductsRepository } from "./products.repository.js";

@Injectable()
export class ProductsService {
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
  ) {}

  create(input: CreateProduct): Promise<Product> {
    return this.repository.create(input);
  }

  findAll(): Promise<Product[]> {
    return this.repository.findAll();
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.repository.findOne(id);
    if (!product) {
      throw new NotFoundException("Producto no encontrado.");
    }
    return product;
  }

  async update(id: string, input: UpdateProduct): Promise<Product> {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException(
        "Incluye al menos un campo para actualizar.",
      );
    }
    const product = await this.repository.update(id, input);
    if (!product) {
      throw new NotFoundException("Producto no encontrado.");
    }
    return product;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.repository.remove(id))) {
      throw new NotFoundException("Producto no encontrado.");
    }
  }
}
