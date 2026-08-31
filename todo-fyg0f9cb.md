# Project TODO

- [x] Inspect the current topic data source and all occurrences of the 100-item count.
- [x] Add the 12 requested escape-room topics with the existing catalog data shape and venue associations.
- [x] Update every site-wide topic count, statistic, label, and promotional copy that currently says 100 items to 112.
- [x] Add or update Vitest coverage for the 12 topics and the 112-item count.
- [x] Run type checking, tests, and production/build validation; fix any regressions.
- [x] Save a checkpoint with all completed items marked as done.

- [x] Verify the existing Tainan venue/topic spelling for 神不在場 versus 神不再場 against project data and an authoritative source.
- [x] Correct the Tainan topic name to 神不在場 if the existing record is misspelled.
- [x] Add 神不在場台中館 topics 失落的隕石神殿 and 重返糖果屋.
- [x] Update every runtime count and regression expectation from 112 topics to 114.
- [x] Add Vitest coverage for the correction and the two new topics; run typecheck, tests, build, and data regressions.
- [x] Save a new checkpoint and deliver the corrected version.

- [x] Verify the existing Tainan 《神不在場》 record and official Taichung 《莎士比亞的邀請》 source before replacement.
- [x] Replace the incorrect Tainan 《神不在場》 catalog card with Taichung 《莎士比亞的邀請》 while keeping the total at 114 topics.
- [x] Update regression coverage and run typecheck, tests, build, and data validation for the replacement.
- [x] Save and deliver a new checkpoint for the corrected catalog.

- [x] Inspect the shared topic-card booking area and identify the three Taichung venue topics.
- [x] Add a responsive two-button booking layout for 莎士比亞的邀請、重返糖果屋、失落的隕石神殿.
- [x] Keep 前往官方預約頁 as the primary CTA and add 預約冒險者公會聚餐 linking to https://linkgo.one/s/3xwIG as the secondary CTA.
- [x] Add regression coverage and verify desktop/mobile layout, links, typecheck, tests, and build.
- [x] Save and deliver a new checkpoint.

- [x] Audit the 12 previously added topics and the 3 Taichung 神不在場 topics for missing horror, brain, pros, and cons fields.
- [x] Fill missing horror and brain indices using verified official information where available; retain official-announcement placeholders when not verifiable.
- [x] Add verified 導覽重點 and 遊玩提醒 content to the 12 previously added topics, without fabricating customer reviews or testimonials.
- [x] Add regression coverage for all 15 requested topics and run tests, typecheck, build, and page validation.
- [x] Save and deliver a new checkpoint.

- [x] Verify the current records and field names for the 14 requested topics.
- [x] Update booking URLs, player counts, and play durations for all 14 requested topics.
- [x] Remove 部分謎題較具挑戰性 whenever the same topic has 謎題與劇情具挑戰性 in 導覽重點.
- [x] Add regression coverage for the exact 14 updates and the tag conflict rule.
- [x] Run tests, typecheck, production build, and responsive/page validation.
- [x] Save and deliver a new checkpoint.

- [x] Inspect existing topic-card data, authentication hooks, database schema, and available UI components for comments.
- [x] Design and migrate a persisted comments table with topic identity, author identity, body, timestamps, and moderation-safe constraints.
- [x] Add public read and authenticated create/delete comment procedures with ownership and validation checks.
- [x] Add a topic-card comments section with empty/loading/error states, login CTA, form validation, and accessible controls.
- [x] Add Vitest coverage for schema-facing helpers/procedures and comment UI behavior without seeding fake reviews or testimonials.
- [x] Run migrations, tests, typecheck, production build, and responsive browser validation.
- [ ] Save and deliver a new checkpoint.

- [x] Make comment deletion return an explicit not-found or forbidden error when the target is missing or not owned by the current user, and surface deletion errors in the UI.
- [x] Add UI tests for comments covering empty, loading, error, authenticated submit, and owner-only delete states.
