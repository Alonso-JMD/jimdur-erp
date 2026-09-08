CREATE TABLE `order_product_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias` text NOT NULL,
	`product_id` integer NOT NULL,
	`user_email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_product_aliases_alias_unique` ON `order_product_aliases` (`alias`);--> statement-breakpoint
CREATE INDEX `order_product_aliases_product_idx` ON `order_product_aliases` (`product_id`);