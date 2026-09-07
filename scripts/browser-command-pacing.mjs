// Sequential acceptance commands stay below the room's 30-per-10-second
// binding limit even on a fast runner. Normal UI work counts toward this gap.
export function createCommandPacer({
  now = () => performance.now(),
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  let previous = -Infinity;
  return async () => {
    const delay = Math.max(0, 400 - (now() - previous));
    if (delay > 0) await wait(delay);
    previous = now();
  };
}
