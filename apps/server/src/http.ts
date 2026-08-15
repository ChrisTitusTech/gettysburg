import express, { type Application } from "express";

export interface ReadinessState {
  isReady(): boolean;
}

export function configureHttpApplication(
  application: Application,
  readiness: ReadinessState,
): Application {
  application.disable("x-powered-by");

  application.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  application.get("/readyz", (_request, response) => {
    if (!readiness.isReady()) {
      response.status(503).json({ status: "unavailable" });
      return;
    }

    response.status(200).json({
      durability: "process-lifetime",
      mode: "in-memory",
      status: "ready",
    });
  });

  return application;
}

export function createHttpApplication(readiness: ReadinessState): Application {
  return configureHttpApplication(express(), readiness);
}
