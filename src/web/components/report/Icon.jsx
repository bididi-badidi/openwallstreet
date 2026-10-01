import React from "react";
const iconPaths = {
  "chevron-left": "m15 18-6-6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  "chevron-down": "m6 9 6 6 6-6",
  "arrow-up-right": "M7 17 17 7M7 7h10v10",
  x: "m6 6 12 12M6 18 18 6",
  info: "M12 11v6M12 7h.01",
  "file-text":
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h8",
};
export function Icon({ name, className = "" }) {
  return (
    <span className={"ws-icon " + className} aria-hidden="true">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {name === "info" && <circle cx="12" cy="12" r="10" />}
        <path d={iconPaths[name]} />
      </svg>
    </span>
  );
}
