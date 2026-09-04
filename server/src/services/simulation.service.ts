import { MerchantModel } from "../models/Merchant";
import { OrderModel } from "../models/Order";
import { ProductModel } from "../models/Product";
import { evaluateAction } from "./policy.service";
import { parseAgentOutput } from "./agent.service";
import { AppError } from "../utils/AppError";

export const SIMULATION_SCENARIOS = [
  { id: 1, name: "Valid Transaction" },
  { id: 2, name: "Spending Limit Violation" },
  { id: 3, name: "Price Mismatch" },
  { id: 4, name: "Excessive Discount" },
  { id: 5, name: "Duplicate Payment" },
  { id: 6, name: "Missing Inventory" },
  { id: 7, name: "Unauthorized Action" },
  { id: 8, name: "Malformed AI Output" },
  { id: 9, name: "Payment Timeout" },
  { id: 10, name: "Recovery" },
] as const;

export async function runSimulation(scenarioId: number) {
  const merchant = await MerchantModel.findOne().sort({ createdAt: 1 });
  if (!merchant) throw new AppError("Demo merchant not found. Run npm run seed.", 503, "MERCHANT_NOT_FOUND");
  const coffee = await ProductModel.findOne({ name: "Artisan Coffee Kit" });
  const laptop = await ProductModel.findOne({ name: "14-inch Business Laptop" });
  const bottle = await ProductModel.findOne({ name: "Insulated Water Bottle" });
  if (!coffee || !laptop || !bottle) throw new AppError("Required simulation products are missing. Run npm run seed.", 503, "SIMULATION_DATA_MISSING");

  if (!SIMULATION_SCENARIOS.some((s) => s.id === scenarioId)) throw new AppError("scenarioId must be between 1 and 10.", 400, "INVALID_SCENARIO");

  const base = { action: "CREATE_PAYMENT" as const, items: [{ productId: coffee._id, quantity: 1 }], reason: "Safety simulation", requiresApproval: true };
  let result: unknown;
  let expected = "";
  switch (scenarioId) {
    case 1:
      result = await evaluateAction({ ...base, proposedAmountInPaise: coffee.priceInPaise, referenceId: `simulation-valid-${Date.now()}` }, merchant.policy);
      expected = "ALLOW";
      break;
    case 2:
      result = await evaluateAction({ ...base, items: [{ productId: laptop._id, quantity: 1 }], proposedAmountInPaise: laptop.priceInPaise, referenceId: `simulation-limit-${Date.now()}` }, merchant.policy);
      expected = "BLOCK";
      break;
    case 3:
      result = await evaluateAction({ ...base, proposedAmountInPaise: 4499900, referenceId: `simulation-mismatch-${Date.now()}` }, merchant.policy);
      expected = "BLOCK";
      break;
    case 4:
      result = await evaluateAction({ ...base, proposedAmountInPaise: coffee.priceInPaise, discountPercent: 50, referenceId: `simulation-discount-${Date.now()}` }, merchant.policy);
      expected = "BLOCK";
      break;
    case 5: {
      const referenceId = `simulation-duplicate-${Date.now()}`;
      await OrderModel.create({ items: [{ productId: coffee._id, quantity: 1, unitPriceInPaise: coffee.priceInPaise }], amountInPaise: coffee.priceInPaise, currency: "INR", status: "AWAITING_PAYMENT", referenceId });
      result = await evaluateAction({ ...base, proposedAmountInPaise: coffee.priceInPaise, referenceId }, merchant.policy);
      await OrderModel.deleteOne({ referenceId });
      expected = "BLOCK";
      break;
    }
    case 6:
      result = await evaluateAction({ ...base, items: [{ productId: bottle._id, quantity: 1 }], proposedAmountInPaise: bottle.priceInPaise, referenceId: `simulation-inventory-${Date.now()}` }, merchant.policy);
      expected = "BLOCK";
      break;
    case 7:
      result = await evaluateAction({ ...base, action: "CREATE_PAYOUT", proposedAmountInPaise: coffee.priceInPaise, referenceId: `simulation-permission-${Date.now()}` }, merchant.policy);
      expected = "BLOCK";
      break;
    case 8: {
      let errorCode = "";
      try { parseAgentOutput("not-json", [{ productId: String(coffee._id), name: coffee.name, category: coffee.category, tags: coffee.tags, priceInPaise: coffee.priceInPaise, inventory: coffee.inventory }]); } catch (error) { errorCode = error instanceof AppError ? error.code : "UNKNOWN"; }
      result = { rejected: errorCode === "AI_MALFORMED_OUTPUT", errorCode };
      expected = "REJECTED";
      break;
    }
    case 9:
      result = { state: "UNKNOWN", action: "NO_RETRY_UNTIL_STATUS_VERIFIED", reason: "Simulated Razorpay timeout." };
      expected = "UNKNOWN";
      break;
    case 10:
      result = { state: "RECOVERED", action: "REUSE_EXISTING_PAYMENT_OR_SAFE_RETRY", reason: "Simulated recovery after status verification." };
      expected = "RECOVERED";
      break;
  }
  return { scenario: SIMULATION_SCENARIOS[scenarioId - 1], expected, result };
}
