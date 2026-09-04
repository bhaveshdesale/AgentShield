function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, context?: Record<string, string | number | boolean>): void {
    if (context) {
      console.log(`[${timestamp()}] INFO  ${message}`, context);
      return;
    }
    console.log(`[${timestamp()}] INFO  ${message}`);
  },

  warn(message: string, context?: Record<string, string | number | boolean>): void {
    if (context) {
      console.warn(`[${timestamp()}] WARN  ${message}`, context);
      return;
    }
    console.warn(`[${timestamp()}] WARN  ${message}`);
  },

  error(message: string, context?: Record<string, string | number | boolean | undefined>): void {
    if (context) {
      console.error(`[${timestamp()}] ERROR ${message}`, context);
      return;
    }
    console.error(`[${timestamp()}] ERROR ${message}`);
  },
};
