import { Types } from "mongoose";
import { AgentActionModel } from "../models/AgentAction";
import { OrderModel } from "../models/Order";
import { AppError } from "../utils/AppError";
import { recordIdempotentAudit } from "./audit.service";

const RECOVERY_LEASE_MS = 120_000;

export async function claimPaymentRecovery(orderId: string) {
  if (!Types.ObjectId.isValid(orderId)) {
    throw new AppError(
      "Invalid order ID.",
      400,
      "INVALID_ORDER_ID",
    );
  }

  const order = await OrderModel.findById(orderId);

  if (!order) {
    throw new AppError(
      "Order was not found.",
      404,
      "ORDER_NOT_FOUND",
    );
  }

  if (
    order.status !== "UNKNOWN" &&
    !(
      order.status === "RECOVERING" &&
      order.updatedAt.getTime() <= Date.now() - RECOVERY_LEASE_MS
    )
  ) {
    throw new AppError(
      "Only orders in UNKNOWN state or stale RECOVERING claims can be reconciled.",
      409,
      "ORDER_NOT_UNKNOWN",
    );
  }

  const action = await AgentActionModel.findOne({
    referenceId: order.referenceId,
  });
  const actionId = action ? String(action._id) : null;

  const staleRecoveryCutoff = new Date(Date.now() - RECOVERY_LEASE_MS);
  const claimed = await OrderModel.findOneAndUpdate(
    {
      _id: order._id,
      $or: [
        { status: "UNKNOWN" },
        { status: "RECOVERING", updatedAt: { $lte: staleRecoveryCutoff } },
      ],
    },
    {
      $set: {
        status: "RECOVERING",
      },
    },
    {
      new: true,
    },
  );

  if (!claimed) {
    throw new AppError(
      "Order is already being reconciled by another process.",
      409,
      "ORDER_ALREADY_RECOVERING",
    );
  }

  await recordIdempotentAudit(
    "RECOVERY_STARTED",
    { orderId: String(order._id) },
    `recovery:${String(order._id)}:${claimed.updatedAt.getTime()}`,
    actionId ?? undefined,
  );

  return { order, action, actionId };
}
