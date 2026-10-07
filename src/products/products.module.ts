import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { ProductsController } from "./products.controller.js";
import { ProductsRepository } from "./products.repository.js";
import { ProductsService } from "./products.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ProductsController],
  providers: [ProductsRepository, ProductsService],
})
export class ProductsModule {}
