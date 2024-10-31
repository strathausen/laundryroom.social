import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const User = pgTable("user", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  emailVerified: timestamp("emailVerified", {
    mode: "date",
    withTimezone: true,
  }),
  image: varchar("image", { length: 255 }),
  good_person: timestamp("good_person"), // does not require llm reviews
});

export const UserRelations = relations(User, ({ many }) => ({
  accounts: many(Account),
}));

export const Account = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => User.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 })
      .$type<"email" | "oauth" | "oidc" | "webauthn">()
      .notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    refresh_token: varchar("refresh_token", { length: 255 }),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const AccountRelations = relations(Account, ({ one }) => ({
  user: one(User, { fields: [Account.userId], references: [User.id] }),
}));

export const Session = pgTable("session", {
  sessionToken: varchar("sessionToken", { length: 255 }).notNull().primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => User.id, { onDelete: "cascade" }),
  expires: timestamp("expires", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
});

export const SessionRelations = relations(Session, ({ one }) => ({
  user: one(User, { fields: [Session.userId], references: [User.id] }),
}));

export const VerificationToken = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => ({
    compositePk: primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  }),
);

/**
 * additions to the main schema for the laundryroom app for organising meetups
 * those tables might include: Meetups, Comments Messages, Groups,
 * Notifications, Attendees (with status) and whatever else is needed
 */

export const GroupMemberRole = pgEnum("group_member_role", [
  "owner",
  "admin",
  "member",
  "moderator",
  "banned",
]);

export const MeetupAttendeeStatus = pgEnum("meetup_attendee_status", [
  "going",
  "not_going",
  "waitlist",
]);

export const GroupStatus = pgEnum("group_status", [
  "active",
  "archived",
  "hidden",
]);

export const GroupModerationStatus = pgEnum("group_moderation_tags", [
  "ok",
  "pending",
  "rejected",
  "review",
  "reported",
  "spam",
  "offensive",
  "inappropriate",
]);

export const Group = pgTable(
  "group",
  {
    id: uuid("id").notNull().primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull().unique(),
    description: text("description").notNull(),
    aiSearchText: text("ai_search_text").default("").notNull(),
    image: varchar("image", { length: 255 }),
    status: GroupStatus("status").default("active"),
    moderationStatus: GroupModerationStatus("moderation_status").default("ok"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    }).$onUpdateFn(() => sql`now()`),
  },
  (t) => ({
    seaarchIndex: index("search_index").using(
      "gin",
      sql`(
        setweight(to_tsvector('english', ${t.name}), 'A') ||
        setweight(to_tsvector('english', ${t.description}), 'B') ||
        setweight(to_tsvector('english', ${t.aiSearchText}), 'C')
      )`,
    ),
  }),
);

export const UpsertGroupSchema = createInsertSchema(Group, {
  id: z.string().optional(),
  name: z.string().max(255).min(3),
  description: z.string().max(255).min(20),
  image: z.string().max(255).optional(),
}).omit({
  createdAt: true,
  updatedAt: true,
  status: true,
  moderationStatus: true,
  aiSearchText: true,
});

export const GroupRelations = relations(Group, ({ many }) => ({
  members: many(GroupMember),
  meetups: many(Meetup),
  comments: many(Comment),
  messages: many(Discussion),
  notifications: many(Notification),
}));

export const CreateGroupSchema = createInsertSchema(Group, {
  name: z.string().max(255),
  description: z.string().max(255),
  image: z.string().max(255),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const GroupMember = pgTable(
  "group_member",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => Group.id, {
        onDelete: "cascade",
      }),
    userId: uuid("user_id")
      .notNull()
      .references(() => User.id, {
        onDelete: "cascade",
      }),
    role: GroupMemberRole("role").default("member").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    }).$onUpdateFn(() => sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
  }),
);

export const GroupMemberRelations = relations(GroupMember, ({ one }) => ({
  group: one(Group, {
    fields: [GroupMember.groupId],
    references: [Group.id],
  }),
  user: one(User, {
    fields: [GroupMember.userId],
    references: [User.id],
  }),
}));

export const Meetup = pgTable("meetup", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => Group.id, {
      onDelete: "cascade",
    }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").default("").notNull(),
  location: varchar("location", { length: 255 }).default("").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).$onUpdateFn(() => new Date()),
});

export const UpsertMeetupSchema = createInsertSchema(Meetup, {
  id: z.string().optional().nullable(),
  groupId: z.string(),
  title: z.string().max(255).min(3),
  description: z.string().max(255).min(3),
  location: z.string().max(255),
  startTime: z.string().min(3),
  // endTime: z.string().min(3).optional(),
}).omit({
  createdAt: true,
  updatedAt: true,
  endTime: true,
});

export const MeetupRelations = relations(Meetup, ({ one, many }) => ({
  group: one(Group, {
    fields: [Meetup.groupId],
    references: [Group.id],
  }),
  attendees: many(Attendee),
}));

export const Attendee = pgTable(
  "attendee",
  {
    meetupId: uuid("meetup_id")
      .notNull()
      .references(() => Meetup.id, {
        onDelete: "cascade",
      }),
    userId: uuid("user_id")
      .notNull()
      .references(() => User.id, {
        onDelete: "cascade",
      }),
    status: MeetupAttendeeStatus("status"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    }).$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.meetupId, t.userId] }),
  }),
);

export const AttendeeRelations = relations(Attendee, ({ one }) => ({
  meetup: one(Meetup, {
    fields: [Attendee.meetupId],
    references: [Meetup.id],
  }),
  user: one(User, {
    fields: [Attendee.userId],
    references: [User.id],
  }),
}));

export const Comment = pgTable("comment", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => Group.id, {
      onDelete: "cascade",
    }),
  userId: uuid("user_id")
    .notNull()
    .references(() => User.id, {
      onDelete: "cascade",
    }),
  discussionId: uuid("discussion_id")
    .notNull()
    .references(() => Discussion.id, {
      onDelete: "cascade",
    }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).$onUpdateFn(() => new Date()),
});

export const Discussion = pgTable("discussion", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => Group.id, {
      onDelete: "cascade",
    }),
  userId: uuid("user_id")
    .notNull()
    .references(() => User.id, {
      onDelete: "cascade",
    }),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).$onUpdateFn(() => sql`now()`),
});

export const UpsertDiscussionSchema = createInsertSchema(Discussion, {
  id: z.string().optional(),
  groupId: z.string(),
  title: z.string().max(255).min(3),
  content: z.string().min(3).max(400),
}).omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const DiscussionRelations = relations(Discussion, ({ one, many }) => ({
  group: one(Group, {
    fields: [Discussion.groupId],
    references: [Group.id],
  }),
  user: one(User, {
    fields: [Discussion.userId],
    references: [User.id],
  }),
  comments: many(Comment),
}));

export const CommentRelations = relations(Comment, ({ one }) => ({
  group: one(Group, {
    fields: [Comment.groupId],
    references: [Group.id],
  }),
  user: one(User, {
    fields: [Comment.userId],
    references: [User.id],
  }),
  discussion: one(Discussion, {
    fields: [Comment.discussionId],
    references: [Discussion.id],
  }),
}));

export const Notification = pgTable("notification", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => User.id, {
      onDelete: "cascade",
    }),
  content: text("content").notNull(),
  read: timestamp("read", {
    mode: "date",
    withTimezone: true,
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).$onUpdateFn(() => sql`now()`),
});

export const NotificationRelations = relations(Notification, ({ one }) => ({
  user: one(User, {
    fields: [Notification.userId],
    references: [User.id],
  }),
}));
