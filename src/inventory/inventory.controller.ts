import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CreateMovementDto } from "./dto/create-movement.dto.js";
import { InventoryService } from "./inventory.service.js";

@Controller("inventory")
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  @Get()
  findAll() {
    return this.inventory.findAll();
  }

  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.inventory.findOne(id);
  }

  @Get(":id/movements")
  history(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.inventory.history(id);
  }

  @Post(":id/movements")
  register(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: CreateMovementDto,
  ) {
    return this.inventory.register(id, input);
  }
}
