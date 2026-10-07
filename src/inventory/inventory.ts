export type MovementType = "entrada" | "salida" | "ajuste";

export interface StockMovement {
  idOperacion: string;
  tipo: MovementType;
  cantidad: number;
  motivo: string;
  responsable: string;
}

export class InventoryError extends Error {
  constructor(
    readonly reason:
      | "invalid_quantity"
      | "insufficient_stock"
      | "stock_limit"
      | "missing_product"
      | "operation_conflict",
  ) {
    super(reason);
  }
}

export function calculateStock(
  stock: number,
  type: MovementType,
  quantity: number,
): number {
  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    (type !== "ajuste" && quantity === 0)
  ) {
    throw new InventoryError("invalid_quantity");
  }
  const result =
    type === "entrada"
      ? stock + quantity
      : type === "salida"
        ? stock - quantity
        : quantity;
  if (result < 0) {
    throw new InventoryError("insufficient_stock");
  }
  if (result > 2147483647) {
    throw new InventoryError("stock_limit");
  }
  return result;
}
