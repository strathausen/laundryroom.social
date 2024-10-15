import * as React from "react";

import { cn } from "@laundryroom/ui";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // "flex h-9 w-full border border-input px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          // "mt-1 rounded border border-b-4 border-fancyorange bg-background px-2 py-1 outline-none transition-colors focus:bg-slate-50/10",
          "h-9 w-full rounded-none border-2 border-black p-2 shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 focus:-translate-x-0.5 focus:-translate-y-0.5 focus:shadow-[4px_4px_0px_0px_#ff00ff] focus:outline-none focus:ring-2 focus:ring-black active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0px_0px_#ff00ff]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
