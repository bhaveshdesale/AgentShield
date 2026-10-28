import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getSession, login, logout } from "../controllers/auth.controller";
import { authenticate, requireCsrf } from "../middleware/authentication";

const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", code: "LOGIN_RATE_LIMITED", message: "Too many sign-in attempts. Try again later." },
});

authRouter.post("/login", loginLimiter, login);
authRouter.get("/session", authenticate, getSession);
authRouter.post("/logout", authenticate, requireCsrf, logout);

export { authRouter };
