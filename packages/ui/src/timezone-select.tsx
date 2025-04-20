import React from 'react';
import TimezoneSelectBase, { ITimezone } from 'react-timezone-select';
import { cn } from './lib/utils';

export interface TimezoneSelectProps {
  value: ITimezone;
  onChange: (timezone: ITimezone) => void;
  className?: string;
}

export const TimezoneSelect = React.forwardRef<HTMLDivElement, TimezoneSelectProps>(
  ({ value, onChange, className }, ref) => {
    return (
      <div ref={ref} className={cn('timezone-select', className)}>
        <TimezoneSelectBase
          value={value}
          onChange={onChange}
          classNamePrefix="timezone-select"
        />
      </div>
    );
  }
);

TimezoneSelect.displayName = 'TimezoneSelect'; 