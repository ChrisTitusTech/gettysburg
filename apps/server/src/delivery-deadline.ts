export const ROOM_DELIVERY_TIMEOUT_MS = 2_000;

export async function withinDeliveryDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  cancelled?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  cancelled?.addEventListener("abort", cancel, { once: true });
  if (cancelled?.aborted) controller.abort();
  const timer = setTimeout(cancel, ROOM_DELIVERY_TIMEOUT_MS);
  timer.unref();
  let rejectDeadline = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = () =>
      reject(new Error("Room delivery was cancelled or timed out."));
    controller.signal.addEventListener("abort", rejectDeadline, { once: true });
  });
  try {
    if (controller.signal.aborted)
      throw new Error("Room delivery was cancelled.");
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    cancelled?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectDeadline);
    controller.abort();
  }
}
