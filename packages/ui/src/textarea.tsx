import * as React from "react";

import { cn } from ".";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "w-full rounded-none border-2 border-black p-2 shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-200 focus:-translate-x-0.5 focus:-translate-y-0.5 focus:shadow-[4px_4px_0px_0px_#ff00ff] focus:outline-none focus:ring-2 focus:ring-black active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0px_0px_#ff00ff] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
