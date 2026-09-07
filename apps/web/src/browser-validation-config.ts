import { config } from "zod";

// Run before game modules initialize schemas. The browser CSP forbids eval;
// opting out avoids a blocked JIT capability probe without weakening validation.
config({ jitless: true });
