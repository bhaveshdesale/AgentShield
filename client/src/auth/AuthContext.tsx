import { createContext, useContext } from "react";
import type { AuthUser } from "../services/api";

export interface AuthContextValue {
  user: AuthUser;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("Authentication context is unavailable.");
  }
  return context;
}
