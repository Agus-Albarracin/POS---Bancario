import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { MovementType, StockMovement } from "../inventory.js";

export class CreateMovementDto implements StockMovement {
  @IsUUID("4")
  idOperacion: string;

  @IsIn(["entrada", "salida", "ajuste"])
  tipo: MovementType;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  cantidad: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  responsable: string;
}
