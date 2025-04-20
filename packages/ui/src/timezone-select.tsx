import React from "react";
import {
  ITimezone,
  ITimezoneOption,
  useTimezoneSelect,
} from "react-timezone-select";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export type { ITimezone };

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: ITimezoneOption) => void;
  className?: string;
}

export const TimezoneSelect = React.forwardRef<
  HTMLDivElement,
  TimezoneSelectProps
>(({ value, onChange, className }, ref) => {
  const { options, parseTimezone } = useTimezoneSelect({});

  return (
    <div ref={ref} className={className}>
      <Select
        value={value}
        onValueChange={(val) => onChange(parseTimezone(val))}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select timezone" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});

TimezoneSelect.displayName = "TimezoneSelect";
