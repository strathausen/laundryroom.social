import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from ".";

type TypographyVariant =
  | "h1"
  | "h2"
  // | "h3"
  // | "h4"
  | "body"
  | "caption"
  | "overline"
  | "label";

interface Props extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: TypographyVariant;
  children: ReactNode;
}

const variantStyles: Record<TypographyVariant, string> = {
  h1: "text-3xl tracking-tight uppercase",
  h2: "text-xl uppercase underline decoration-green-400 decoration-4 tracking-tight",
  // h3: "text-2xl font-semibold tracking-tight",
  // h4: "text-xl font-semibold tracking-tight",
  body: "text-base leading-7",
  caption: "text-sm leading-5 text-gray-500",
  overline: "text-xs uppercase tracking-wider text-gray-500",
  label: "text-sm font-medium",
};

export const Text = forwardRef<HTMLElement, Props>(
  (
    { as: Tag = "span", variant = "body", className, children, ...props },
    ref,
  ) => {
    const classes = cn(variantStyles[variant], className);
    return (
      <Tag ref={ref} className={classes} {...props}>
        {children}
      </Tag>
    );
  },
);

Text.displayName = "Text";
