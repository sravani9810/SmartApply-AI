"use client";

import { useTransition } from "react";
import { deleteResume } from "../db/actions";

/**
 * Deleting a résumé can't be undone, so this asks first. A plain server-action
 * form would delete on a mis-click, and the library shows a grid of similar
 * looking cards — exactly where a mis-click is likely.
 */
export function DeleteResumeButton({
  id, label, redirectTo, className = "btn danger", children = "Delete",
}: {
  id: string;
  label?: string | null;
  redirectTo?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        const name = label?.trim() || "this résumé";
        if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
        start(() => { void deleteResume(id, redirectTo); });
      }}
    >
      {pending ? "Deleting…" : children}
    </button>
  );
}
