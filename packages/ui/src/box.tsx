import type { VariantProps } from "class-variance-authority";
import React from "react";
import { cva } from "class-variance-authority";

import { cn } from ".";

interface Props {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

const boxVariants = cva("border-2 border-black bg-white p-4", {
  variants: {
    variant: {
      default: "",
      grau: "border bg-gray-100",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface BoxProps extends Props, VariantProps<typeof boxVariants> {}

const Box = React.forwardRef<HTMLDivElement, BoxProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <div
        className={cn(boxVariants({ variant, className }))}
        {...props}
        ref={ref}
      >
        {children}
      </div>
    );
  },
);

Box.displayName = "Box";
export { Box, boxVariants };
