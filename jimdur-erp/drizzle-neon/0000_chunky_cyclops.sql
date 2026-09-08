CREATE TABLE "app_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_seen_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"email" text PRIMARY KEY NOT NULL,
	"username" text,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'USUARIO' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"permissions" text DEFAULT '[]' NOT NULL,
	"password_hash" text,
	"password_salt" text,
	"password_iterations" integer DEFAULT 100000 NOT NULL,
	"must_change_password" integer DEFAULT 0 NOT NULL,
	"password_updated_at" timestamp,
	"recovery_key_hash" text,
	"recovery_key_created_at" timestamp,
	"last_access_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_email" text,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"entity" text,
	"record_key" text,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp NOT NULL,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"imported_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"source_server" text,
	"source_database" text,
	"user_email" text,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"type" text NOT NULL,
	"document" text NOT NULL,
	"product_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"quantity" double precision NOT NULL,
	"notes" text,
	"user_email" text
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"requested" double precision NOT NULL,
	"reserved" double precision DEFAULT 0 NOT NULL,
	"dispatched" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDIENTE' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "order_product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"product_id" integer NOT NULL,
	"user_email" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_id" integer,
	"number" text NOT NULL,
	"date" text NOT NULL,
	"warehouse_id" integer NOT NULL,
	"destination" text DEFAULT 'TIENDA PRINCIPAL' NOT NULL,
	"order_type" text DEFAULT 'REPOSICIÓN' NOT NULL,
	"flow_mode" text DEFAULT 'PEDIDO' NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'PENDIENTE' NOT NULL,
	"user_email" text,
	"started_at" timestamp,
	"ready_at" timestamp,
	"dispatched_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_id" integer,
	"code" text NOT NULL,
	"supplier_code" text,
	"name" text NOT NULL,
	"brand" text,
	"application" text,
	"unit" text DEFAULT 'UND' NOT NULL,
	"location" text,
	"cost" double precision DEFAULT 0 NOT NULL,
	"minimum_stock" double precision DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proforma_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"proforma_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" double precision NOT NULL,
	"price" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proformas" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_id" integer,
	"number" text NOT NULL,
	"date" text NOT NULL,
	"client" text NOT NULL,
	"document" text,
	"address" text,
	"warehouse_id" integer NOT NULL,
	"payment_condition" text DEFAULT 'CONTADO' NOT NULL,
	"status" text DEFAULT 'VIGENTE' NOT NULL,
	"user_email" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"expected" double precision DEFAULT 0 NOT NULL,
	"received" double precision DEFAULT 0 NOT NULL,
	"damaged" double precision DEFAULT 0 NOT NULL,
	"incident" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_id" integer,
	"number" text NOT NULL,
	"date" text NOT NULL,
	"warehouse_id" integer NOT NULL,
	"supplier" text,
	"source" text,
	"document_number" text,
	"carrier" text,
	"notes" text,
	"status" text DEFAULT 'CONFIRMADA' NOT NULL,
	"user_email" text,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"physical" double precision DEFAULT 0 NOT NULL,
	"reserved" double precision DEFAULT 0 NOT NULL,
	"damaged" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_id" integer,
	"number" text NOT NULL,
	"date" text NOT NULL,
	"origin_warehouse_id" integer NOT NULL,
	"destination_warehouse_id" integer NOT NULL,
	"notes" text,
	"status" text DEFAULT 'CONFIRMADA' NOT NULL,
	"user_email" text,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_user_email_app_users_email_fk" FOREIGN KEY ("user_email") REFERENCES "public"."app_users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_product_aliases" ADD CONSTRAINT "order_product_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_lines" ADD CONSTRAINT "proforma_lines_proforma_id_proformas_id_fk" FOREIGN KEY ("proforma_id") REFERENCES "public"."proformas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_lines" ADD CONSTRAINT "proforma_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_origin_warehouse_id_warehouses_id_fk" FOREIGN KEY ("origin_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_sessions_user_idx" ON "app_sessions" USING btree ("user_email");--> statement-breakpoint
CREATE INDEX "app_sessions_expiry_idx" ON "app_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_username_unique" ON "app_users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "audit_date_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "movements_date_idx" ON "movements" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "movements_product_idx" ON "movements" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_product_aliases_alias_unique" ON "order_product_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "order_product_aliases_product_idx" ON "order_product_aliases" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_unique" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_unique" ON "products" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "products_legacy_id_unique" ON "products" USING btree ("legacy_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "proformas_number_unique" ON "proformas" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_unique" ON "receipts" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_product_warehouse_unique" ON "stock" USING btree ("product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_warehouse_idx" ON "stock" USING btree ("warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_number_unique" ON "transfers" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_code_unique" ON "warehouses" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_legacy_id_unique" ON "warehouses" USING btree ("legacy_id");