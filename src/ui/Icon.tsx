const PATHS = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  line: "M5 19 19 5M5 19h.01M19 5h.01",
  frame: "M4 4h16v16H4zM8 4v16M4 8h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  spiro:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM14.5 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM15.5 11h.01",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01",
  shapes: "M4 10h6v6H4zM17 4l4 7h-8zM16.5 13.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z",
  bucket: "M5 11 12 4l7 7-7 7-7-7ZM5 11h14M20 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3Z",
  pencil: "M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4",
  dropper: "m14 7 3 3M5 19l1-4 9-9a2.1 2.1 0 0 1 3 3l-9 9-4 1ZM16 4l4 4",
  share: "M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.9-2.5L3.3 14a1.6 1.6 0 0 1 2.4-2.1L8 14",
  brush: "M4 20c3 0 5-1.5 5-4a2.5 2.5 0 0 0-5 0c0 1.5-1 2.5-2 3M9.5 13.5 20 3",
  palette:
    "M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.4-.7-2.3 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3ZM7.5 11h0M10 7.5h0M14.5 7.5h0",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
  shelf: "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  close: "M6 6l12 12M18 6 6 18",
  arrowLeft: "M15 6l-6 6 6 6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
