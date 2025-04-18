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
          "container min-h-screen py-16 md:max-w-screen-lg print:min-h-0 print:py-0",
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
