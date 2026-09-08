import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const appUsers = sqliteTable(
  "app_users",
  {
    email: text("email").primaryKey(),
    username: text("username"),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("USUARIO"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    permissions: text("permissions").notNull().default("[]"),
    passwordHash: text("password_hash"),
    passwordSalt: text("password_salt"),
    passwordIterations: integer("password_iterations").notNull().default(100000),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    passwordUpdatedAt: text("password_updated_at"),
    recoveryKeyHash: text("recovery_key_hash"),
    recoveryKeyCreatedAt: text("recovery_key_created_at"),
    lastAccessAt: text("last_access_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("app_users_username_unique").on(table.username)],
);

export const appSessions = sqliteTable(
  "app_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => appUsers.email, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("app_sessions_user_idx").on(table.userEmail),
    index("app_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  lockedUntil: text("locked_until"),
});

export const warehouses = sqliteTable(
  "warehouses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("warehouses_code_unique").on(table.code),
    uniqueIndex("warehouses_legacy_id_unique").on(table.legacyId),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id"),
    code: text("code").notNull(),
    supplierCode: text("supplier_code"),
    name: text("name").notNull(),
    brand: text("brand"),
    application: text("application"),
    unit: text("unit").notNull().default("UND"),
    location: text("location"),
    cost: real("cost").notNull().default(0),
    minimumStock: real("minimum_stock").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("products_code_unique").on(table.code),
    uniqueIndex("products_legacy_id_unique").on(table.legacyId),
    index("products_name_idx").on(table.name),
  ],
);

export const orderProductAliases = sqliteTable(
  "order_product_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    alias: text("alias").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userEmail: text("user_email"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("order_product_aliases_alias_unique").on(table.alias),
    index("order_product_aliases_product_idx").on(table.productId),
  ],
);

export const stock = sqliteTable(
  "stock",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    physical: real("physical").notNull().default(0),
    reserved: real("reserved").notNull().default(0),
    damaged: real("damaged").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("stock_product_warehouse_unique").on(
      table.productId,
      table.warehouseId,
    ),
    index("stock_warehouse_idx").on(table.warehouseId),
  ],
);

export const movements = sqliteTable(
  "movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    type: text("type").notNull(),
    document: text("document").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: real("quantity").notNull(),
    notes: text("notes"),
    userEmail: text("user_email"),
  },
  (table) => [
    index("movements_date_idx").on(table.occurredAt),
    index("movements_product_idx").on(table.productId),
  ],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id"),
    number: text("number").notNull(),
    date: text("date").notNull(),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    supplier: text("supplier"),
    source: text("source"),
    documentNumber: text("document_number"),
    carrier: text("carrier"),
    notes: text("notes"),
    status: text("status").notNull().default("CONFIRMADA"),
    userEmail: text("user_email"),
    confirmedAt: text("confirmed_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("receipts_number_unique").on(table.number)],
);

export const receiptLines = sqliteTable("receipt_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptId: integer("receipt_id")
    .notNull()
    .references(() => receipts.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  expected: real("expected").notNull().default(0),
  received: real("received").notNull().default(0),
  damaged: real("damaged").notNull().default(0),
  incident: text("incident"),
  notes: text("notes"),
});

export const proformas = sqliteTable(
  "proformas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id"),
    number: text("number").notNull(),
    date: text("date").notNull(),
    client: text("client").notNull(),
    document: text("document"),
    address: text("address"),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    paymentCondition: text("payment_condition").notNull().default("CONTADO"),
    status: text("status").notNull().default("VIGENTE"),
    userEmail: text("user_email"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("proformas_number_unique").on(table.number)],
);

export const proformaLines = sqliteTable("proforma_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proformaId: integer("proforma_id")
    .notNull()
    .references(() => proformas.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
});

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id"),
    number: text("number").notNull(),
    date: text("date").notNull(),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    destination: text("destination").notNull().default("TIENDA PRINCIPAL"),
    orderType: text("order_type").notNull().default("REPOSICIÓN"),
    flowMode: text("flow_mode").notNull().default("PEDIDO"),
    priority: text("priority").notNull().default("NORMAL"),
    notes: text("notes"),
    status: text("status").notNull().default("PENDIENTE"),
    userEmail: text("user_email"),
    startedAt: text("started_at"),
    readyAt: text("ready_at"),
    dispatchedAt: text("dispatched_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("orders_number_unique").on(table.number)],
);

export const orderLines = sqliteTable("order_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  requested: real("requested").notNull(),
  reserved: real("reserved").notNull().default(0),
  dispatched: real("dispatched").notNull().default(0),
  status: text("status").notNull().default("PENDIENTE"),
  notes: text("notes"),
});

export const transfers = sqliteTable(
  "transfers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: integer("legacy_id"),
    number: text("number").notNull(),
    date: text("date").notNull(),
    originWarehouseId: integer("origin_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    destinationWarehouseId: integer("destination_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    notes: text("notes"),
    status: text("status").notNull().default("CONFIRMADA"),
    userEmail: text("user_email"),
    confirmedAt: text("confirmed_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("transfers_number_unique").on(table.number)],
);

export const transferLines = sqliteTable("transfer_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transferId: integer("transfer_id")
    .notNull()
    .references(() => transfers.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: real("quantity").notNull(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    module: text("module").notNull(),
    entity: text("entity"),
    recordKey: text("record_key"),
    detail: text("detail"),
  },
  (table) => [index("audit_date_idx").on(table.occurredAt)],
);

export const importRuns = sqliteTable("import_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sourceServer: text("source_server"),
  sourceDatabase: text("source_database"),
  userEmail: text("user_email"),
  summary: text("summary").notNull(),
});
