export type AppUser = {
  email: string;
  username: string;
  displayName: string;
  role: "ADMINISTRADOR" | "USUARIO";
  active: boolean;
  permissions: string[];
  lastAccess: string | null;
};

export type Warehouse = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  productsWithStock: number;
  physical: number;
  reserved: number;
  damaged: number;
  available: number;
};

export type Product = {
  id: number;
  code: string;
  supplierCode: string;
  name: string;
  brand: string;
  application: string;
  unit: string;
  location: string;
  cost: number;
  minimum: number;
  active: boolean;
  physical: number;
  reserved: number;
  damaged: number;
  available: number;
};

export type OrderProductAlias = {
  id: number;
  alias: string;
  productId: number;
  productCode: string;
  productName: string;
  userEmail: string;
  updatedAt: string;
};

export type StockRow = {
  id: number;
  productId: number;
  code: string;
  name: string;
  unit: string;
  location: string;
  minimum: number;
  warehouseId: number;
  warehouse: string;
  physical: number;
  reserved: number;
  damaged: number;
  available: number;
};

export type Movement = {
  id: number;
  date: string;
  type: string;
  document: string;
  productId: number;
  product: string;
  code: string;
  quantity: number;
  warehouseId: number;
  warehouse: string;
  notes: string;
  userEmail: string;
};

export type Receipt = {
  id: number;
  number: string;
  date: string;
  warehouseId: number;
  warehouse: string;
  supplier: string;
  source: string;
  documentNumber: string;
  carrier: string;
  notes: string;
  status: string;
  userEmail: string;
  products: number;
  units: number;
};

export type Proforma = {
  id: number;
  number: string;
  date: string;
  client: string;
  document: string;
  address: string;
  warehouseId: number;
  warehouse: string;
  paymentCondition: string;
  status: string;
  userEmail: string;
  products: number;
  units: number;
  total: number;
  lines?: ProformaLine[];
};

export type ProformaLine = {
  id: number;
  proformaId: number;
  productId: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export type Order = {
  id: number;
  number: string;
  date: string;
  warehouseId: number;
  warehouse: string;
  destination: string;
  orderType: string;
  flowMode: string;
  priority: string;
  notes: string;
  status: string;
  userEmail: string;
  products: number;
  requested: number;
  reserved: number;
  dispatched: number;
  startedAt?: string | null;
  readyAt?: string | null;
  dispatchedAt?: string | null;
  lines?: OrderLine[];
};

export type OrderLine = {
  id: number;
  orderId: number;
  productId: number;
  code: string;
  name: string;
  unit: string;
  location: string;
  requested: number;
  reserved: number;
  dispatched: number;
  status: string;
  notes: string;
  physical: number;
  available: number;
};

export type Transfer = {
  id: number;
  number: string;
  date: string;
  originWarehouseId: number;
  origin: string;
  destinationWarehouseId: number;
  destination: string;
  notes: string;
  status: string;
  userEmail: string;
  products: number;
  units: number;
};

export type ImportRun = {
  id: number;
  importedAt: string;
  sourceServer: string;
  sourceDatabase: string;
  userEmail: string;
  summary: string;
};

export type AuditLog = {
  id: number;
  occurredAt: string;
  userEmail: string;
  action: string;
  module: string;
  entity: string;
  recordKey: string;
  detail: string;
};

export type Snapshot = {
  user: AppUser;
  products: Product[];
  orderProductAliases: OrderProductAlias[];
  stock: StockRow[];
  warehouses: Warehouse[];
  movements: Movement[];
  receipts: Receipt[];
  proformas: Proforma[];
  orders: Order[];
  transfers: Transfer[];
  users: AppUser[];
  imports: ImportRun[];
  auditLogs: AuditLog[];
  generatedAt: string;
};

export type LineInput = {
  productId: number;
  quantity: number;
  price?: number;
  expected?: number;
  received?: number;
  damaged?: number;
};
