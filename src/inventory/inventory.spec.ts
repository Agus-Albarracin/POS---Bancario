import { calculateStock, InventoryError } from "./inventory.js";

describe("Stock rules", () => {
  it("agrega entradas", () => expect(calculateStock(5, "entrada", 3)).toBe(8));
  it("descuenta salidas", () => expect(calculateStock(5, "salida", 5)).toBe(0));
  it("ajusta a una cantidad absoluta, incluido cero", () =>
    expect(calculateStock(5, "ajuste", 0)).toBe(0));
  it("rechaza stock insuficiente", () =>
    expect(() => calculateStock(5, "salida", 6)).toThrow(InventoryError));
  it("rechaza desbordamiento", () =>
    expect(() => calculateStock(2147483647, "entrada", 1)).toThrow(
      InventoryError,
    ));
  it.each([-1, 0, 1.5, NaN, Infinity])(
    "rechaza cantidades inválidas de entrada (%s)",
    (quantity) => {
      expect(() => calculateStock(5, "entrada", quantity)).toThrow(
        InventoryError,
      );
    },
  );
});
