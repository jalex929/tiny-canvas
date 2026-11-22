/** True when a key press is meant for a text field, or a modal dialog is open. */
export function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (document.querySelector("dialog[open]")) return true;
  if (!target) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return (
    target instanceof HTMLInputElement && !["radio", "checkbox", "range"].includes(target.type)
  );
}
