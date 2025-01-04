export function MultilineText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap">
      {text.split(/[\n]/g).map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}
