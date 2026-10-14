import OpenAI from "openai";
import { clerkClient } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  CreateFacilityBody,
  CreateFacilityResponse,
  CreateFollowupBody,
  CreateFollowupResponse,
  CreateReferralBody,
  CreateReferralResponse,
  GetAssistantReplyBody,
  GetAssistantReplyResponse,
  GetCurrentUserResponse,
  GetDashboardSummaryResponse,
  ListFacilitiesResponse,
  ListFollowupsQueryParams,
  ListFollowupsResponse,
  ListPatientsQueryParams,
  ListPatientsResponse,
  ListReferralsQueryParams,
  ListReferralsResponse,
  ListUsersResponse,
  UpdateFacilityBody,
  UpdateFacilityParams,
  UpdateFacilityResponse,
  UpdateFollowupBody,
  UpdateFollowupParams,
  UpdateFollowupResponse,
  UpdateReferralStatusBody,
  UpdateReferralStatusParams,
  UpdateReferralStatusResponse,
  UpdateUserRoleBody,
  UpdateUserRoleParams,
  UpdateUserRoleResponse,
} from "@workspace/api-zod";
import {
  appUsersTable,
  db,
  facilitiesTable,
  followupsTable,
  patientsTable,
  referralsTable,
} from "@workspace/db";

const router: IRouter = Router();
const ROLE_VALUES = [
  "administrator",
  "health_worker",
  "facility_staff",
  "pending",
] as const;
type AppRole = (typeof ROLE_VALUES)[number];
type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  facilityId: number | null;
  facilityName: string | null;
};

const openai =
  process.env.OPENAI_API_KEY &&
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantRate = new Map<string, { count: number; resetsAt: number }>();

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

function asDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function serializeReferral(
  row: {
    id: number;
    patientId: string;
    patientName: string;
    patientAge: number;
    contactNumber: string;
    facilityId: number;
    facilityName: string;
    referralDate: string;
    reason: string;
    status: string;
    createdAt: Date;
  },
) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function serializePatient(row: {
  patientId: string;
  name: string;
  age: number;
  contactNumber: string;
  createdAt: Date;
}) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function referralScope(user: CurrentUser): SQL {
  switch (user.role) {
    case "administrator":
      return sql`true`;
    case "health_worker":
      return eq(referralsTable.createdBy, user.id);
    case "facility_staff":
      return user.facilityId
        ? eq(referralsTable.facilityId, user.facilityId)
        : sql`false`;
    default:
      return sql`false`;
  }
}

function followupScope(user: CurrentUser): SQL {
  switch (user.role) {
    case "administrator":
      return sql`true`;
    case "health_worker":
      return eq(followupsTable.createdBy, user.id);
    case "facility_staff":
      return user.facilityId
        ? eq(followupsTable.facilityId, user.facilityId)
        : sql`false`;
    default:
      return sql`false`;
  }
}

async function findUser(userId: string): Promise<CurrentUser | null> {
  const [row] = await db
    .select({
      id: appUsersTable.id,
      name: appUsersTable.name,
      email: appUsersTable.email,
      role: appUsersTable.role,
      facilityId: appUsersTable.facilityId,
      facilityName: facilitiesTable.name,
    })
    .from(appUsersTable)
    .leftJoin(facilitiesTable, eq(appUsersTable.facilityId, facilitiesTable.id))
    .where(eq(appUsersTable.id, userId))
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    role: ROLE_VALUES.includes(row.role as AppRole)
      ? (row.role as AppRole)
      : "pending",
  };
}

async function activeUser(req: Request, res: Response): Promise<CurrentUser | null> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to access this record." });
    return null;
  }

  const user = await findUser(userId);
  if (!user) {
    res.status(403).json({ error: "Your NALAM profile is not available." });
    return null;
  }
  if (user.role === "pending") {
    res.status(403).json({
      error: "Your account is awaiting access from a NALAM administrator.",
    });
    return null;
  }
  return user;
}

function administratorOnly(user: CurrentUser, res: Response): boolean {
  if (user.role === "administrator") return true;
  res.status(403).json({ error: "Administrator access is required." });
  return false;
}

function serializeFollowup(row: {
  id: number;
  patientId: string;
  patientName: string;
  referralId: number | null;
  facilityId: number;
  facilityName: string;
  followUpDate: string;
  notes: string;
  status: string;
}) {
  return {
    ...row,
    overdue: row.status === "scheduled" && row.followUpDate < todayInIndia(),
  };
}

async function canAccessPatient(
  patientId: string,
  user: CurrentUser,
): Promise<boolean> {
  const [record] = await db
    .select({ patientId: referralsTable.patientId })
    .from(referralsTable)
    .where(
      and(
        eq(referralsTable.patientId, patientId),
        referralScope(user),
      ),
    )
    .limit(1);
  return Boolean(record);
}

router.get("/me", async (req, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Sign in to access NALAM AI." });
    return;
  }

  const clerkUser = await clerkClient.users.getUser(req.userId);
  const email = clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    res.status(400).json({ error: "A verified email address is required." });
    return;
  }

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(80421159)`);
    const [existing] = await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(eq(appUsersTable.id, req.userId!))
      .limit(1);

    if (existing) {
      await tx
        .update(appUsersTable)
        .set({ name: displayName, email })
        .where(eq(appUsersTable.id, req.userId!));
      return;
    }

    const [firstAdmin] = await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(eq(appUsersTable.role, "administrator"))
      .limit(1);

    await tx.insert(appUsersTable).values({
      id: req.userId!,
      name: displayName,
      email,
      role: firstAdmin ? "pending" : "administrator",
    });
  });

  const user = await findUser(req.userId);
  if (!user) {
    res.status(500).json({ error: "Could not load your NALAM profile." });
    return;
  }
  res.json(
    GetCurrentUserResponse.parse({
      ...user,
      facilityId: user.facilityId ?? null,
      facilityName: user.facilityName ?? null,
    }),
  );
});

router.get("/users", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user || !administratorOnly(user, res)) return;

  const rows = await db
    .select({
      id: appUsersTable.id,
      name: appUsersTable.name,
      email: appUsersTable.email,
      role: appUsersTable.role,
      facilityId: appUsersTable.facilityId,
      facilityName: facilitiesTable.name,
    })
    .from(appUsersTable)
    .leftJoin(facilitiesTable, eq(appUsersTable.facilityId, facilitiesTable.id))
    .orderBy(appUsersTable.name);

  res.json(
    ListUsersResponse.parse(
      rows.map((row) => ({
        ...row,
        role: ROLE_VALUES.includes(row.role as AppRole)
          ? row.role
          : "pending",
        facilityId: row.facilityId ?? null,
        facilityName: row.facilityName ?? null,
      })),
    ),
  );
});

router.patch("/users/:id/role", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user || !administratorOnly(user, res)) return;

  const params = UpdateUserRoleParams.safeParse(req.params);
  const body = UpdateUserRoleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid role and facility." });
    return;
  }

  const { role, facilityId } = body.data;
  if (
    role !== "administrator" &&
    role !== "pending" &&
    facilityId === null
  ) {
    res.status(400).json({
      error: "Healthcare workers and facility staff need an assigned facility.",
    });
    return;
  }
  if (facilityId !== null) {
    const [facility] = await db
      .select({ id: facilitiesTable.id })
      .from(facilitiesTable)
      .where(and(eq(facilitiesTable.id, facilityId), eq(facilitiesTable.active, true)))
      .limit(1);
    if (!facility) {
      res.status(400).json({ error: "Choose an active facility." });
      return;
    }
  }
  if (params.data.id === user.id && role !== "administrator") {
    const otherAdmins = await db
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(
        and(
          eq(appUsersTable.role, "administrator"),
          sql`${appUsersTable.id} <> ${user.id}`,
        ),
      )
      .limit(1);
    if (otherAdmins.length === 0) {
      res.status(400).json({
        error: "Assign another administrator before changing your own access.",
      });
      return;
    }
  }

  const [updated] = await db
    .update(appUsersTable)
    .set({ role, facilityId })
    .where(eq(appUsersTable.id, params.data.id))
    .returning({ id: appUsersTable.id });
  if (!updated) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const updatedProfile = await findUser(updated.id);
  if (!updatedProfile) {
    res.status(500).json({ error: "Could not load the updated user." });
    return;
  }
  res.json(
    UpdateUserRoleResponse.parse({
      ...updatedProfile,
      facilityId: updatedProfile.facilityId ?? null,
      facilityName: updatedProfile.facilityName ?? null,
    }),
  );
});

router.get("/facilities", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;

  const rows = await db
    .select({
      id: facilitiesTable.id,
      name: facilitiesTable.name,
      kind: facilitiesTable.kind,
      district: facilitiesTable.district,
      address: facilitiesTable.address,
      contactNumber: facilitiesTable.contactNumber,
      active: facilitiesTable.active,
    })
    .from(facilitiesTable)
    .where(
      user.role === "administrator" ? undefined : eq(facilitiesTable.active, true),
    )
    .orderBy(facilitiesTable.name);
  res.json(ListFacilitiesResponse.parse(rows));
});

router.post("/facilities", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user || !administratorOnly(user, res)) return;
  const body = CreateFacilityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter valid facility information." });
    return;
  }
  const [facility] = await db
    .insert(facilitiesTable)
    .values(body.data)
    .returning({
      id: facilitiesTable.id,
      name: facilitiesTable.name,
      kind: facilitiesTable.kind,
      district: facilitiesTable.district,
      address: facilitiesTable.address,
      contactNumber: facilitiesTable.contactNumber,
      active: facilitiesTable.active,
    });
  res.status(201).json(CreateFacilityResponse.parse(facility));
});

router.patch("/facilities/:id", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user || !administratorOnly(user, res)) return;
  const params = UpdateFacilityParams.safeParse(req.params);
  const body = UpdateFacilityBody.safeParse(req.body);
  if (!params.success || !body.success || Object.keys(body.data ?? {}).length === 0) {
    res.status(400).json({ error: "Enter at least one valid facility update." });
    return;
  }
  const [facility] = await db
    .update(facilitiesTable)
    .set(body.data)
    .where(eq(facilitiesTable.id, params.data.id))
    .returning({
      id: facilitiesTable.id,
      name: facilitiesTable.name,
      kind: facilitiesTable.kind,
      district: facilitiesTable.district,
      address: facilitiesTable.address,
      contactNumber: facilitiesTable.contactNumber,
      active: facilitiesTable.active,
    });
  if (!facility) {
    res.status(404).json({ error: "Facility not found." });
    return;
  }
  res.json(UpdateFacilityResponse.parse(facility));
});

router.get("/patients", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  const query = ListPatientsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid patient search." });
    return;
  }

  const search = query.data.search?.trim();
  const conditions = [referralScope(user)];
  if (search) {
    conditions.push(
      or(
        ilike(patientsTable.patientId, `%${search}%`),
        ilike(patientsTable.name, `%${search}%`),
      )!,
    );
  }

  const rows = await db
    .selectDistinct({
      patientId: patientsTable.patientId,
      name: patientsTable.name,
      age: patientsTable.age,
      contactNumber: patientsTable.contactNumber,
      createdAt: patientsTable.createdAt,
    })
    .from(patientsTable)
    .innerJoin(referralsTable, eq(referralsTable.patientId, patientsTable.patientId))
    .where(and(...conditions))
    .orderBy(patientsTable.name)
    .limit(200);
  res.json(ListPatientsResponse.parse(rows.map(serializePatient)));
});

router.get("/referrals", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  const query = ListReferralsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid referral search filters." });
    return;
  }
  const conditions = [referralScope(user)];
  const search = query.data.search?.trim();
  if (query.data.status) conditions.push(eq(referralsTable.status, query.data.status));
  if (query.data.facilityId !== undefined) {
    conditions.push(eq(referralsTable.facilityId, query.data.facilityId));
  }
  if (query.data.dateFrom) {
    conditions.push(
      gte(referralsTable.referralDate, asDateString(query.data.dateFrom)),
    );
  }
  if (query.data.dateTo) {
    conditions.push(
      sql`${referralsTable.referralDate} <= ${asDateString(query.data.dateTo)}`,
    );
  }
  if (search) {
    conditions.push(
      or(
        ilike(patientsTable.patientId, `%${search}%`),
        ilike(patientsTable.name, `%${search}%`),
        ilike(facilitiesTable.name, `%${search}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: referralsTable.id,
      patientId: patientsTable.patientId,
      patientName: patientsTable.name,
      patientAge: patientsTable.age,
      contactNumber: patientsTable.contactNumber,
      facilityId: facilitiesTable.id,
      facilityName: facilitiesTable.name,
      referralDate: referralsTable.referralDate,
      reason: referralsTable.reason,
      status: referralsTable.status,
      createdAt: referralsTable.createdAt,
    })
    .from(referralsTable)
    .innerJoin(patientsTable, eq(referralsTable.patientId, patientsTable.patientId))
    .innerJoin(facilitiesTable, eq(referralsTable.facilityId, facilitiesTable.id))
    .where(and(...conditions))
    .orderBy(desc(referralsTable.referralDate), desc(referralsTable.id))
    .limit(300);
  res.json(ListReferralsResponse.parse(rows.map(serializeReferral)));
});

router.post("/referrals", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  if (user.role !== "administrator" && user.role !== "health_worker") {
    res.status(403).json({ error: "Only healthcare workers can create referrals." });
    return;
  }
  const body = CreateReferralBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Check the required referral fields." });
    return;
  }
  const [facility] = await db
    .select({ id: facilitiesTable.id })
    .from(facilitiesTable)
    .where(
      and(
        eq(facilitiesTable.id, body.data.facilityId),
        eq(facilitiesTable.active, true),
      ),
    )
    .limit(1);
  if (!facility) {
    res.status(400).json({ error: "Choose an active destination facility." });
    return;
  }

  const [existingPatient] = await db
    .select({ patientId: patientsTable.patientId })
    .from(patientsTable)
    .where(eq(patientsTable.patientId, body.data.patientId))
    .limit(1);
  if (
    existingPatient &&
    user.role !== "administrator" &&
    !(await canAccessPatient(body.data.patientId, user))
  ) {
    res.status(409).json({
      error: "That patient ID is already assigned to a restricted record.",
    });
    return;
  }

  const referral = await db.transaction(async (tx) => {
    await tx
      .insert(patientsTable)
      .values({
        patientId: body.data.patientId,
        name: body.data.patientName,
        age: body.data.age,
        contactNumber: body.data.contactNumber,
      })
      .onConflictDoUpdate({
        target: patientsTable.patientId,
        set: {
          name: body.data.patientName,
          age: body.data.age,
          contactNumber: body.data.contactNumber,
        },
      });

    const [created] = await tx
      .insert(referralsTable)
      .values({
        patientId: body.data.patientId,
        facilityId: body.data.facilityId,
        referralDate: asDateString(body.data.referralDate),
        reason: body.data.reason,
        createdBy: user.id,
      })
      .returning({ id: referralsTable.id });

    const [row] = await tx
      .select({
        id: referralsTable.id,
        patientId: patientsTable.patientId,
        patientName: patientsTable.name,
        patientAge: patientsTable.age,
        contactNumber: patientsTable.contactNumber,
        facilityId: facilitiesTable.id,
        facilityName: facilitiesTable.name,
        referralDate: referralsTable.referralDate,
        reason: referralsTable.reason,
        status: referralsTable.status,
        createdAt: referralsTable.createdAt,
      })
      .from(referralsTable)
      .innerJoin(patientsTable, eq(referralsTable.patientId, patientsTable.patientId))
      .innerJoin(facilitiesTable, eq(referralsTable.facilityId, facilitiesTable.id))
      .where(eq(referralsTable.id, created.id))
      .limit(1);
    return row;
  });
  res
    .status(201)
    .json(CreateReferralResponse.parse(serializeReferral(referral)));
});

router.patch("/referrals/:id/status", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  if (user.role !== "administrator" && user.role !== "facility_staff") {
    res.status(403).json({ error: "Facility staff update referral status." });
    return;
  }
  const params = UpdateReferralStatusParams.safeParse(req.params);
  const body = UpdateReferralStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid referral status." });
    return;
  }
  const conditions = [
    eq(referralsTable.id, params.data.id),
    user.role === "facility_staff"
      ? eq(referralsTable.facilityId, user.facilityId ?? -1)
      : sql`true`,
  ];
  const [updated] = await db
    .update(referralsTable)
    .set({ status: body.data.status })
    .where(and(...conditions))
    .returning({ id: referralsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Referral not found at your facility." });
    return;
  }
  const [row] = await db
    .select({
      id: referralsTable.id,
      patientId: patientsTable.patientId,
      patientName: patientsTable.name,
      patientAge: patientsTable.age,
      contactNumber: patientsTable.contactNumber,
      facilityId: facilitiesTable.id,
      facilityName: facilitiesTable.name,
      referralDate: referralsTable.referralDate,
      reason: referralsTable.reason,
      status: referralsTable.status,
      createdAt: referralsTable.createdAt,
    })
    .from(referralsTable)
    .innerJoin(patientsTable, eq(referralsTable.patientId, patientsTable.patientId))
    .innerJoin(facilitiesTable, eq(referralsTable.facilityId, facilitiesTable.id))
    .where(eq(referralsTable.id, updated.id))
    .limit(1);
  res.json(
    UpdateReferralStatusResponse.parse(serializeReferral(row)),
  );
});

router.get("/followups", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  const query = ListFollowupsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid follow-up filter." });
    return;
  }
  const today = todayInIndia();
  const conditions = [followupScope(user)];
  if (query.data.state === "completed") {
    conditions.push(eq(followupsTable.status, "completed"));
  } else if (query.data.state === "upcoming") {
    conditions.push(
      and(
        eq(followupsTable.status, "scheduled"),
        gte(followupsTable.followUpDate, today),
      )!,
    );
  } else if (query.data.state === "overdue") {
    conditions.push(
      and(
        eq(followupsTable.status, "scheduled"),
        lt(followupsTable.followUpDate, today),
      )!,
    );
  } else if (query.data.state !== "all") {
    conditions.push(eq(followupsTable.status, "scheduled"));
  }
  const rows = await db
    .select({
      id: followupsTable.id,
      patientId: patientsTable.patientId,
      patientName: patientsTable.name,
      referralId: followupsTable.referralId,
      facilityId: facilitiesTable.id,
      facilityName: facilitiesTable.name,
      followUpDate: followupsTable.followUpDate,
      notes: followupsTable.notes,
      status: followupsTable.status,
    })
    .from(followupsTable)
    .innerJoin(patientsTable, eq(followupsTable.patientId, patientsTable.patientId))
    .innerJoin(facilitiesTable, eq(followupsTable.facilityId, facilitiesTable.id))
    .where(and(...conditions))
    .orderBy(followupsTable.followUpDate, desc(followupsTable.id))
    .limit(300);
  res.json(
    ListFollowupsResponse.parse(rows.map(serializeFollowup)),
  );
});

router.post("/followups", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  if (!ROLE_VALUES.slice(0, 3).includes(user.role)) {
    res.status(403).json({ error: "Your role cannot schedule follow-ups." });
    return;
  }
  const body = CreateFollowupBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Check the required follow-up fields." });
    return;
  }
  if (
    user.role === "facility_staff" &&
    user.facilityId !== body.data.facilityId
  ) {
    res.status(403).json({ error: "You can schedule visits only at your facility." });
    return;
  }
  const [facility] = await db
    .select({ id: facilitiesTable.id })
    .from(facilitiesTable)
    .where(
      and(
        eq(facilitiesTable.id, body.data.facilityId),
        eq(facilitiesTable.active, true),
      ),
    )
    .limit(1);
  if (!facility) {
    res.status(400).json({ error: "Choose an active facility." });
    return;
  }
  if (!(await canAccessPatient(body.data.patientId, user))) {
    res.status(404).json({ error: "Patient not found in your accessible records." });
    return;
  }
  if (body.data.referralId !== null) {
    const [referral] = await db
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(
        and(
          eq(referralsTable.id, body.data.referralId),
          eq(referralsTable.patientId, body.data.patientId),
          referralScope(user),
        ),
      )
      .limit(1);
    if (!referral) {
      res.status(404).json({ error: "Referral not found in your accessible records." });
      return;
    }
  }
  const [created] = await db
    .insert(followupsTable)
    .values({
      patientId: body.data.patientId,
      referralId: body.data.referralId,
      facilityId: body.data.facilityId,
      followUpDate: asDateString(body.data.followUpDate),
      notes: body.data.notes,
      createdBy: user.id,
    })
    .returning({ id: followupsTable.id });
  const [row] = await db
    .select({
      id: followupsTable.id,
      patientId: patientsTable.patientId,
      patientName: patientsTable.name,
      referralId: followupsTable.referralId,
      facilityId: facilitiesTable.id,
      facilityName: facilitiesTable.name,
      followUpDate: followupsTable.followUpDate,
      notes: followupsTable.notes,
      status: followupsTable.status,
    })
    .from(followupsTable)
    .innerJoin(patientsTable, eq(followupsTable.patientId, patientsTable.patientId))
    .innerJoin(facilitiesTable, eq(followupsTable.facilityId, facilitiesTable.id))
    .where(eq(followupsTable.id, created.id))
    .limit(1);
  res.status(201).json(
    CreateFollowupResponse.parse(serializeFollowup(row)),
  );
});

router.patch("/followups/:id", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  const params = UpdateFollowupParams.safeParse(req.params);
  const body = UpdateFollowupBody.safeParse(req.body);
  if (!params.success || !body.success || Object.keys(body.data ?? {}).length === 0) {
    res.status(400).json({ error: "Enter a valid follow-up update." });
    return;
  }
  const existingConditions = [
    eq(followupsTable.id, params.data.id),
    followupScope(user),
  ];
  const [existing] = await db
    .select({ id: followupsTable.id })
    .from(followupsTable)
    .where(and(...existingConditions))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Follow-up not found in your accessible records." });
    return;
  }
  const [updated] = await db
    .update(followupsTable)
    .set({
      ...(body.data.followUpDate
        ? { followUpDate: asDateString(body.data.followUpDate) }
        : {}),
      ...(body.data.notes !== undefined ? { notes: body.data.notes } : {}),
      ...(body.data.status !== undefined ? { status: body.data.status } : {}),
    })
    .where(and(...existingConditions))
    .returning({ id: followupsTable.id });
  const [row] = await db
    .select({
      id: followupsTable.id,
      patientId: patientsTable.patientId,
      patientName: patientsTable.name,
      referralId: followupsTable.referralId,
      facilityId: facilitiesTable.id,
      facilityName: facilitiesTable.name,
      followUpDate: followupsTable.followUpDate,
      notes: followupsTable.notes,
      status: followupsTable.status,
    })
    .from(followupsTable)
    .innerJoin(patientsTable, eq(followupsTable.patientId, patientsTable.patientId))
    .innerJoin(facilitiesTable, eq(followupsTable.facilityId, facilitiesTable.id))
    .where(eq(followupsTable.id, updated.id))
    .limit(1);
  res.json(UpdateFollowupResponse.parse(serializeFollowup(row)));
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  const [referralRows, followupRows, facilityRows] = await Promise.all([
    db
      .select({
        facilityId: referralsTable.facilityId,
        status: referralsTable.status,
      })
      .from(referralsTable)
      .where(referralScope(user)),
    db
      .select({
        followUpDate: followupsTable.followUpDate,
        status: followupsTable.status,
      })
      .from(followupsTable)
      .where(followupScope(user)),
    db
      .select({
        id: facilitiesTable.id,
        name: facilitiesTable.name,
      })
      .from(facilitiesTable)
      .where(
        user.role === "administrator" ? undefined : eq(facilitiesTable.active, true),
      ),
  ]);

  const facilityStats = new Map(
    facilityRows.map((facility) => [
      facility.id,
      {
        facilityId: facility.id,
        facilityName: facility.name,
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
      },
    ]),
  );
  for (const referral of referralRows) {
    const status = referral.status;
    const facility = facilityStats.get(referral.facilityId);
    if (!facility) continue;
    facility.total += 1;
    if (status === "pending") facility.pending += 1;
    if (status === "in_progress") facility.inProgress += 1;
    if (status === "completed") facility.completed += 1;
  }
  const result = {
    total: referralRows.length,
    pending: referralRows.filter((row) => row.status === "pending").length,
    inProgress: referralRows.filter((row) => row.status === "in_progress").length,
    completed: referralRows.filter((row) => row.status === "completed").length,
    overdueFollowups: followupRows.filter(
      (row) =>
        row.status === "scheduled" && row.followUpDate < todayInIndia(),
    ).length,
    facilities: [...facilityStats.values()].sort((a, b) =>
      a.facilityName.localeCompare(b.facilityName),
    ),
  };
  res.json(GetDashboardSummaryResponse.parse(result));
});

router.post("/assistant/replies", async (req, res): Promise<void> => {
  const user = await activeUser(req, res);
  if (!user) return;
  const body = GetAssistantReplyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a question in English or Tamil." });
    return;
  }

  const now = Date.now();
  const bucket = assistantRate.get(user.id);
  if (!bucket || bucket.resetsAt <= now) {
    assistantRate.set(user.id, { count: 1, resetsAt: now + 60_000 });
  } else if (bucket.count >= 10) {
    res.setHeader(
      "Retry-After",
      Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000)),
    );
    res.status(429).json({ error: "Please wait a minute before asking again." });
    return;
  } else {
    bucket.count += 1;
  }

  const question = body.data.question.trim();
  const piiLike =
    /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.test(question) ||
    /\b(?:patient\s*id|uhid|mrn|patient\s*name)\s*[:#-]?\s*[\w-]{3,}/i.test(
      question,
    );
  if (piiLike) {
    res.status(400).json({
      error: "For privacy, do not include patient names, IDs, or phone numbers.",
    });
    return;
  }

  const clinicalQuestion =
    /\b(diagnos\w*|symptom\w*|treat\w*|medicine|medication|prescri\w*|dosage|dose|drug|pain|fever|disease|health advice)\b|சிகிச்சை|மருந்து|நோய்|வலி|காய்ச்சல்/i.test(
      question,
    );
  if (clinicalQuestion) {
    const answer =
      body.data.language === "ta"
        ? "இந்த உதவியாளர் NALAM AI தளத்தைப் பயன்படுத்துவது மற்றும் பரிந்துரை ஒருங்கிணைப்பு நடைமுறைகள் குறித்து மட்டுமே உதவும். நோய் அறிகுறிகள், சிகிச்சை அல்லது மருந்து ஆலோசனை வழங்காது. மருத்துவக் கேள்விகளுக்கு தகுதியான சுகாதார நிபுணரை அணுகவும்."
        : "I can help with the NALAM AI platform and referral workflow, but I can’t provide diagnosis, treatment, or medication advice. For health questions, please speak with a qualified clinician.";
    res.json(
      GetAssistantReplyResponse.parse({
        answer,
        scope: "Platform and referral workflow guidance only; not medical advice.",
      }),
    );
    return;
  }
  if (!openai) {
    res.status(503).json({
      error: "The AI assistant is not configured. Add an OpenAI key in workspace Secrets.",
    });
    return;
  }

  const languageInstruction =
    body.data.language === "ta"
      ? "Reply in clear, simple Tamil. Keep English product labels in parentheses where that helps."
      : "Reply in clear, simple English.";
  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content:
          "You are NALAM AI's platform-use assistant for community health workers and facility staff. " +
          "Answer only questions about using NALAM AI and non-clinical referral coordination workflows. " +
          "Do not give health or medical information, diagnose, triage, recommend treatment, or prescribe medicines. " +
          "Do not make referral decisions. If the user asks for medical information, say it is not enabled because " +
          "the platform does not yet have a verified, curated source library, and direct them to a qualified clinician. " +
          "Never request, repeat, infer, or process patient-identifying information. Do not invent platform features, " +
          "facility details, policies, URLs, or sources; explain uncertainty and point users to their administrator. " +
          "Keep the response brief and actionable. " +
          languageInstruction,
      },
      { role: "user", content: question },
    ],
  });
  const answer = completion.choices[0]?.message.content?.trim();
  if (!answer) {
    res.status(502).json({ error: "The assistant could not prepare a response." });
    return;
  }
  res.json(
    GetAssistantReplyResponse.parse({
      answer,
      scope: "AI-generated NALAM platform guidance only; not medical advice.",
    }),
  );
});

export default router;
