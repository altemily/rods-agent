import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type MovementIntent =
  | "REGISTER_EXPENSE"
  | "REGISTER_INCOME"
  | "REGISTER_BOX_CONTRIBUTION";

type MovementKind = "expense" | "income" | "box_contribution";

type NecessityLevel =
  | "ESSENTIAL"
  | "NECESSARY"
  | "OPTIONAL"
  | "IMPULSIVE"
  | null;

type CreateMovementInput = {
  telegramUserId: string | number;
  intent: MovementIntent;
  amount: number;
  description: string | null;
  category: string | null;
  necessityLevel: NecessityLevel;
  boxName: string | null;
  source: "telegram_agent";
  occurredOn?: string;
};

type SupabaseWriteResult = {
  success: boolean;
  movementId?: string;
  error?: string;
};

type AppUser = {
  id: string;
  user_key?: string | null;
  telegram_user_id?: string | number | null;
};

type LookupRecord = {
  id: string;
  name?: string | null;
};

type PaymentMethodRecord = LookupRecord & {
  kind?: string | null;
  payment_kind?: string | null;
  type?: string | null;
};

type BoxRecord = LookupRecord & {
  current_amount_cents?: number | null;
};

type BoxMovementInsert = {
  owner_user_id: string;
  box_id: string;
  movement_id: string;
  amount_cents: number;
  kind: "contribution";
  occurred_on: string;
};

const intentToKind: Record<MovementIntent, MovementKind> = {
  REGISTER_EXPENSE: "expense",
  REGISTER_INCOME: "income",
  REGISTER_BOX_CONTRIBUTION: "box_contribution",
};

function formatSupabaseError(error: { message?: string } | null): string {
  return error?.message ?? "Unknown Supabase error";
}

function toAmountCents(amount: number): number {
  return Math.round(amount * 100);
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toCompetenceMonth(occurredOn: string): string {
  return `${occurredOn.slice(0, 7)}-01`;
}

function getPaymentKind(paymentMethod: PaymentMethodRecord): string | null {
  const explicitKind =
    paymentMethod.payment_kind?.trim() ??
    paymentMethod.kind?.trim() ??
    paymentMethod.type?.trim();

  if (explicitKind) {
    return explicitKind;
  }

  if (paymentMethod.name?.trim().toLowerCase() === "pix") {
    return "pix";
  }

  return null;
}

function parseTelegramUserKeyMap(rawValue: string | undefined): Map<string, string> {
  const map = new Map<string, string>();

  if (!rawValue?.trim()) {
    return map;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      for (const [telegramUserId, userKey] of Object.entries(parsed)) {
        if (typeof userKey === "string" && userKey.trim()) {
          map.set(telegramUserId, userKey.trim());
        }
      }
    }
  } catch {
    for (const entry of rawValue.split(",")) {
      const [telegramUserId, userKey] = entry.split(":");

      if (telegramUserId?.trim() && userKey?.trim()) {
        map.set(telegramUserId.trim(), userKey.trim());
      }
    }
  }

  return map;
}

export class SupabaseMovementService {
  private readonly client: SupabaseClient | null;

  constructor(
    private readonly supabaseUrl = process.env.SUPABASE_URL,
    private readonly serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    private readonly telegramUserKeyMap = process.env.SUPABASE_TELEGRAM_USER_KEY_MAP,
  ) {
    this.client =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          })
        : null;
  }

  async createMovement(input: CreateMovementInput): Promise<SupabaseWriteResult> {
    if (!this.supabaseUrl) {
      return { success: false, error: "SUPABASE_URL is not configured" };
    }

    if (!this.serviceRoleKey) {
      return {
        success: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured",
      };
    }

    if (!this.client) {
      return { success: false, error: "Supabase client is not configured" };
    }

    const occurredOn = input.occurredOn ?? toDateOnly(new Date());
    const kind = intentToKind[input.intent];
    const amountCents = toAmountCents(input.amount);
    const ownerUser = await this.resolveOwnerUser(input.telegramUserId);

    if (!ownerUser.success) {
      return { success: false, error: ownerUser.error };
    }

    const category = await this.resolveCategory({
      ownerUserId: ownerUser.user.id,
      kind,
      categoryName: input.category,
    });

    if (!category.success) {
      return { success: false, error: category.error };
    }

    const paymentMethod = await this.resolvePaymentMethod(ownerUser.user.id);

    if (!paymentMethod.success) {
      return { success: false, error: paymentMethod.error };
    }

    const paymentKind = getPaymentKind(paymentMethod.paymentMethod);

    if (!paymentKind) {
      return {
        success: false,
        error:
          "Payment method does not define payment_kind/kind/type, and only a Pix method can use the safe pix fallback.",
      };
    }

    const box =
      kind === "box_contribution"
        ? await this.resolveBox(ownerUser.user.id, input.boxName)
        : { success: true as const, box: null };

    if (!box.success) {
      return { success: false, error: box.error };
    }

    const { data: movement, error: movementError } = await this.client
      .from("movements")
      .insert({
        kind,
        status: "confirmed",
        amount_cents: amountCents,
        description: input.description?.trim() || "Movimentação financeira",
        occurred_on: occurredOn,
        competence_month: toCompetenceMonth(occurredOn),
        owner_user_id: ownerUser.user.id,
        category_id: category.category.id,
        payment_method_id: paymentMethod.paymentMethod.id,
        payment_kind: paymentKind,
        box_id: box.box?.id ?? null,
        source: input.source,
      })
      .select("id")
      .single<{ id: string }>();

    if (movementError || !movement) {
      return {
        success: false,
        error: `Failed to insert movement in Supabase: ${formatSupabaseError(movementError)}`,
      };
    }

    if (kind === "box_contribution" && box.box) {
      const boxMovementResult = await this.createBoxMovement({
        ownerUserId: ownerUser.user.id,
        box: box.box,
        movementId: movement.id,
        amountCents,
        occurredOn,
      });

      if (!boxMovementResult.success) {
        await this.rollbackMovement(movement.id);
        return boxMovementResult;
      }

      const boxBalanceResult = await this.incrementBoxBalance({
        box: box.box,
        amountCents,
        movementId: movement.id,
      });

      if (!boxBalanceResult.success) {
        await this.rollbackBoxContribution({
          movementId: movement.id,
          box: box.box,
          amountCents,
          balanceWasUpdated: false,
        });
        return boxBalanceResult;
      }
    }

    return { success: true, movementId: movement.id };
  }

  private async resolveOwnerUser(
    telegramUserId: string | number,
  ): Promise<{ success: true; user: AppUser } | { success: false; error: string }> {
    const telegramUserIdText = String(telegramUserId);

    const byTelegramUserId = await this.client
      ?.from("app_users")
      .select("id,user_key,telegram_user_id")
      .eq("telegram_user_id", telegramUserIdText)
      .maybeSingle<AppUser>();

    if (byTelegramUserId?.data) {
      return { success: true, user: byTelegramUserId.data };
    }

    const mappedUserKey = parseTelegramUserKeyMap(this.telegramUserKeyMap).get(
      telegramUserIdText,
    );

    if (mappedUserKey) {
      const byUserKey = await this.client
        ?.from("app_users")
        .select("id,user_key")
        .eq("user_key", mappedUserKey)
        .maybeSingle<AppUser>();

      if (byUserKey?.data) {
        return { success: true, user: byUserKey.data };
      }

      return {
        success: false,
        error: `No app_users row found for mapped user_key "${mappedUserKey}"`,
      };
    }

    return {
      success: false,
      error:
        "No app_users row found for this Telegram user. Configure app_users.telegram_user_id or SUPABASE_TELEGRAM_USER_KEY_MAP.",
    };
  }

  private async resolveCategory(input: {
    ownerUserId: string;
    kind: MovementKind;
    categoryName: string | null;
  }): Promise<
    { success: true; category: LookupRecord } | { success: false; error: string }
  > {
    const normalizedCategory = input.categoryName?.trim();

    if (normalizedCategory) {
      const byName = await this.client
        ?.from("categories")
        .select("id,name")
        .eq("owner_user_id", input.ownerUserId)
        .eq("kind", input.kind)
        .ilike("name", normalizedCategory)
        .maybeSingle<LookupRecord>();

      if (byName?.data) {
        return { success: true, category: byName.data };
      }
    }

    const fallback = await this.client
      ?.from("categories")
      .select("id,name")
      .eq("owner_user_id", input.ownerUserId)
      .eq("kind", input.kind)
      .ilike("name", "Não categorizada")
      .maybeSingle<LookupRecord>();

    if (fallback?.data) {
      return { success: true, category: fallback.data };
    }

    return {
      success: false,
      error: `No category found for kind "${input.kind}". Create "${normalizedCategory ?? "Não categorizada"}" or fallback "Não categorizada" in Supabase.`,
    };
  }

  private async resolvePaymentMethod(
    ownerUserId: string,
  ): Promise<
    | { success: true; paymentMethod: PaymentMethodRecord }
    | { success: false; error: string }
  > {
    const byDefault = await this.client
      ?.from("payment_methods")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("is_default", true)
      .maybeSingle<PaymentMethodRecord>();

    if (byDefault?.data) {
      return { success: true, paymentMethod: byDefault.data };
    }

    const byPix = await this.client
      ?.from("payment_methods")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .ilike("name", "Pix")
      .maybeSingle<PaymentMethodRecord>();

    if (byPix?.data) {
      return { success: true, paymentMethod: byPix.data };
    }

    return {
      success: false,
      error:
        'No payment method found. Configure a default payment method or a payment method named "Pix" in Supabase.',
    };
  }

  private async resolveBox(
    ownerUserId: string,
    boxName: string | null,
  ): Promise<{ success: true; box: BoxRecord } | { success: false; error: string }> {
    const normalizedBoxName = boxName?.trim();

    if (!normalizedBoxName) {
      return {
        success: false,
        error: "Box contribution requires a box name to resolve boxes.id",
      };
    }

    const byName = await this.client
      ?.from("boxes")
      .select("id,name,current_amount_cents")
      .eq("owner_user_id", ownerUserId)
      .ilike("name", normalizedBoxName)
      .maybeSingle<BoxRecord>();

    if (byName?.data) {
      return { success: true, box: byName.data };
    }

    return {
      success: false,
      error: `No box found with name "${normalizedBoxName}" for this user.`,
    };
  }

  private async createBoxMovement(input: {
    ownerUserId: string;
    box: BoxRecord;
    movementId: string;
    amountCents: number;
    occurredOn: string;
  }): Promise<SupabaseWriteResult> {
    const boxMovement: BoxMovementInsert = {
      owner_user_id: input.ownerUserId,
      box_id: input.box.id,
      movement_id: input.movementId,
      amount_cents: input.amountCents,
      kind: "contribution",
      occurred_on: input.occurredOn,
    };

    const { error } = await this.client!
      .from("box_movements")
      .insert(boxMovement)
      .select("id")
      .single<{ id: string }>();

    if (error) {
      return {
        success: false,
        movementId: input.movementId,
        error: `Movement was inserted, but box_movements insert failed: ${formatSupabaseError(error)}`,
      };
    }

    return { success: true, movementId: input.movementId };
  }

  private async incrementBoxBalance(input: {
    box: BoxRecord;
    amountCents: number;
    movementId: string;
  }): Promise<SupabaseWriteResult> {
    const currentAmountCents = input.box.current_amount_cents ?? 0;
    const nextAmountCents = currentAmountCents + input.amountCents;

    const { data, error } = await this.client!
      .from("boxes")
      .update({ current_amount_cents: nextAmountCents })
      .eq("id", input.box.id)
      .eq("current_amount_cents", currentAmountCents)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      return {
        success: false,
        movementId: input.movementId,
        error: `Movement and box movement were inserted, but boxes.current_amount_cents update failed: ${formatSupabaseError(error)}`,
      };
    }

    return { success: true, movementId: input.movementId };
  }

  private async rollbackMovement(movementId: string): Promise<void> {
    const { error } = await this.client!
      .from("movements")
      .delete()
      .eq("id", movementId);

    if (error) {
      console.error("[RODS][Supabase] Failed to rollback movement", {
        movementId,
        error: formatSupabaseError(error),
      });
    }
  }

  private async rollbackBoxContribution(input: {
    movementId: string;
    box?: BoxRecord;
    amountCents?: number;
    balanceWasUpdated?: boolean;
  }): Promise<void> {
    if (input.balanceWasUpdated && input.box && input.amountCents) {
      await this.rollbackBoxBalance(input.box, input.amountCents);
    }

    const { error: boxMovementError } = await this.client!
      .from("box_movements")
      .delete()
      .eq("movement_id", input.movementId);

    if (boxMovementError) {
      console.error("[RODS][Supabase] Failed to rollback box movement", {
        movementId: input.movementId,
        error: formatSupabaseError(boxMovementError),
      });
    }

    await this.rollbackMovement(input.movementId);
  }

  private async rollbackBoxBalance(
    box: BoxRecord,
    amountCents: number,
  ): Promise<void> {
    const previousAmountCents = box.current_amount_cents;

    if (typeof previousAmountCents !== "number") {
      console.error("[RODS][Supabase] Failed to rollback box balance", {
        boxId: box.id,
        error: "Previous box balance is not available",
      });

      return;
    }

    const { error } = await this.client!
      .from("boxes")
      .update({ current_amount_cents: previousAmountCents })
      .eq("id", box.id)
      .eq("current_amount_cents", previousAmountCents + amountCents);

    if (error) {
      console.error("[RODS][Supabase] Failed to rollback box balance", {
        boxId: box.id,
        error: formatSupabaseError(error),
      });
    }
  }
}

export const supabaseMovementService = new SupabaseMovementService();
