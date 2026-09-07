import { createPushVapidFile } from "./push-config.js";

const [file, subject, ...extra] = process.argv.slice(2);
if (!file || !subject || extra.length > 0) {
  console.error(
    "Usage: node apps/server/dist/push-vapid-cli.js FILE mailto:CONTACT",
  );
  process.exitCode = 1;
} else {
  try {
    await createPushVapidFile(file, subject);
    console.log(
      "Push VAPID configuration created; retain it in encrypted backups.",
    );
  } catch {
    console.error(
      "Push configuration creation failed; check the contact, directory, and existing file.",
    );
    process.exitCode = 1;
  }
}
