// HTTP matchmaking can report the server's bounded, retryable admission 503.
// Classify only a matching observed response, never a generic console error.
export function observeAdmissionDiagnostics(
  page,
  { now = Date.now, report = console.log } = {},
) {
  let responses = [];
  const matchesEndpoint = (value) => {
    try {
      const url = new URL(value);
      return (
        url.origin === new URL(page.url()).origin &&
        url.pathname === "/matchmake/joinOrCreate/game" &&
        url.search === ""
      );
    } catch {
      return false;
    }
  };
  const prune = () => {
    responses = responses.filter((time) => now() - time <= 5_000);
  };
  page.on("response", (response) => {
    prune();
    if (
      response.status() === 503 &&
      response.request().method() === "POST" &&
      matchesEndpoint(response.url())
    )
      responses.push(now());
  });
  return (message) => {
    prune();
    if (
      responses.length === 0 ||
      message.type() !== "error" ||
      !/^Failed to load resource: the server responded with a status of 503 \([^\r\n]*\)$/.test(
        message.text(),
      ) ||
      !matchesEndpoint(message.location().url)
    )
      return false;
    responses.shift();
    report(
      "Observed transient room-admission 503; successful connection assertions remain required",
    );
    return true;
  };
}
