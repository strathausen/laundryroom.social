interface Props {
  icon?: React.ReactNode;
  label: string | number;
}

export function InfoTag({ icon, label }: Props) {
  return (
    <span className="flex gap-2 bg-black px-2 py-1 text-sm text-white items-center">
      {icon}
      {label}
    </span>
  );
}
