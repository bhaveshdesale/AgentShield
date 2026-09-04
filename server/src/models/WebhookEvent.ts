import mongoose, { Schema } from "mongoose";

export interface WebhookEvent {
  eventId: string;
  eventName: string;
  createdAt: Date;
}

const webhookEventSchema = new Schema<WebhookEvent>(
  {
    eventId: { type: String, required: true, trim: true, unique: true },
    eventName: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const WebhookEventModel = mongoose.model<WebhookEvent>("WebhookEvent", webhookEventSchema);
