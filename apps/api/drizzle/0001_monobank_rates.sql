CREATE TABLE `rates_new` (
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate_buy` real NOT NULL,
	`rate_sell` real,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`date`, `currency`, `source`)
);
--> statement-breakpoint
INSERT INTO `rates_new` (`date`, `currency`, `rate_buy`, `rate_sell`, `source`, `fetched_at`)
SELECT `date`, `currency`, `rate`, NULL, 'nbu', `fetched_at` FROM `rates`;
--> statement-breakpoint
DROP TABLE `rates`;
--> statement-breakpoint
ALTER TABLE `rates_new` RENAME TO `rates`;
