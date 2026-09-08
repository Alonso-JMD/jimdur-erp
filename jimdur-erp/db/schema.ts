import { relations, sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const appUsers = pgTable(
  "app_users",
  {
    email: text("email").primaryKey(),
    username: text("username"),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("USUARIO"),
    active: integer("active").notNull().default(1),
    permissions: text("permissions").notNull().default("[]"),
    passwordHash: text("password_hash"),
    passwordSalt: text("password_salt"),
    passwordIterations: integer("password_iterations").notNull().default(100000),
    mustChangePassword: integer("must_change_password").notNull().default(0),
    passwordUpdatedAt: timestamp("password_updated_at"),
    recoveryKeyHash: text("recovery_key_hash"),
    recoveryKeyCreatedAt: timestamp("recovery_key_created_at"),
    lastAccessAt: timestamp("last_access_at"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("app_users_username_unique").on(table.username)],
);

export const appSessions = pgTable(
  "app_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => appUsers.email, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("app_sessions_user_idx").on(table.userEmail),
    index("app_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at").notNull(),
  lockedUntil: timestamp("locked_until"),
});

export const warehouses = pgTable(
  "warehouses",
  {
    id: serial("id").primaryKey(),
    legacyId: integer("legacy_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: integer("active").notNull().default(1),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("warehouses_code_unique").on(table.code),
    uniqueIndex("warehouses_legacy_id_unique").on(table.legacyId),
  ],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    legacyId: integer("legacy_id"),
    code: text("code").notNull(),
    supplierCode: text("supplier_code"),
    name: text("name").notNull(),
    brand: text("brand"),
    application: text("application"),
    unit: text("unit").notNull().default("UND"),
    location: text("location"),
    cost: doublePrecision("cost").notNull().default(0),
    minimumStock: doublePrecision("minimum_stock").notNull().default(0),
    active: integer("active").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("products_code_unique").on(table.code),
    uniqueIndex("products_legacy_id_unique").on(table.legacyId),
    index("products_name_idx").on(table.name),
  ],
);

export const orderProductAliases = pgTable(
  "order_product_aliases",
  {
    id: serial("id").primaryKey(),
    alias: text("alias").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userEmail: text("user_email"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("order_product_aliases_alias_unique").on(table.alias),
    index("order_product_aliases_product_idx").on(table.productId),
  ],
);

export const stock = pgTable(
  "stock",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    physical: doublePrecision("physical").notNull().default(0),
    reserved: doublePrecision("reserved").notNull().default(0),
    damaged: doublePrecision("damaged").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("stock_product_warehouse_unique").on(
      table.productId,
      table.warehouseId,
    ),
    index("stock_warehouse_idx").on(table.warehouseId),
  ],
);

export const movements = pgTable(
  "movements",
  {
    id: serial("id").primaryKey(),
    occurredAt: timestamp("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    type: text("type").notNull(),
    document: text("document").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: doublePrecision("quantity").notNull(),
    notes: text("notes"),
    userEmail: text("user_email"),
  },
  (table) => [
    index("movements_date_idx").on(table.occurredAt),
    index("movements_product_idx").on(table.productId),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: serial("id").primaryKey(),
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
    confirmedAt: timestamp("confirmed_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("receipts_number_unique").on(table.number)],
);

export const receiptLines = pgTable("receipt_lines", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id")
    .notNull()
    .references(() => receipts.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  expected: doublePrecision("expected").notNull().default(0),
  received: doublePrecision("received").notNull().default(0),
  damaged: doublePrecision("damaged").notNull().default(0),
  incident: text("incident"),
  notes: text("notes"),
});

export const proformas = pgTable(
  "proformas",
  {
    id: serial("id").primaryKey(),
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

export const proformaLines = pgTable("proforma_lines", {
  id: serial("id").primaryKey(),
  proformaId: integer("proforma_id")
    .notNull()
    .references(() => proformas.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: doublePrecision("quantity").notNull(),
  price: doublePrecision("price").notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
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
    startedAt: timestamp("started_at"),
    readyAt: timestamp("ready_at"),
    dispatchedAt: timestamp("dispatched_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("orders_number_unique").on(table.number)],
);

export const orderLines = pgTable("order_lines", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  requested: doublePrecision("requested").notNull(),
  reserved: doublePrecision("reserved").notNull().default(0),
  dispatched: doublePrecision("dispatched").notNull().default(0),
  status: text("status").notNull().default("PENDIENTE"),
  notes: text("notes"),
});

export const transfers = pgTable(
  "transfers",
  {
    id: serial("id").primaryKey(),
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
    confirmedAt: timestamp("confirmed_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("transfers_number_unique").on(table.number)],
);

export const transferLines = pgTable("transfer_lines", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id")
    .notNull()
    .references(() => transfers.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: doublePrecision("quantity").notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    occurredAt: timestamp("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    module: text("module").notNull(),
    entity: text("entity"),
    recordKey: text("record_key"),
    detail: text("detail"),
  },
  (table) => [index("audit_date_idx").on(table.occurredAt)],
);

export const importRuns = pgTable("import_runs", {
  id: serial("id").primaryKey(),
  importedAt: timestamp("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sourceServer: text("source_server"),
  sourceDatabase: text("source_database"),
  userEmail: text("user_email"),
  summary: text("summary").notNull(),
});

export const appUsersRelations = relations(appUsers, ({ many }) => ({
  sessions: many(appSessions),
}));

export const appSessionsRelations = relations(appSessions, ({ one }) => ({
  user: one(appUsers, {
    fields: [appSessions.userEmail],
    references: [appUsers.email],
  }),
}));
