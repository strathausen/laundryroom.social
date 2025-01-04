/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React, { useEffect, useRef } from "react";

interface AutoWidthTextareaProps {
  value: string;
  className: string;
  readonly: boolean;
  onChange: (value: string) => void;
}

export function AutoWidthTextarea(props: AutoWidthTextareaProps) {
  const textAreaRef = useRef(null) as any;

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.width = "0";
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.width = `${Number(textAreaRef.current.scrollWidth) + 4}px`;
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [props.value]);

  return (
    <textarea
      ref={textAreaRef}
      value={props.value}
      onChange={(e) => {
        props.onChange(e.target.value);
      }}
      className={props.className + " resize-none whitespace-nowrap"}
      rows={1} // start with a single row
      cols={1} // start with a single column
      onBeforeInput={(e: any) => {
        if (e.data?.match(/\D/)) {
          e.preventDefault();
        }
      }}
      readOnly={props.readonly}
    />
  );
}
