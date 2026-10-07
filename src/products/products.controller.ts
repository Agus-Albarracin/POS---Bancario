import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { UpdateProductDto } from "./dto/update-product.dto.js";
import type { Product } from "./product.js";
import { ProductsService } from "./products.service.js";

@Controller("products")
export class ProductsController {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}

  @Post()
  create(@Body() input: CreateProductDto): Promise<Product> {
    return this.products.create(input);
  }

  @Get()
  findAll(): Promise<Product[]> {
    return this.products.findAll();
  }

  @Get(":id")
  findOne(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<Product> {
    return this.products.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: UpdateProductDto,
  ): Promise<Product> {
    return this.products.update(id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<void> {
    return this.products.remove(id);
  }
}
