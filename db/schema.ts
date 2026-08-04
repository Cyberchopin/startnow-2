import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const studyResponses = sqliteTable("study_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantKey: text("participant_key").notNull().unique(),
  relationship: text("relationship").notNull(),
  usefulness: integer("usefulness").notNull(),
  feltUnderstood: integer("felt_understood").notNull(),
  hardestStep: text("hardest_step").notNull(),
  wouldReturn: text("would_return").notNull(),
  feedback: text("feedback").notNull(),
  changeRequest: text("change_request").notNull(),
  category: text("category").notNull().default("unclassified"),
  reviewStatus: text("review_status").notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const researchDecisions = sqliteTable("research_decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responseId: integer("response_id"),
  userSaid: text("user_said").notNull(),
  weChanged: text("we_changed").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull().default("planned"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studyRateLimits = sqliteTable("study_rate_limits", {
  key: text("key").primaryKey(),
  attemptCount: integer("attempt_count").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
