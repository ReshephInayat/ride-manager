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
      query = query.eq("status", data.status);
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
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
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
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
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
