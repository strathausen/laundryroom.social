export default function MdxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose dark:prose-invert prose-stone prose-headings:font-vollkorn mx-auto mt-5 w-full max-w-2xl px-10 py-6">
      {children}
    </div>
  );
}
