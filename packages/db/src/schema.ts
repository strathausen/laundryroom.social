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

export const UserRole = pgEnum("user_role", [
  "user",
  "good_person", // a user that has been verified as a good person and doesn't need LLMs to check their contributions
  "moderator", // can moderate all groups and discussions
  "admin", // can manage all groups and users
  "owner",
]);

export const User = pgTable("user", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  emailVerified: timestamp("emailVerified", {
    mode: "date",
    withTimezone: true,
  }),
  image: varchar("image", { length: 255 }),
  bio: text("bio"),
  pronouns: varchar("pronouns", { length: 255 }),
  links: text("links").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  role: UserRole("role").default("user").notNull(),
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
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
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

export const ModerationStatus = pgEnum("group_moderation_tags", [
  "ok",
  "pending",
  "rejected",
  "review",
  "reported",
  "spam",
  "offensive",
  "inappropriate",
]);

const meetupStatusElements = [
  "active",
  "archived",
  "hidden",
  "cancelled",
  "postponed",
  "full",
] as const;

export const MeetupStatus = pgEnum("meetup_status", meetupStatusElements);

// as a groth hack, I offer to manually promote chosen groups free of charge
// this is a way to get more users to use the platform and get feedback
// e.g. by printing out a QR code to the group page and sticking it to a wall
// or on a traffic light pole, or by sharing the group on social media
export const GroupPromotionStatus = pgEnum("group_promotion_status", [
  "promotable",
  "pending",
  "approved",
  "rejected",
  "promoted",
  "not_interested",
]);

export const Group = pgTable(
  "group",
  {
    id: uuid("id").notNull().primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull().unique(),
    description: text("description").notNull(),
    aiSearchText: text("ai_search_text").default("").notNull(),
    image: varchar("image", { length: 255 }),
    imageDescription: text("image_description"),
    status: GroupStatus("status").default("active"),
    moderationStatus: ModerationStatus("moderation_status").default("ok"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    }).$onUpdateFn(() => sql`now()`),
  },
  (t) => [
    index("search_index").using(
      "gin",
      sql`(
        setweight(to_tsvector('english', ${t.name}), 'A') ||
        setweight(to_tsvector('english', ${t.description}), 'B') ||
        setweight(to_tsvector('english', ${t.aiSearchText}), 'C')
      )`,
    ),
  ],
);

export const UpsertGroupSchema = createInsertSchema(Group, {
  id: z.string().optional(),
  name: z.string().max(255).min(3),
  description: z.string().max(255).min(20),
  image: z.string().max(255),
}).omit({
  createdAt: true,
  updatedAt: true,
  status: true,
  moderationStatus: true,
  aiSearchText: true,
  imageDescription: true,
});

export const GroupRelations = relations(Group, ({ many, one }) => ({
  members: many(GroupMember),
  meetups: many(Meetup),
  comments: many(Comment),
  messages: many(Discussion),
  notifications: many(Notification),
  promotion: one(GroupPromotion, {
    fields: [Group.id],
    references: [GroupPromotion.groupId],
  }),
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
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
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
  startTime: timestamp("start_time", {
    withTimezone: true,
  }).notNull(),
  duration: integer("duration").default(60).notNull(), // in minutes
  status: MeetupStatus("status").default("active").notNull(),
  attendeeLimit: integer("attendee_limit").default(100),
  // if used as a cursor, this should be a string based timestamp for more accurate pagination
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).$onUpdateFn(() => new Date()),
  organizerId: uuid("organizer_id").references(() => User.id, {
    onDelete: "set null",
  }),
});

export const UpsertMeetupSchema = createInsertSchema(Meetup, {
  id: z.string().optional().nullable(),
  groupId: z.string(),
  title: z.string().max(255).min(3),
  description: z.string().max(255).min(3),
  location: z.string().max(255),
  startTime: z.coerce.date(),
  duration: z.number().int().positive(),
  status: z.enum(meetupStatusElements).optional(),
  attendeeLimit: z.number().int().positive().optional(),
}).omit({
  createdAt: true,
  updatedAt: true,
  organizerId: true,
});

export const MeetupRelations = relations(Meetup, ({ one, many }) => ({
  group: one(Group, {
    fields: [Meetup.groupId],
    references: [Group.id],
  }),
  attendees: many(Attendee),
  organizer: one(User, {
    fields: [Meetup.organizerId],
    references: [User.id],
  }),
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
  (t) => [primaryKey({ columns: [t.meetupId, t.userId] })],
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
  moderationStatus: ModerationStatus("moderation_status").default("ok"),
  // if used as a cursor, this should be a string based timestamp for more accurate pagination
  // javascript date would chop off milliseconds and cause items to be skipped in infinite scroll
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
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
  moderationStatus: ModerationStatus("moderation_status").default("ok"),
  // see Comment.createdAt for why this is a string
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).$onUpdateFn(() => new Date()),
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
  moderationStatus: true,
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

export const UpdateProfileSchema = createInsertSchema(User, {
  name: z.string().max(255).optional(),
  pronouns: z.string().max(255).optional(),
  links: z.array(z.string()).optional(),
  bio: z.string().optional(),
  image: z.string().max(255).optional(),
}).omit({
  email: true,
  emailVerified: true,
  role: true,
});

export const GroupPromotion = pgTable("group_promotion", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .unique()
    .references(() => Group.id, {
      onDelete: "cascade",
    }),
  userId: uuid("user_id")
    .notNull()
    .references(() => User.id, {
      onDelete: "cascade",
    }),
  message: text("message"),
  promotionStatus: GroupPromotionStatus("promotion_status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).$onUpdateFn(() => new Date()),
});

export const GroupPromotionRelations = relations(GroupPromotion, ({ one }) => ({
  group: one(Group, {
    fields: [GroupPromotion.groupId],
    references: [Group.id],
  }),
  user: one(User, {
    fields: [GroupPromotion.userId],
    references: [User.id],
  }),
}));

export const PledgeBoard = pgTable("pledge_board", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").default(""),
  meetupId: uuid("meetup_id")
    .notNull()
    .references(() => Meetup.id, { onDelete: "cascade" })
    .unique(),
  createdBy: uuid("created_by").references(() => User.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const Pledge = pgTable("pledge", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  pledgeBoardId: uuid("pledge_board_id")
    .notNull()
    .references(() => PledgeBoard.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").default(""),
  sortOrder: integer("sort_order").default(0).notNull(),
  capacity: integer("capacity").default(1).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const PledgeFulfillment = pgTable("pledge_fulfillment", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  pledgeId: uuid("pledge_id")
    .notNull()
    .references(() => Pledge.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => User.id, { onDelete: "cascade" }),
  quantity: integer("quantity").default(1).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const UpsertPledgeBoardSchema = createInsertSchema(PledgeBoard, {
  id: z.string().optional(),
  title: z.string().max(255).min(3),
  meetupId: z.string().uuid(),
}).omit({
  createdBy: true,
  createdAt: true,
  updatedAt: true,
});

// For inserting a new pledge
export const UpsertPledgeSchema = createInsertSchema(Pledge, {
  id: z.string().optional(),
  pledgeBoardId: z.string().uuid(),
  title: z.string().min(3).max(255),
  description: z.string().max(255).optional(),
  capacity: z.number().int().positive().optional(),
}).omit({
  createdAt: true,
  updatedAt: true,
});

// For user to fulfill a pledge
export const CreatePledgeFulfillmentSchema = createInsertSchema(
  PledgeFulfillment,
  {
    pledgeId: z.string().uuid(),
    userId: z.string().uuid(),
    quantity: z.number().int().positive().optional(),
  },
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const PledgeBoardRelations = relations(PledgeBoard, ({ one, many }) => ({
  meetup: one(Meetup, {
    fields: [PledgeBoard.meetupId],
    references: [Meetup.id],
  }),
  createdBy: one(User, {
    fields: [PledgeBoard.createdBy],
    references: [User.id],
  }),
  pledges: many(Pledge),
}));

export const PledgeRelations = relations(Pledge, ({ one, many }) => ({
  pledgeBoard: one(PledgeBoard, {
    fields: [Pledge.pledgeBoardId],
    references: [PledgeBoard.id],
  }),
  fulfillments: many(PledgeFulfillment),
}));

export const PledgeFulfillmentRelations = relations(
  PledgeFulfillment,
  ({ one }) => ({
    pledge: one(Pledge, {
      fields: [PledgeFulfillment.pledgeId],
      references: [Pledge.id],
    }),
    user: one(User, {
      fields: [PledgeFulfillment.userId],
      references: [User.id],
    }),
  }),
);
