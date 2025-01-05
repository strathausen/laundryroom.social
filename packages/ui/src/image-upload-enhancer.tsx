/* eslint-disable @typescript-eslint/no-non-null-assertion */
"use client";

import type { Crop as CropType, PixelCrop } from "react-image-crop";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, Crop, Upload } from "lucide-react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";

import { Button } from "./button";
import { Card, CardContent } from "./card";
import { Label } from "./label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Slider } from "./slider";

import "react-image-crop/dist/ReactCrop.css";

interface ImageUploadEnhancerProps {
  aspectRatio?: number;
  onImageEnhanced: (enhancedImageUrl: string) => void;
  onBlob?: (blob: Blob) => void;
}

type RGBColor = [number, number, number];
type ColorPaletteType = "default" | "gameboy" | "cga" | "ega" | "c64";
type ColorPalette = Record<ColorPaletteType, RGBColor[]>;

const COLOR_PALETTES: ColorPalette = {
  default: [],
  gameboy: [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15],
  ],
  cga: [
    [0, 0, 0],
    [255, 255, 255],
    [255, 85, 85],
    [85, 255, 85],
    [85, 85, 255],
    [255, 255, 85],
  ],
  ega: [
    [0, 0, 0],
    [255, 255, 255],
    [170, 0, 0],
    [0, 170, 0],
    [0, 0, 170],
    [170, 85, 0],
    [170, 0, 170],
    [170, 170, 85],
    [85, 85, 85],
    [255, 85, 85],
    [85, 255, 85],
    [85, 255, 255],
    [255, 255, 85],
    [255, 85, 255],
    [85, 255, 255],
  ],
  c64: [
    [0, 0, 0],
    [255, 255, 255],
    [136, 0, 0],
    [170, 255, 238],
    [204, 68, 204],
    [0, 204, 85],
    [0, 0, 170],
    [238, 238, 119],
    [221, 136, 85],
    [102, 68, 0],
    [255, 119, 119],
    [51, 51, 51],
    [119, 119, 119],
    [170, 255, 102],
    [0, 136, 255],
    [187, 187, 187],
  ],
};

interface RetroOptions {
  colorLevels: number;
  dithering: boolean;
  scanlines: boolean;
  pixelate: boolean;
  pixelSize: number;
  colorPalette: ColorPaletteType;
}

export function ImageUploadEnhancer({
  aspectRatio = 1,
  onImageEnhanced,
  onBlob,
}: ImageUploadEnhancerProps) {
  const [image, setImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const [maxDimension, setMaxDimension] = useState<number>(500);
  const [options, setOptions] = useState<RetroOptions>({
    colorLevels: 5,
    dithering: true,
    scanlines: false,
    pixelate: false,
    pixelSize: 2,
    colorPalette: "default",
  });

  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget;

    const crop = centerCrop(
      makeAspectCrop(
        {
          unit: "%",
          width: 90,
        },
        aspectRatio,
        width,
        height,
      ),
      width,
      height,
    );

    setCrop(crop);
  }

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = (e) => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const resizedImage = canvas.toDataURL("image/jpeg");
        setImage(resizedImage);
        setCroppedImage(null);
        setPreviewImage(null);
        setIsCropping(true);
        onImageLoad(e as unknown as React.SyntheticEvent<HTMLImageElement>);
        // setCompletedCrop(convertToPixelCrop(newCrop, img.width, img.height));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const getCroppedImg = useCallback(
    (image: HTMLImageElement, crop: PixelCrop) => {
      const canvas = document.createElement("canvas");
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      canvas.width = crop.width;
      canvas.height = crop.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("No 2d context");
      }

      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height,
      );

      return canvas;
    },
    [],
  );

  const handleFinishCropping = useCallback(() => {
    if (completedCrop && imageRef.current) {
      const canvas = getCroppedImg(imageRef.current, completedCrop);
      const croppedImageUrl = canvas.toDataURL("image/jpeg");
      setCroppedImage(croppedImageUrl);
      setPreviewImage(croppedImageUrl);
      setIsCropping(false);
    }
  }, [completedCrop, getCroppedImg]);

  const applyRetroEffect = useCallback(
    (canvas: HTMLCanvasElement, options: RetroOptions) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      if (options.pixelate) {
        pixelateImage(
          imageData,
          canvas.width,
          canvas.height,
          options.pixelSize,
        );
      }

      const palette = COLOR_PALETTES[options.colorPalette];

      for (let i = 0; i < data.length; i += 4) {
        const oldColor: RGBColor = [data[i]!, data[i + 1]!, data[i + 2]!];
        // if (oldColor[3] === 0) continue;
        if (!oldColor[0] && !oldColor[1] && !oldColor[2]) continue;

        let newColor: number[];
        if (palette.length > 0) {
          newColor = findClosestColor(oldColor, palette);
        } else {
          newColor = oldColor.map(
            (c) =>
              (Math.round((c / 255) * (options.colorLevels - 1)) /
                (options.colorLevels - 1)) *
              255,
          );
        }

        if (options.dithering) {
          for (let j = 0; j < 3; j++) {
            const error = oldColor[j]! - newColor[j]!;
            distributeError(data, canvas.width, canvas.height, i, j, error);
          }
        }

        data[i] = newColor[0]!;
        data[i + 1] = newColor[1]!;
        data[i + 2] = newColor[2]!;
      }

      ctx.putImageData(imageData, 0, 0);

      if (options.scanlines) {
        applyScanlines(ctx, canvas.width, canvas.height);
      }
    },
    [],
  );

  const findClosestColor = (color: RGBColor, palette: RGBColor[]) => {
    return palette.reduce((closest, current) => {
      const currentDiff = Math.sqrt(
        Math.pow(color[0] - current[0], 2) +
          Math.pow(color[1] - current[1], 2) +
          Math.pow(color[2] - current[2], 2),
      );
      const closestDiff = Math.sqrt(
        Math.pow(color[0] - closest[0], 2) +
          Math.pow(color[1] - closest[1], 2) +
          Math.pow(color[2] - closest[2], 2),
      );
      return currentDiff < closestDiff ? current : closest;
    });
  };

  const pixelateImage = (
    imageData: ImageData,
    width: number,
    height: number,
    pixelSize: number,
  ) => {
    const data = imageData.data;
    for (let y = 0; y < height; y += pixelSize) {
      for (let x = 0; x < width; x += pixelSize) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        for (let py = 0; py < pixelSize && y + py < height; py++) {
          for (let px = 0; px < pixelSize && x + px < width; px++) {
            const pixelIndex = ((y + py) * width + (x + px)) * 4;
            data[pixelIndex] = r!;
            data[pixelIndex + 1] = g!;
            data[pixelIndex + 2] = b!;
          }
        }
      }
    }
  };

  const distributeError = (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    i: number,
    channel: number,
    error: number,
  ) => {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const distribution: [number, number, number][] = [
      [1, 0, 7 / 16],
      [-1, 1, 3 / 16],
      [0, 1, 5 / 16],
      [1, 1, 1 / 16],
    ];

    for (const [dx, dy, factor] of distribution) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const ni = (ny * width + nx) * 4 + channel;
        data[ni] = Math.max(0, Math.min(255, data[ni]! + error * factor));
      }
    }
  };

  const applyScanlines = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    for (let y = 0; y < height; y += 2) {
      ctx.fillRect(0, y, width, 1);
    }
  };

  const handleEnhance = () => {
    if (previewImage) {
      onImageEnhanced(previewImage);
    }
    if (blob) {
      onBlob?.(blob);
    }
  };

  useEffect(() => {
    if (croppedImage) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          applyRetroEffect(canvas, options);
          setPreviewImage(canvas.toDataURL("image/png"));
          canvas.toBlob((blob) => {
            setBlob(blob);
          });
        }
      };
      img.src = croppedImage;
    }
  }, [croppedImage, options, applyRetroEffect]);

  return (
    <div className="">
      <h2 className="mb-4 text-center font-mono text-2xl uppercase">
        Image Enhancer 3000
      </h2>
      <div className="mb-4">
        {!previewImage ? (
          <Card className="mb-4 rounded-none border-2 border-black">
            <CardContent className="flex items-center p-4">
              {image && isCropping ? (
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectRatio}
                  className="m-auto bg-pink-500"
                >
                  <img
                    ref={imageRef}
                    src={image}
                    alt="Upload"
                    style={{ maxHeight: "400px" }}
                  />
                </ReactCrop>
              ) : croppedImage ? (
                <img
                  src={croppedImage}
                  alt="Cropped"
                  style={{ maxHeight: "400px", margin: "auto" }}
                />
              ) : (
                <div className="flex h-[300px] w-full items-center justify-center rounded-none border-2 border-dashed border-black">
                  <p className="text-center">
                    Upload an image to begin enhancing!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-4 rounded-none border-2 border-black bg-gray-900">
            <CardContent className="p-4">
              <img
                src={previewImage}
                alt="Preview"
                style={{ maxHeight: "300px", margin: "auto" }}
              />
            </CardContent>
          </Card>
        )}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {previewImage && (
          <div className="space-y-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="colorPalette" className="flex-1">
                Color Palette:
              </Label>
              <Select
                value={options.colorPalette}
                onValueChange={(value) =>
                  setOptions((prev) => ({
                    ...prev,
                    colorPalette: value as ColorPaletteType,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a palette" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-[#ff00ff] bg-gray-800 text-green-500">
                  {Object.keys(COLOR_PALETTES).map((palette) => (
                    <SelectItem key={palette} value={palette}>
                      {palette}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className={`flex flex-col space-y-2 ${options.colorPalette !== "default" ? "opacity-50" : ""}`}
            >
              <Label htmlFor="colorLevels" className="flex-1">
                Color Levels: {options.colorLevels}
              </Label>
              <Slider
                id="colorLevels"
                min={2}
                max={8}
                step={1}
                value={[options.colorLevels]}
                onValueChange={([value]) =>
                  setOptions((prev) => ({ ...prev, colorLevels: value ?? 5 }))
                }
                disabled={options.colorPalette !== "default"}
                className="rounded-sm border-2 border-black [&_[role=slider]]:cursor-pointer [&_[role=slider]]:border-2 [&_[role=slider]]:border-black [&_[role=slider]]:bg-green-400"
              />
            </div>
          </div>
        )}
        {!previewImage ? (
          <div className="space-y-4">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="maxDimension" className="">
                Scale down to width: {maxDimension}px
              </Label>
              <Slider
                id="maxDimension"
                min={200}
                max={2000}
                step={100}
                value={[maxDimension]}
                onValueChange={([value]) => setMaxDimension(value ?? 500)}
                className="rounded-sm border-2 border-black [&_[role=slider]]:cursor-pointer [&_[role=slider]]:border-2 [&_[role=slider]]:border-black [&_[role=slider]]:bg-green-400"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="dithering" className="flex-1">
                Dithering
              </Label>
              <input
                type="checkbox"
                id="dithering"
                checked={options.dithering}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    dithering: e.target.checked,
                  }))
                }
                className="cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="scanlines" className="flex-1">
                Scanlines
              </Label>
              <input
                type="checkbox"
                id="scanlines"
                checked={options.scanlines}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    scanlines: e.target.checked,
                  }))
                }
                className="cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pixelate" className="flex-1">
                Pixelate
              </Label>
              <input
                type="checkbox"
                id="pixelate"
                checked={options.pixelate}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    pixelate: e.target.checked,
                  }))
                }
                className="cursor-pointer"
              />
            </div>
            {options.pixelate && (
              <div className="flex flex-col space-y-2">
                <Label htmlFor="pixelSize" className="flex-1">
                  Pixel Size: {options.pixelSize}
                </Label>
                <Slider
                  id="pixelSize"
                  min={1}
                  max={12}
                  step={1}
                  value={[options.pixelSize]}
                  onValueChange={([value]) =>
                    setOptions((prev) => ({ ...prev, pixelSize: value ?? 2 }))
                  }
                  className="rounded-sm border-2 border-black [&_[role=slider]]:cursor-pointer [&_[role=slider]]:border-2 [&_[role=slider]]:border-black [&_[role=slider]]:bg-green-400"
                />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-center space-x-4">
        <Button
          onClick={triggerFileInput}
          className="flex items-center gap-2 rounded-none border-2 border-black bg-green-400 text-black hover:bg-green-500"
        >
          <Upload size={16} />
          upload image
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          accept="image/*"
          className="hidden"
        />
        {image && isCropping && (
          <Button
            onClick={handleFinishCropping}
            disabled={!completedCrop}
            className="flex items-center gap-2 rounded-none border-2 border-black bg-green-400 text-black hover:bg-green-500"
          >
            <Crop size={16} />
            Finish Cropping
          </Button>
        )}
        {previewImage && (
          <Button
            onClick={handleEnhance}
            className="flex items-center gap-2 rounded-none border-2 border-black bg-green-400 text-black hover:bg-green-500"
          >
            <CheckIcon />
            looks good
          </Button>
        )}
      </div>
    </div>
  );
}
