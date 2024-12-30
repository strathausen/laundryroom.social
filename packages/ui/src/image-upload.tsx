import { useState } from "react";
import { ImageIcon } from "@radix-ui/react-icons";
import { upload } from "@vercel/blob/client";

import { Dialog, DialogContent, DialogTrigger } from "./dialog";
import { ImageUploadEnhancer } from "./image-upload-enhancer";

interface ImageUploaderProps {
  prefix?: string;
  imageUrl?: string;
  onChange: (imageUrl: string) => void;
}

export function ImageUploader(props: ImageUploaderProps) {
  const [preview, setPreview] = useState(props.imageUrl);
  const [showImagePicker, setShowImagePicker] = useState(false);

  return (
    <Dialog open={showImagePicker} onOpenChange={setShowImagePicker}>
      <DialogTrigger>
        <div
          className="group relative flex items-center gap-2 border-2 border-black"
          style={{ aspectRatio: "2/1" }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-3 border-2 border-black bg-white/30 px-4 py-2 backdrop-blur transition-all group-hover:bg-white/80">
              <ImageIcon /> upload image
            </div>
          </div>
          <img
            src={preview ?? props.imageUrl}
            style={{
              width: "100%",
              imageRendering: "pixelated",
              // imageRendering: -moz-crisp-edges;
              // imageRendering: crisp-edges;
            }}
          />
        </div>
      </DialogTrigger>
      <DialogContent>
        <ImageUploadEnhancer
          aspectRatio={2 / 1}
          onImageEnhanced={(image) => {
            setPreview(image);
          }}
          onBlob={async (blob) => {
            const res = await upload(
              `${props.prefix}/${Math.random()}.png`,
              blob,
              {
                access: "public",
                handleUploadUrl: "/api/upload",
              },
            );
            props.onChange(res.url);
            setShowImagePicker(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
