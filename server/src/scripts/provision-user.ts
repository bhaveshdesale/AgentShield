import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import dotenv from "dotenv";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { createProvisionedUser } from "../services/auth.service";
import { USER_ROLES, type UserRole } from "../types/auth";

dotenv.config();

function readHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("Password entry requires an interactive terminal."));
  }

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  process.stdout.write(prompt);

  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.removeListener("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
    };
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("User provisioning cancelled."));
      } else if (key.name === "return") {
        cleanup();
        resolve(value);
      } else if (key.name === "backspace") {
        value = value.slice(0, -1);
      } else if (character && !key.ctrl) {
        value += character;
      }
    };
    input.on("keypress", onKeypress);
  });
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) {
    throw new Error("Set MONGODB_URI in server/.env before provisioning a user.");
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = await terminal.question("User email: ");
    const roleInput = await terminal.question(`Role (${USER_ROLES.join("/")}) [viewer]: `);
    const role = (roleInput.trim() || "viewer") as UserRole;
    if (!(USER_ROLES as readonly string[]).includes(role)) {
      throw new Error(`Role must be one of: ${USER_ROLES.join(", ")}.`);
    }

    terminal.close();
    const password = await readHidden("Password (12-256 characters): ");
    const confirmation = await readHidden("Confirm password: ");
    if (password !== confirmation) {
      throw new Error("Passwords do not match.");
    }

    await connectDatabase(uri);
    const user = await createProvisionedUser({ email, password, role });
    process.stdout.write(`Provisioned ${user.email} with role ${user.role}.\n`);
  } finally {
    terminal.close();
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown provisioning error";
  process.stderr.write(`User provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
