import { Component, type ReactNode } from "react";

// Optional notification code must not tear down the authoritative game view.
export class NotificationBoundary extends Component<
  { readonly children: ReactNode },
  { readonly unavailable: boolean }
> {
  override state = { unavailable: false };

  static getDerivedStateFromError() {
    return { unavailable: true };
  }

  override render() {
    return this.state.unavailable ? (
      <p role="status">
        Notification controls are unavailable. You can keep playing; reload the
        page when convenient to try again.
      </p>
    ) : (
      this.props.children
    );
  }
}
