"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileJson, MoreHorizontal, Trash2 } from "lucide-react";

export function DiagramActions({
  ready,
  canDelete,
  onJson,
  onSvg,
  onPdf,
  onDelete,
}: {
  ready: boolean;
  canDelete: boolean;
  onJson: () => void;
  onSvg: () => void;
  onPdf: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const actions = [
    { label: "Download JSON", icon: FileJson, run: onJson, disabled: !ready },
    { label: "Download SVG", icon: Download, run: onSvg, disabled: !ready },
    { label: "Download PDF", icon: Download, run: onPdf, disabled: !ready },
    {
      label: "Delete diagram",
      icon: Trash2,
      run: onDelete,
      disabled: !canDelete,
    },
  ];
  return (
    <div
      className="diagram-actions"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="diagram-actions-trigger"
        aria-label="Diagram actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "diagram-actions-menu" : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={23} />
      </button>
      {open && (
        <div
          id="diagram-actions-menu"
          className="diagram-actions-menu"
          role="menu"
          aria-label="Diagram actions"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]:not(:disabled)',
              ),
            );
            if (!buttons.length) return;
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "ArrowDown"
                ? (index + 1) % buttons.length
                : event.key === "ArrowUp"
                  ? (index - 1 + buttons.length) % buttons.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              buttons[next].focus();
            }
          }}
        >
          {actions.map(({ label, icon: Icon, run, disabled }, index) => (
            <button
              key={label}
              role="menuitem"
              tabIndex={-1}
              disabled={disabled}
              className={index === 3 ? "diagram-action-delete" : undefined}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                run();
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
