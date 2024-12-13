import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from ".";

interface PageProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
}

export const PageContainer = forwardRef<HTMLElement, PageProps>(
  ({ as: Tag = "main", className, children, ...props }, ref) => {
    return (
      <Tag
        ref={ref}
        className={cn(
          "container min-h-screen max-w-screen-lg py-16",
          className,
        )}
        {...props}
      >
        {children}
      </Tag>
    );
  },
);

PageContainer.displayName = "Page";
