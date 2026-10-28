import mongoose, { Schema } from "mongoose";

export interface WebhookEvent {
  eventId: string;
  eventName: string;
  status: "PENDING" | "PROCESSING" | "PROCESSED" | "RETRYABLE_FAILURE";
  transition?: "PAID" | "FAILED" | "IGNORED";
  paymentLinkId?: string;
  referenceId?: string;
  payloadHash?: string;
  claimId?: string;
  leaseExpiresAt?: Date;
  attempts: number;
  lastErrorCode?: string;
  outcome?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<WebhookEvent>(
  {
    eventId: { type: String, required: true, trim: true, unique: true },
    eventName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "PROCESSED", "RETRYABLE_FAILURE"],
      // Legacy rows lack status and cannot be replayed because their payload was not retained.
      default: "PROCESSED",
    },
    transition: { type: String, enum: ["PAID", "FAILED", "IGNORED"] },
    paymentLinkId: { type: String, trim: true },
    referenceId: { type: String, trim: true },
    payloadHash: { type: String, trim: true },
    claimId: { type: String, trim: true },
    leaseExpiresAt: { type: Date },
    attempts: { type: Number, required: true, default: 0 },
    lastErrorCode: { type: String, trim: true },
    outcome: { type: String, trim: true },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

webhookEventSchema.index({ status: 1, leaseExpiresAt: 1 });

export const WebhookEventModel = mongoose.model<WebhookEvent>("WebhookEvent", webhookEventSchema);
