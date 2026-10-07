CREATE TABLE products (
  id UUID PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL CHECK (length(btrim(nombre)) > 0),
  descripcion VARCHAR(2000),
  precio NUMERIC(12, 2) NOT NULL CHECK (precio >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0)
);
