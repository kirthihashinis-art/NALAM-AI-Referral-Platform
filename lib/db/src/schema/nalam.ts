import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const facilitiesTable = pgTable("nalam_facilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  district: text("district").notNull(),
  address: text("address").notNull(),
  contactNumber: text("contact_number").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertFacilitySchema = createInsertSchema(facilitiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type Facility = typeof facilitiesTable.$inferSelect;

export const patientsTable = pgTable("nalam_patients", {
  patientId: text("patient_id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  contactNumber: text("contact_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;

export const referralsTable = pgTable("nalam_referrals", {
  id: serial("id").primaryKey(),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.patientId),
  facilityId: integer("facility_id")
    .notNull()
    .references(() => facilitiesTable.id),
  referralDate: date("referral_date", { mode: "string" }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  id: true,
  status: true,
  createdAt: true,
});
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;

export const followupsTable = pgTable("nalam_followups", {
  id: serial("id").primaryKey(),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.patientId),
  referralId: integer("referral_id").references(() => referralsTable.id),
  facilityId: integer("facility_id")
    .notNull()
    .references(() => facilitiesTable.id),
  followUpDate: date("follow_up_date", { mode: "string" }).notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("scheduled"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertFollowupSchema = createInsertSchema(followupsTable).omit({
  id: true,
  status: true,
  createdAt: true,
});
export type InsertFollowup = z.infer<typeof insertFollowupSchema>;
export type Followup = typeof followupsTable.$inferSelect;

export const appUsersTable = pgTable("nalam_app_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("pending"),
  facilityId: integer("facility_id").references(() => facilitiesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;
