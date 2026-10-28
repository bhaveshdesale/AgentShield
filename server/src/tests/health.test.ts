import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../app";
import { logger } from "../utils/logger";

let server: Server;
let baseUrl = "";

describe("health readiness endpoint", () => {
  before(async () => {
    server = createApp().listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("reports the service as unavailable while MongoDB is disconnected", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json() as {
      status: string;
      mongodb: string;
    };

    assert.equal(response.status, 503);
    assert.equal(body.status, "degraded");
    assert.equal(body.mongodb, "disconnected");
  });

  it("correlates request and error logs using a server-generated response ID", async () => {
    const originalInfo = logger.info;
    const originalWarn = logger.warn;
    const captured: Array<{
      level: string;
      message: string;
      context: Record<string, string | number | boolean> | undefined;
    }> = [];
    logger.info = (message, context) => {
      captured.push({ level: "info", message, context });
    };
    logger.warn = (message, context) => {
      captured.push({ level: "warn", message, context });
    };

    try {
      const response = await fetch(`${baseUrl}/missing?token=must-not-be-logged`, {
        headers: {
          Origin: "http://localhost:5173",
          "X-Request-ID": "client-supplied-id",
        },
      });
      const requestId = response.headers.get("X-Request-ID");

      assert.equal(response.status, 404);
      assert.equal(response.headers.get("Access-Control-Expose-Headers"), "X-Request-ID");
      assert.ok(requestId);
      assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.notEqual(requestId, "client-supplied-id");

      const requestLog = captured.find((entry) => entry.message === "HTTP request");
      const errorLog = captured.find((entry) => entry.message === "Request failed");
      assert.equal(requestLog?.context?.requestId, requestId);
      assert.equal(errorLog?.context?.requestId, requestId);
      assert.equal(requestLog?.context?.path, "/missing");
      assert.equal(errorLog?.context?.path, "/missing");
      assert.equal(
        captured.some((entry) => JSON.stringify(entry).includes("must-not-be-logged")),
        false,
      );
    } finally {
      logger.info = originalInfo;
      logger.warn = originalWarn;
    }
  });
});
