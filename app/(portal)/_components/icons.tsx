export function SvgIcon({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "size-5"}
      fill="currentColor"
      role={title ? "img" : "presentation"}
      aria-label={title}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  grid: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </SvgIcon>
  ),
  news: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M4 5h12a2 2 0 0 1 2 2v1h2v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5Zm2 2v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10H8V8h10V7a0 0 0 0 0 0 0H6Zm2 5h7v2H8v-2Zm0 4h6v2H8v-2Z" />
    </SvgIcon>
  ),
  announcements: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M3 11v2h2l7 4v-2.2l4.6 1.3a2 2 0 0 0 2.4-1.9V8.8a2 2 0 0 0-2.4-1.9L12 8.2V6L5 10H3Zm9 1 7-2V14l-7-2Z" />
    </SvgIcon>
  ),
  bell: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2H9.55A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5L3 18v1h18v-1l-2-2Z" />
    </SvgIcon>
  ),
  users: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-3.33 0-6 1.34-6 3v3h12v-3c0-1.66-2.67-3-6-3ZM8 13c-2.67 0-5 1.34-5 3v3h5v-3c0-1.08.43-2.05 1.25-2.82A8 8 0 0 0 8 13Z" />
    </SvgIcon>
  ),
  search: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M10 18a8 8 0 1 1 5.3-14l4.7 4.7-1.4 1.4-3.9-3.9A6 6 0 1 0 10 16a5.9 5.9 0 0 0 3.5-1.1l1.2 1.6A7.9 7.9 0 0 1 10 18Z" />
    </SvgIcon>
  ),
  edit: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M4 17.25V20h2.75L17.8 8.95l-2.75-2.75L4 17.25Zm15.7-9.2a1 1 0 0 0 0-1.4l-1.35-1.35a1 1 0 0 0-1.4 0l-1.05 1.05 2.75 2.75 1.05-1.05Z" />
    </SvgIcon>
  ),
  trash: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M6 7h12v2H6V7Zm2 3h8l-1 11H9L8 10Zm3-6h2l1 2H10l1-2Z" />
    </SvgIcon>
  ),
  plus: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
    </SvgIcon>
  ),
  help: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 17h-2v-2h2v2Zm2-7.5-.9.9A2.5 2.5 0 0 0 12 15h-2v-.5a3.5 3.5 0 0 1 1-2.5l1.2-1.2a1.8 1.8 0 0 0 .6-1.3 2 2 0 0 0-4 0H6a4 4 0 0 1 8 0 3.1 3.1 0 0 1-1 2Z" />
    </SvgIcon>
  ),
  logout: (props?: { className?: string; title?: string }) => (
    <SvgIcon {...props}>
      <path d="M10 17v-2h4v-6h-4V7l-5 5 5 5Zm7-13H9v2h8v12H9v2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
    </SvgIcon>
  ),
};
