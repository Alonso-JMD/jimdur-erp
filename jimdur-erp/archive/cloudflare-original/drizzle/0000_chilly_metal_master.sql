CREATE TABLE `app_users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'USUARIO' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`last_access_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`user_email` text,
	`action` text NOT NULL,
	`module` text NOT NULL,
	`entity` text,
	`record_key` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_date_idx` ON `audit_logs` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`source_server` text,
	`source_database` text,
	`user_email` text,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`type` text NOT NULL,
	`document` text NOT NULL,
	`product_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`notes` text,
	`user_email` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movements_date_idx` ON `movements` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `movements_product_idx` ON `movements` (`product_id`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`requested` real NOT NULL,
	`reserved` real DEFAULT 0 NOT NULL,
	`dispatched` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PENDIENTE' NOT NULL,
	`notes` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`legacy_id` integer,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`warehouse_id` integer NOT NULL,
	`destination` text DEFAULT 'TIENDA PRINCIPAL' NOT NULL,
	`order_type` text DEFAULT 'REPOSICIÓN' NOT NULL,
	`flow_mode` text DEFAULT 'PEDIDO' NOT NULL,
	`priority` text DEFAULT 'NORMAL' NOT NULL,
	`notes` text,
	`status` text DEFAULT 'PENDIENTE' NOT NULL,
	`user_email` text,
	`started_at` text,
	`ready_at` text,
	`dispatched_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`legacy_id` integer,
	`code` text NOT NULL,
	`supplier_code` text,
	`name` text NOT NULL,
	`brand` text,
	`application` text,
	`unit` text DEFAULT 'UND' NOT NULL,
	`location` text,
	`cost` real DEFAULT 0 NOT NULL,
	`minimum_stock` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_code_unique` ON `products` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_legacy_id_unique` ON `products` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `proforma_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proforma_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`price` real NOT NULL,
	FOREIGN KEY (`proforma_id`) REFERENCES `proformas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proformas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`legacy_id` integer,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`client` text NOT NULL,
	`document` text,
	`address` text,
	`warehouse_id` integer NOT NULL,
	`payment_condition` text DEFAULT 'CONTADO' NOT NULL,
	`status` text DEFAULT 'VIGENTE' NOT NULL,
	`user_email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proformas_number_unique` ON `proformas` (`number`);--> statement-breakpoint
CREATE TABLE `receipt_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`expected` real DEFAULT 0 NOT NULL,
	`received` real DEFAULT 0 NOT NULL,
	`damaged` real DEFAULT 0 NOT NULL,
	`incident` text,
	`notes` text,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`legacy_id` integer,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`warehouse_id` integer NOT NULL,
	`supplier` text,
	`source` text,
	`document_number` text,
	`carrier` text,
	`notes` text,
	`status` text DEFAULT 'CONFIRMADA' NOT NULL,
	`user_email` text,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_number_unique` ON `receipts` (`number`);--> statement-breakpoint
CREATE TABLE `stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`physical` real DEFAULT 0 NOT NULL,
	`reserved` real DEFAULT 0 NOT NULL,
	`damaged` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_product_warehouse_unique` ON `stock` (`product_id`,`warehouse_id`);--> statement-breakpoint
CREATE INDEX `stock_warehouse_idx` ON `stock` (`warehouse_id`);--> statement-breakpoint
CREATE TABLE `transfer_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transfer_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` real NOT NULL,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`legacy_id` integer,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`origin_warehouse_id` integer NOT NULL,
	`destination_warehouse_id` integer NOT NULL,
	`notes` text,
	`status` text DEFAULT 'CONFIRMADA' NOT NULL,
	`user_email` text,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`origin_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfers_number_unique` ON `transfers` (`number`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`legacy_id` integer,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_code_unique` ON `warehouses` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_legacy_id_unique` ON `warehouses` (`legacy_id`);