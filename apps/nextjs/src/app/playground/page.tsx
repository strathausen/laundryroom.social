import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

export default function PlaygroundPage() {
  return (
    <main className="container h-screen py-16 text-foreground">
      <div className="flex flex-col gap-4">
        <h1 className="text-5xl font-bold underline decoration-fancyorange decoration-4">
          Playground
        </h1>
        <p>
          This is a playground page. You can use this page to test out new
          features or components.
        </p>
        <div className="flex gap-2">
          <button className="rounded-md bg-tahiti px-2 py-1 font-bold text-background text-white shadow-hardrock shadow-hotpink transition-shadow hover:shadow-hardrock-lg hover:shadow-hotpink active:shadow-hardrock-sm active:shadow-hotpink">
            test test button
          </button>
          {/* bermuda tahiti button */}
          <button className="rounded-md bg-bermuda px-2 py-1 font-bold text-foreground shadow-hardrock shadow-tahiti transition-all">
            test test button
          </button>
          <div className="flex flex-col gap-4">
            <Input placeholder="test test input" />
            <div className="flex gap-4">
              <Button variant="primary">test test button</Button>
              <Button variant="destructive">test test button</Button>
              <Button variant="outline">test test button</Button>
              <Button variant="secondary">test test button</Button>
              <Button variant="ghost">test test button</Button>
              <Button variant="link">test test button</Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
