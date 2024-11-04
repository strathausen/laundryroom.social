import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from ".";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "hover:bg-primary/90 bg-primary text-primary-foreground shadow",
        primary:
          "bg-tahiti px-2 py-1 font-bold text-background text-white shadow-hardrock shadow-hotpink transition-shadow hover:shadow-hardrock-lg hover:shadow-hotpink active:shadow-hardrock-sm active:shadow-hotpink",
        brutal:
          "rounded-none bg-black uppercase text-white shadow-[4px_4px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-1 hover:-translate-y-1 hover:bg-gray-800 hover:shadow-[6px_6px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[2px_2px_0px_0px_#ff00ff]",
        plattenbau:
          "mt-2 rounded-none bg-gray-200 uppercase text-black shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-300 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-400 active:shadow-[1px_1px_0px_0px_#ff00ff]",
        destructive:
          "hover:bg-destructive/90 bg-destructive text-destructive-foreground shadow-sm",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "hover:bg-secondary/80 bg-secondary text-secondary-foreground shadow-sm",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 shadow-none hover:underline",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-9 px-4 py-2",
        lg: "h-10 rounded-lg px-8",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "brutal",
      size: "md",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={
          // for some reason, these don't work when they're in the variants object
          // "shadow-hardrock hover:shadow-hardrock-lg active:shadow-hardrock-sm " +
          cn(buttonVariants({ variant, size, className }))
        }
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
