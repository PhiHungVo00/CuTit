import React from 'react';
import { ICON_PATHS, type IconName } from './paths.js';

export interface IconProps {
  name: IconName;
  size?: number;
  /** Có `title` ⇒ icon mang nghĩa (role="img"); không có ⇒ trang trí (aria-hidden). */
  title?: string;
  className?: string;
}

export const Icon = ({ name, size = 24, title, className }: IconProps) => {
  const decorative = !title;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
};
