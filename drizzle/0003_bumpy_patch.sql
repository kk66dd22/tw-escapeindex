ALTER TABLE `topic_comments` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `topic_comments` ADD `anonymousToken` varchar(64);