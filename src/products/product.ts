export interface Product {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
}

export interface CreateProduct {
  nombre: string;
  descripcion?: string | null;
  precio: number;
}

export type UpdateProduct = Partial<CreateProduct>;
