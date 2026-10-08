import { useEffect, useId, useRef, type ReactNode } from "react";

/** A non-modal disclosure: form controls keep their normal keyboard semantics. */
export function GameMenu({
  label,
  open,
  onOpenChange,
  children,
}: {
  readonly label: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);
  return (
    <div
      className="game-menu"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          onOpenChange(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
      >
        {label} <span className="menu-chevron" aria-hidden="true" />
      </button>
      <div
        id={id}
        className="game-menu-panel"
        role="region"
        aria-label={`${label} menu`}
        hidden={!open}
      >
        {typeof children === "function"
          ? children(() => {
              onOpenChange(false);
              trigger.current?.focus();
            })
          : children}
      </div>
    </div>
  );
}
