import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { SpectatorApp } from "./SpectatorApp";
import { consumeSpectatorInvitationFragment } from "./spectator-invitation";
import { consumeSecretGrantFragment } from "./invitation";
import "./styles.css";

const rootElement = document.querySelector<HTMLDivElement>("#root");

if (rootElement === null) {
  throw new Error("Gettysburg application root is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    {window.location.pathname.startsWith("/observe/") ? (
      <SpectatorApp
        initialGrant={consumeSpectatorInvitationFragment(
          window.location,
          window.history,
        )}
      />
    ) : (
      <App
        initialGrant={consumeSecretGrantFragment(
          window.location,
          window.history,
        )}
      />
    )}
  </StrictMode>,
);
