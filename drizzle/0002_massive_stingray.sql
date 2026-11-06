CREATE TABLE `order_fulfillment` (
	`order_id` text PRIMARY KEY NOT NULL,
	`receiver_name` text NOT NULL,
	`phone` text NOT NULL,
	`province` text NOT NULL,
	`canton` text NOT NULL,
	`district` text NOT NULL,
	`address` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_sessions` (
	`order_id` text PRIMARY KEY NOT NULL,
	`provider_session_id` text,
	`checkout_url` text,
	`state` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_sessions_provider_session_id_unique` ON `payment_sessions` (`provider_session_id`);--> statement-breakpoint
CREATE TABLE `payment_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` integer NOT NULL
);
