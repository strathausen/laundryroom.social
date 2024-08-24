import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

export default function PlaygroundPage() {
  return (
    <main className="container h-screen py-16 text-foreground">
      <div className="flex flex-col gap-4">
        <h1 className="decoration-fancyorange text-5xl font-bold underline decoration-4">
          Playground
        </h1>
        <p>
          This is a playground page. You can use this page to test out new
          features or components.
        </p>
        <div className="flex gap-2">
          <button className="shadow-hardrock hover:shadow-hardrock-lg active:shadow-hardrock-sm shadow-hotpink active:shadow-hotpink hover:shadow-hotpink bg-tahiti rounded-md px-2 py-1 font-bold text-background text-white transition-shadow">
            test test button
          </button>
          {/* bermuda tahiti button */}
          <button className="bg-bermuda shadow-hardrock shadow-tahiti rounded-md px-2 py-1 font-bold text-foreground transition-all">
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
