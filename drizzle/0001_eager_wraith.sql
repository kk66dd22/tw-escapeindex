CREATE TABLE `topic_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topicId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topic_comments_id` PRIMARY KEY(`id`)
);
