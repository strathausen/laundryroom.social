/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React, { useEffect, useRef } from "react";

interface AutoHeightTextareaProps {
  value: string;
  className: string;
  onChange: (value: string) => void;
}

export function AutoHeightTextarea(props: AutoHeightTextareaProps) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const textAreaRef = useRef(null) as any;

  useEffect(() => {
    if (textAreaRef.current) {
      // Reset height to 'auto' to correctly measure the scrollHeight
      textAreaRef.current.style.height = "auto";
      // Set height to scrollHeight (the full height of the content)
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [props.value]);

  return (
    <textarea
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      ref={textAreaRef}
      value={props.value}
      onChange={(e) => {
        props.onChange(e.target.value);
      }}
      className={props.className}
      rows={1} // start with a single row
    />
  );
}
