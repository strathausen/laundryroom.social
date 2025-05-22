"use client";

import React from "react";
import QRCode from "react-qr-code";

export function LaundryroomPromo() {
  return (
    <div className="print:landscape mt-8 bg-white p-8 font-mono print:bg-white">
      <div className="mx-auto max-w-2xl border-4 border-black bg-white p-8 shadow-[8px_8px_0px_0px_#ff00ff]">
        <h1 className="mb-6 border-b-4 border-black pb-2 text-5xl font-extrabold tracking-tight">
          {/* // [text-shadow:2px_2px_0px_#fff,4px_4px_0px_#fef08a]"> */}
          laundryroom.social
        </h1>

        <div className="mb-8 border-2 border-black bg-yellow-200 p-4 text-2xl font-bold">
          free meetups - no bs
        </div>

        <div className="mb-8 text-xl">
          <p className="mb-4">
            <span className="font-bold">Hi,</span> I'm an indie developer and
            I've just launched the website{" "}
            <span className="font-bold underline">www.laundryroom.social</span>
          </p>
          <p className="mb-4">
            It's a new place to organise <b>meetups</b>, gatherings and events{" "}
            <b>for free</b>!
          </p>
        </div>

        <div className="mb-8 flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="border-4 border-black bg-white p-4">
            <QRCode
              value="https://www.laundryroom.social"
              size={200}
              level="H"
            />
          </div>

          <div className="border-l-4 border-black py-2 pl-6">
            <h2 className="mb-4 border-b-2 border-[#00ff00] text-2xl font-bold uppercase">
              missing a feature?
            </h2>
            <p className="mb-2">
              this project is young and you can <b>make it yours</b> by sending
              me your suggestions, feature requests or feedback:
            </p>
            <p className="text-shadow-[0_0_5px_#ff00ff,0_0_10px_#ff00ff] mb-4 text-lg font-bold">
              philipp@laundryroom.social
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div className="h-2 w-32 bg-[#ff00ff]"></div>
          <div className="border-t-4 border-black pt-4 text-center italic">
            <p>
              made with ❤️ <br /> on the island of alt-stralau
            </p>
          </div>

          <div className="h-2 w-32 bg-[#00ff00]"></div>
        </div>
      </div>
      <footer className="mt-8 text-center" data-id="32">
        <div
          // wiggle on hover
          className="inline-block rotate-[-2deg] transform cursor-pointer border-2 border-black bg-yellow-200 p-2 transition-transform duration-300 hover:rotate-0"
          data-id="33"
        >
          <span className="font-mono text-lg font-medium">
            Print me and share!
          </span>
        </div>
      </footer>
    </div>
  );
}
