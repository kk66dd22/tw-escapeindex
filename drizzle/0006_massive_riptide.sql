ALTER TABLE `topic_comments` ADD `clearStatus` varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `topic_comments` ADD `hasSpoiler` int DEFAULT 0 NOT NULL;