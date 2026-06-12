// Stroke-only icon set matching design_handoff/data.jsx `I.*`.
// All icons share a 24x24 viewBox and 1.5px stroke.

import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "size"> & { size?: number; sw?: number };

function base({ size = 16, sw = 1.5, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const I = {
  filter: (p: IconProps) => base({ ...p, children: <><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></> }),
  plus: (p: IconProps) => base({ ...p, children: <path d="M12 5v14M5 12h14" /> }),
  arrow: (p: IconProps) => base({ ...p, children: <path d="M5 12h14M13 6l6 6-6 6" /> }),
  arrowDown: (p: IconProps) => base({ ...p, children: <path d="M12 5v14M6 13l6 6 6-6" /> }),
  check: (p: IconProps) => base({ ...p, children: <path d="M4 12l5 5L20 6" /> }),
  close: (p: IconProps) => base({ ...p, children: <path d="M6 6l12 12M18 6L6 18" /> }),
  chevron: (p: IconProps) => base({ ...p, children: <path d="M9 6l6 6-6 6" /> }),
  chevronL: (p: IconProps) => base({ ...p, children: <path d="M15 6l-6 6 6 6" /> }),
  chevronD: (p: IconProps) => base({ ...p, children: <path d="M6 9l6 6 6-6" /> }),
  search: (p: IconProps) => base({ ...p, children: <path d="M11 4a7 7 0 100 14 7 7 0 000-14zm9 16l-4.35-4.35" /> }),
  user: (p: IconProps) => base({ ...p, children: <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /> }),
  users: (p: IconProps) =>
    base({ ...p, children: <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /> }),
  home: (p: IconProps) => base({ ...p, children: <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2h-5v-7h-4v7H5a2 2 0 01-2-2z" /> }),
  list: (p: IconProps) => base({ ...p, children: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> }),
  scale: (p: IconProps) => base({ ...p, children: <path d="M3 7h18M7 7v14M17 7v14M3 21h18M7 7l-3 6h6zM17 7l3 6h-6z" /> }),
  chart: (p: IconProps) => base({ ...p, children: <path d="M3 21h18M6 17v-6M10 17V9M14 17v-4M18 17V7" /> }),
  bell: (p: IconProps) =>
    base({ ...p, children: <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /> }),
  calendar: (p: IconProps) =>
    base({ ...p, children: <path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18" /> }),
  edit: (p: IconProps) =>
    base({ ...p, children: <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" /> }),
  trash: (p: IconProps) =>
    base({ ...p, children: <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /> }),
  dots: (p: IconProps) =>
    base({ ...p, sw: 2, children: <path d="M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z" /> }),
  leaf: (p: IconProps) =>
    base({ ...p, children: <path d="M21 3s-6 0-11 5-5 11-5 11 6 0 11-5 5-11 5-11zM5 19c3-6 8-11 14-14" /> }),
  sparkle: (p: IconProps) => base({ ...p, children: <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /> }),
  settings: (p: IconProps) =>
    base({
      ...p,
      children: (
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.35 7.35 0 00-.1-1.2l2-1.6-2-3.4-2.4.8a7.3 7.3 0 00-2.1-1.2L14.4 3h-4l-.4 2.4a7.3 7.3 0 00-2.1 1.2l-2.4-.8-2 3.4 2 1.6a7.35 7.35 0 000 2.4l-2 1.6 2 3.4 2.4-.8a7.3 7.3 0 002.1 1.2l.4 2.4h4l.4-2.4a7.3 7.3 0 002.1-1.2l2.4.8 2-3.4-2-1.6a7.35 7.35 0 00.1-1.2z" />
      ),
    }),
  sun: (p: IconProps) =>
    base({ ...p, children: <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 7a5 5 0 100 10 5 5 0 000-10z" /> }),
  moon: (p: IconProps) => base({ ...p, children: <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /> }),
  receipt: (p: IconProps) =>
    base({ ...p, children: <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2zM9 7h6M9 11h6M9 15h4" /> }),
  download: (p: IconProps) =>
    base({ ...p, children: <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /> }),
  upload: (p: IconProps) =>
    base({ ...p, children: <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /> }),
};
