import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Server-side paginated ride query — filtering happens in SQL, not client JS
export const getPaginatedRides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
      page: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(200).default(50),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      status: z.string().optional(),
      driverId: z.string().optional(),
      search: z.string().max(200).optional(),
      showArchived: z.boolean().default(false),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let query = supabase
      .from("rides")
      .select("*", { count: "exact" })
      .eq("system", data.system)
      .order("ride_date", { ascending: true })
      .order("pickup_time", { ascending: true });

    // Filter archived
    if (!data.showArchived) {
      query = query.eq("archived", false);
    }

    // Date range
    if (data.dateStart) {
      query = query.gte("ride_date", data.dateStart);
    }
    if (data.dateEnd) {
      query = query.lte("ride_date", data.dateEnd);
    }

    // Status
    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status as any);
    }

    // Driver
    if (data.driverId === "unassigned") {
      query = query.is("driver_id", null);
    } else if (data.driverId && data.driverId !== "all") {
      query = query.eq("driver_id", data.driverId);
    }

    // Text search — use ilike for simple substring matching
    if (data.search) {
      const q = `%${data.search}%`;
      query = query.or(
        `passenger_name.ilike.${q},flight_number.ilike.${q},pickup_location.ilike.${q},dropoff_location.ilike.${q},pickup_from.ilike.${q},dropoff_to.ilike.${q},department.ilike.${q},phone.ilike.${q}`
      );
    }

    // Pagination
    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    query = query.range(from, to);

    const { data: rides, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      rides: rides ?? [],
      totalCount: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// Bulk delete rides — single SQL call, no URL length issues
export const bulkDeleteRides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(10000),
      system: z.enum(["api", "llc"]),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Process in batches of 500 to avoid postgres param limits
    const BATCH = 500;
    let deleted = 0;
    for (let i = 0; i < data.ids.length; i += BATCH) {
      const batch = data.ids.slice(i, i + BATCH);
      const { error, count } = await supabase
        .from("rides")
        .delete({ count: "exact" })
        .eq("system", data.system)
        .in("id", batch);
      if (error) throw new Error(error.message);
      deleted += count ?? 0;
    }
    return { deleted };
  });

// Bulk update ride status — single SQL call
export const bulkUpdateRideStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(10000),
      system: z.enum(["api", "llc"]),
      status: z.enum(["pending", "started", "arrived", "completed", "cancelled", "no_show"]),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const BATCH = 500;
    let updated = 0;
    for (let i = 0; i < data.ids.length; i += BATCH) {
      const batch = data.ids.slice(i, i + BATCH);
      const { error, count } = await supabase
        .from("rides")
        .update({ status: data.status }, { count: "exact" })
        .eq("system", data.system)
        .in("id", batch);
      if (error) throw new Error(error.message);
      updated += count ?? 0;
    }
    return { updated };
  });

// Delete all rides matching current filters (server-side filtered delete)
export const bulkDeleteFiltered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      status: z.string().optional(),
      driverId: z.string().optional(),
      search: z.string().max(200).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let query = supabase
      .from("rides")
      .delete({ count: "exact" })
      .eq("system", data.system)
      .eq("archived", false);

    if (data.dateStart) query = query.gte("ride_date", data.dateStart);
    if (data.dateEnd) query = query.lte("ride_date", data.dateEnd);
    if (data.status && data.status !== "all") query = query.eq("status", data.status as any);
    if (data.driverId === "unassigned") {
      query = query.is("driver_id", null);
    } else if (data.driverId && data.driverId !== "all") {
      query = query.eq("driver_id", data.driverId);
    }
    if (data.search) {
      const q = `%${data.search}%`;
      query = query.or(
        `passenger_name.ilike.${q},flight_number.ilike.${q},pickup_location.ilike.${q},dropoff_location.ilike.${q},pickup_from.ilike.${q},dropoff_to.ilike.${q},department.ilike.${q},phone.ilike.${q}`
      );
    }

    const { error, count } = await query;
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

// Complete all rides matching current filters
export const bulkCompleteFiltered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      status: z.string().optional(),
      driverId: z.string().optional(),
      search: z.string().max(200).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let query = supabase
      .from("rides")
      .update({ status: "completed" }, { count: "exact" })
      .eq("system", data.system)
      .eq("archived", false)
      .neq("status", "completed");

    if (data.dateStart) query = query.gte("ride_date", data.dateStart);
    if (data.dateEnd) query = query.lte("ride_date", data.dateEnd);
    if (data.status && data.status !== "all") query = query.eq("status", data.status as any);
    if (data.driverId === "unassigned") {
      query = query.is("driver_id", null);
    } else if (data.driverId && data.driverId !== "all") {
      query = query.eq("driver_id", data.driverId);
    }
    if (data.search) {
      const q = `%${data.search}%`;
      query = query.or(
        `passenger_name.ilike.${q},flight_number.ilike.${q},pickup_location.ilike.${q},dropoff_location.ilike.${q},pickup_from.ilike.${q},dropoff_to.ilike.${q},department.ilike.${q},phone.ilike.${q}`
      );
    }

    const { error, count } = await query;
    if (error) throw new Error(error.message);
    return { updated: count ?? 0 };
  });

// ─── Payouts: server-side driver stats ───
export const getPayoutsData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [driversRes, payoutsRes] = await Promise.all([
      supabase.from("drivers").select("id, name").eq("system", data.system).eq("active", true).order("name"),
      supabase.from("driver_payouts").select("*").eq("system", data.system).order("created_at", { ascending: false }),
    ]);
    if (driversRes.error) throw new Error(driversRes.error.message);
    if (payoutsRes.error) throw new Error(payoutsRes.error.message);

    // Get aggregated ride stats per driver using a count query
    const { data: rideStats, error: statsErr } = await supabase
      .from("rides")
      .select("driver_id, amount, status")
      .eq("system", data.system)
      .not("driver_id", "is", null);
    if (statsErr) throw new Error(statsErr.message);

    // Aggregate in server
    const driverStats: Record<string, { rideCount: number; totalAmount: number; completedCount: number }> = {};
    for (const r of rideStats ?? []) {
      if (!r.driver_id) continue;
      if (!driverStats[r.driver_id]) driverStats[r.driver_id] = { rideCount: 0, totalAmount: 0, completedCount: 0 };
      driverStats[r.driver_id].rideCount++;
      driverStats[r.driver_id].totalAmount += Number(r.amount || 0);
      if (r.status === "completed") driverStats[r.driver_id].completedCount++;
    }

    return {
      drivers: driversRes.data ?? [],
      payouts: payoutsRes.data ?? [],
      driverStats,
    };
  });

// ─── Flights: server-side paginated ───
export const getFlightsData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
      dateFilter: z.enum(["today", "tomorrow", "this_week", "all"]).default("today"),
      search: z.string().max(200).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let query = supabase
      .from("rides")
      .select("*")
      .eq("system", data.system)
      .not("flight_number", "is", null);

    const now = new Date();
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (data.dateFilter === "today") {
      query = query.eq("ride_date", ymd(now));
    } else if (data.dateFilter === "tomorrow") {
      const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
      query = query.eq("ride_date", ymd(tmr));
    } else if (data.dateFilter === "this_week") {
      const ws = new Date(now); ws.setDate(ws.getDate() - ws.getDay());
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      query = query.gte("ride_date", ymd(ws)).lte("ride_date", ymd(we));
    }

    if (data.search) {
      const q = `%${data.search}%`;
      query = query.or(`flight_number.ilike.${q},pickup_location.ilike.${q},passenger_name.ilike.${q}`);
    }

    query = query.order("ride_date").order("pickup_time");

    const [ridesRes, driversRes] = await Promise.all([
      query,
      supabase.from("drivers").select("id, name").eq("system", data.system),
    ]);

    if (ridesRes.error) throw new Error(ridesRes.error.message);
    return { rides: ridesRes.data ?? [], drivers: driversRes.data ?? [] };
  });

// ─── Calendar: load rides for a specific date range ───
export const getCalendarRides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
      dateStart: z.string(),
      dateEnd: z.string(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [ridesRes, driversRes] = await Promise.all([
      supabase
        .from("rides")
        .select("id, ride_date, pickup_time, pickup_location, dropoff_location, pickup_from, dropoff_to, driver_id, status, passenger_name")
        .eq("system", data.system)
        .gte("ride_date", data.dateStart)
        .lte("ride_date", data.dateEnd)
        .order("ride_date")
        .order("pickup_time"),
      supabase.from("drivers").select("id, name").eq("system", data.system),
    ]);
    if (ridesRes.error) throw new Error(ridesRes.error.message);
    return { rides: ridesRes.data ?? [], drivers: driversRes.data ?? [] };
  });

// ─── Logs: server-side paginated ───
export const getPaginatedLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
      page: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(200).default(100),
      kind: z.string().max(50).optional(),
      actor: z.string().max(50).optional(),
      search: z.string().max(200).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = supabase
      .from("activity_logs")
      .select("*", { count: "exact" })
      .eq("system", data.system)
      .order("created_at", { ascending: false });

    if (data.kind && data.kind !== "all") query = query.eq("kind", data.kind);
    if (data.actor && data.actor !== "all") query = query.eq("actor", data.actor);
    if (data.search) {
      const q = `%${data.search}%`;
      query = query.or(`title.ilike.${q},details.ilike.${q},actor_name.ilike.${q}`);
    }

    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    query = query.range(from, to);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], totalCount: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

// ─── CSV Export: generate CSV string server-side ───
export const exportRidesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      system: z.enum(["api", "llc"]),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      status: z.string().optional(),
      driverId: z.string().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = supabase
      .from("rides")
      .select("ride_date, pickup_time, pickup_location, pickup_from, dropoff_location, dropoff_to, passenger_name, passenger_email, phone, flight_number, department, riders, amount, status, notes")
      .eq("system", data.system)
      .eq("archived", false)
      .order("ride_date")
      .order("pickup_time");

    if (data.dateStart) query = query.gte("ride_date", data.dateStart);
    if (data.dateEnd) query = query.lte("ride_date", data.dateEnd);
    if (data.status && data.status !== "all") query = query.eq("status", data.status as any);
    if (data.driverId === "unassigned") {
      query = query.is("driver_id", null);
    } else if (data.driverId && data.driverId !== "all") {
      query = query.eq("driver_id", data.driverId);
    }

    const { data: rides, error } = await query;
    if (error) throw new Error(error.message);

    const headers = ["Date", "Time", "Pickup", "Pickup From", "Dropoff", "Dropoff To", "Passenger", "Email", "Phone", "Flight", "Dept", "Riders", "Amount", "Status", "Notes"];
    const csvRows = [headers.join(",")];
    for (const r of rides ?? []) {
      const row = [
        r.ride_date, r.pickup_time ?? "", r.pickup_location ?? "", r.pickup_from ?? "",
        r.dropoff_location ?? "", r.dropoff_to ?? "", r.passenger_name ?? "", r.passenger_email ?? "",
        r.phone ?? "", r.flight_number ?? "", r.department ?? "", r.riders ?? 1,
        r.amount ?? 0, r.status ?? "", (r.notes ?? "").replace(/,/g, ";").replace(/\n/g, " "),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      csvRows.push(row.join(","));
    }
    return { csv: csvRows.join("\n"), count: (rides ?? []).length };
  });
