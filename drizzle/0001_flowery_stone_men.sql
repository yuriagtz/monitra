CREATE TABLE `landing_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` varchar(255),
	`description` text,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `landing_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monitoring_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`landingPageId` int NOT NULL,
	`checkType` enum('content_change','link_broken') NOT NULL,
	`status` enum('ok','changed','error') NOT NULL,
	`message` text,
	`screenshotUrl` text,
	`previousScreenshotUrl` text,
	`diffImageUrl` text,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monitoring_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `screenshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`landingPageId` int NOT NULL,
	`screenshotUrl` text NOT NULL,
	`fileKey` text NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screenshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `screenshots_landingPageId_unique` UNIQUE(`landingPageId`)
);
