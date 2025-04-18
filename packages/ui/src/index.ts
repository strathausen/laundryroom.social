import { cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

const cn = (...inputs: Parameters<typeof cx>) => twMerge(cx(inputs));

export { cn };

export * from "./avatar";
export * from "./button";
export * from "./card";
export * from "./checkbox";
export * from "./dialog";
export * from "./dropdown-menu";
export * from "./form";
export * from "./input";
export * from "./popover";
export * from "./select";
export * from "./textarea";
export * from "./toast";
export * from "./user-profile";
