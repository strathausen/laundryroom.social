import { cn } from ".";

interface Props  {
  children: React.ReactNode;
  title?: string;
  className?: string;
};

export function Box(props: Props) {
  return (
    <div className={cn(props.className, "border-2 border-black bg-white p-4")}>
      {props.children}
    </div>
  );
}
