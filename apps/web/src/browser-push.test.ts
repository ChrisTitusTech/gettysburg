import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushSupportProblem, subscribeThisBrowser } from "./browser-push";

const publicKey = "AQIDBA";
const data = {
  endpoint: "https://fcm.googleapis.com/test",
  keys: { auth: "auth", p256dh: "key" },
  expirationTime: null,
};
const permission = vi.fn(
  async (): Promise<NotificationPermission> => "granted",
);
const subscription = {
  options: { applicationServerKey: new Uint8Array([1, 2, 3, 4]).buffer },
  toJSON: () => data,
};
const subscribe = vi.fn(async () => subscription);
const getSubscription = vi.fn(
  async (): Promise<typeof subscription | null> => null,
);
const register = vi.fn(async () => ({
  pushManager: { subscribe, getSubscription },
}));
beforeEach(() => {
  vi.clearAllMocks();
  permission.mockResolvedValue("granted");
  getSubscription.mockResolvedValue(null);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: permission,
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("navigator", {
    serviceWorker: { register, ready: Promise.resolve({}) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit browser push enrollment", () => {
  it("requests permission immediately, then registers and subscribes visibly", async () => {
    const result = subscribeThisBrowser(
      publicKey,
      new AbortController().signal,
    );
    expect(permission).toHaveBeenCalledOnce();
    expect(register).not.toHaveBeenCalled();
    await expect(result).resolves.toEqual(data);
    expect(register).toHaveBeenCalledWith("/push-worker.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3, 4]),
    });
  });
  it("does not register when permission is refused", async () => {
    permission.mockResolvedValueOnce("denied");
    await expect(
      subscribeThisBrowser(publicKey, new AbortController().signal),
    ).rejects.toThrow("not granted");
    expect(register).not.toHaveBeenCalled();
  });
  it("reuses matching subscriptions without changing other games", async () => {
    getSubscription.mockResolvedValueOnce(subscription);
    await expect(
      subscribeThisBrowser(publicKey, new AbortController().signal),
    ).resolves.toEqual(data);
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("does not silently rotate a mismatched browser key", async () => {
    getSubscription.mockResolvedValueOnce(subscription);
    await expect(
      subscribeThisBrowser("BQYHCA", new AbortController().signal),
    ).rejects.toThrow("older notification key");
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("cancels a pending permission prompt before registering", async () => {
    let finish!: (value: NotificationPermission) => void;
    permission.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const controller = new AbortController();
    const result = subscribeThisBrowser(publicKey, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    finish("granted");
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();
  });
  it("explains insecure, unsupported, and blocked environments without prompting", () => {
    vi.stubGlobal("isSecureContext", false);
    expect(pushSupportProblem()).toMatch(/HTTPS/);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {});
    expect(pushSupportProblem()).toMatch(/Home Screen/);
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("Notification", { permission: "denied" });
    expect(pushSupportProblem()).toMatch(/blocked/);
    expect(permission).not.toHaveBeenCalled();
  });
});
