import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";

// K-30: a devnet outage used to KILL this process. Node's default for an
// unhandled rejection is to exit, and the chain transport emits bare socket
// rejections nobody is awaiting — `Error: connect ECONNREFUSED` with a stack
// that reaches no application frame. Verified: an approval that correctly
// answered 503 still left the API dead behind it.
//
// Requests already handle their own chain failures; this is the net under the
// ones that escape the request entirely. It is deliberately LOUD — a rejection
// nobody handled is still a defect, and burying it would trade an outage for a
// mystery — but a platform that settles real money must not fall over because
// one dependency blinked.
export const guardAgainstUnhandledRejections = (): void => {
  const log = new Logger("UnhandledRejection");
  process.on("unhandledRejection", (reason: unknown) => {
    const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    log.error(`a promise rejected with nobody listening — the API is STAYING UP: ${detail}`);
  });
};

const bootstrap = async (): Promise<void> => {
  guardAgainstUnhandledRejections();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // K-33: the dossier accepts documents as base64 in a JSON body, and Nest's
  // default body limit is ~100 kB — so a real title deed could not be attached
  // even once the UI offered a file picker. base64 inflates by a third, so the
  // ceiling is set above the 10 MB the use case enforces; the use case remains
  // the authority on what is too large, and this only stops the transport
  // refusing first with a message about bytes rather than about documents.
  app.useBodyParser("json", { limit: "16mb" });
  app.useBodyParser("urlencoded", { limit: "16mb", extended: true });
  // credentials:true is required for the browser to send the httpOnly session
  // cookie cross-origin (web :3000 → api :3001, same-site "localhost").
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`api listening on http://localhost:${String(port)}`);
};

void bootstrap();
