import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workspacesTable = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorkspaceSchema = createInsertSchema(workspacesTable).omit({ id: true, createdAt: true });
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspacesTable.$inferSelect;

export const chatSessionsTable = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  model: text("model").notNull(),
  workspacePath: text("workspace_path"),
  systemPrompt: text("system_prompt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatSessionSchema = createInsertSchema(chatSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessionsTable.$inferSelect;

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => chatSessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;

export const terminalHistoryTable = pgTable("terminal_history", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  command: text("command").notNull(),
  stdout: text("stdout").notNull().default(""),
  stderr: text("stderr").notNull().default(""),
  exitCode: integer("exit_code"),
  cwd: text("cwd"),
  duration: integer("duration"),
  timedOut: boolean("timed_out").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
