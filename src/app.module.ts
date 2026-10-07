import { Module } from "@nestjs/common";
import { createObserveModule } from "@nestjs/observe";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { ProductsModule } from "./products/products.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [ProductsModule, InventoryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
