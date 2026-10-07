CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY,
  "productoId" UUID NOT NULL,
  "nombreProducto" VARCHAR(200) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
  "stockAnterior" INTEGER NOT NULL CHECK ("stockAnterior" >= 0),
  "stockPosterior" INTEGER NOT NULL CHECK ("stockPosterior" >= 0),
  motivo VARCHAR(500) NOT NULL CHECK (length(btrim(motivo)) > 0),
  responsable VARCHAR(120) NOT NULL CHECK (length(btrim(responsable)) > 0),
  "creadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tipo = 'ajuste' OR cantidad > 0),
  CHECK (
    (tipo = 'entrada' AND "stockPosterior"::bigint = "stockAnterior"::bigint + cantidad)
    OR (tipo = 'salida' AND "stockPosterior"::bigint = "stockAnterior"::bigint - cantidad)
    OR (tipo = 'ajuste' AND "stockPosterior" = cantidad)
  )
);

CREATE INDEX "inventory_movements_productoId_creadoEn_idx"
  ON inventory_movements ("productoId", "creadoEn");
