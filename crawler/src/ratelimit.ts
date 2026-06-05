import PQueue from "p-queue";
import { config } from "./config.js";
import type { Platform } from "./crawler/adapters/types.js";

const queues = new Map<Platform, PQueue>();

export function platformQueue(platform: Platform): PQueue {
  let q = queues.get(platform);
  if (!q) {
    q = new PQueue({
      concurrency: config.platformConcurrency,
      interval: 1000,
      intervalCap: 4,
    });
    queues.set(platform, q);
  }
  return q;
}
