CREATE TABLE `activityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`activityType` enum('login','spin','deposit_request','withdrawal_request','suspicious') NOT NULL,
	`details` text,
	`ipAddress` varchar(45) NOT NULL,
	`deviceInfo` text,
	`isSuspicious` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyStats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`activePlayers` int NOT NULL DEFAULT 0,
	`totalSpins` int NOT NULL DEFAULT 0,
	`totalWinnings` int NOT NULL DEFAULT 0,
	`totalRevenue` int NOT NULL DEFAULT 0,
	`biggestWin` int NOT NULL DEFAULT 0,
	`biggestWinUser` varchar(100),
	`jackpotCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyStats_id` PRIMARY KEY(`id`),
	CONSTRAINT `dailyStats_date_unique` UNIQUE(`date`)
);
--> statement-breakpoint
CREATE TABLE `deposits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`packageType` varchar(20) NOT NULL,
	`spinsCount` int NOT NULL,
	`receiptUrl` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`adminNotes` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deposits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`result` enum('loss','near_win','small_win','medium_win','big_win','jackpot') NOT NULL,
	`amount` int NOT NULL,
	`segmentIndex` int NOT NULL,
	`finalRotation` int NOT NULL,
	`signature` varchar(128) NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`deviceInfo` text,
	`balanceBefore` int NOT NULL,
	`balanceAfter` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `spins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userDailyStats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`spinsCount` int NOT NULL DEFAULT 0,
	`totalWinnings` int NOT NULL DEFAULT 0,
	`totalLosses` int NOT NULL DEFAULT 0,
	`consecutiveWins` int NOT NULL DEFAULT 0,
	`consecutiveLosses` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userDailyStats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`availableBalance` int NOT NULL DEFAULT 0,
	`pendingBalance` int NOT NULL DEFAULT 0,
	`availableSpins` int NOT NULL DEFAULT 0,
	`totalWinnings` int NOT NULL DEFAULT 0,
	`totalLosses` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`shamCashAccount` varchar(100) NOT NULL,
	`shamCashName` varchar(100) NOT NULL,
	`status` enum('pending','processing','completed','rejected') NOT NULL DEFAULT 'pending',
	`adminNotes` text,
	`transferReference` varchar(100),
	`processedBy` int,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `withdrawals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `lastIp` varchar(45);--> statement-breakpoint
ALTER TABLE `users` ADD `lastDevice` text;--> statement-breakpoint
ALTER TABLE `users` ADD `dailyWinLimit` int DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isBlocked` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `blockReason` text;