"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { UpdateProfileSchema } from "@laundryroom/db/schema";
import { Button } from "@laundryroom/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "@laundryroom/ui/form";
import { ImageUpload } from "@laundryroom/ui/image-upload";
import { Input } from "@laundryroom/ui/input";
import { Switch } from "@laundryroom/ui/switch";
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";
import { DeleteProfile } from "./profile/delete-profile";

interface Props {
  onSave?: () => void;
}

export function EditProfileForm(props: Props) {
  const utils = api.useUtils();
  const [image, setImage] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Mutation to update the user's profile
  const updateProfile = api.auth.updateProfile.useMutation({
    async onSuccess(_data) {
      // form.reset();
      await utils.auth.invalidate(); // Invalidate user cache
      toast.success("Profile updated successfully");
      if (props.onSave) {
        props.onSave();
      }
    },
  });

  // Query to fetch the current user's data
  const profileQuery = api.auth.getProfile.useQuery();

  // Add setFlag mutation
  const setFlag = api.auth.setFlag.useMutation({
    onSuccess: async () => {
      await utils.auth.invalidate();
    },
  });

  // Initialize the form with default values from the user's data
  const form = useForm({
    schema: UpdateProfileSchema,
    defaultValues: {
      name: profileQuery.data?.name ?? "",
      image: profileQuery.data?.image ?? "",
      bio: profileQuery.data?.bio ?? "",
      pronouns: profileQuery.data?.pronouns ?? "",
      links: profileQuery.data?.links ?? [],
    },
  });

  // Update form values when the user's data changes
  useEffect(() => {
    if (profileQuery.data) {
      form.reset(profileQuery.data);
      setImage(profileQuery.data.image);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => {
          updateProfile.mutate(data);
        })}
        className="min-w-[440px]"
      >
        <fieldset
          className="flex flex-col gap-4 rounded p-4 text-black"
          disabled={updateProfile.isPending || profileQuery.isPending}
        >
          {updateProfile.error && <div>{updateProfile.error.message}</div>}
          <ImageUpload
            ratio="1/1"
            imageUrl={image ?? undefined}
            onChange={(image) => {
              form.setValue("image", image);
              setImage(image);
            }}
          />
          <Button
            type="button"
            variant={"ghost"}
            disabled={!image}
            onClick={(e) => {
              e.preventDefault();
              form.setValue("image", null);
              setImage(null);
            }}
          >
            remove image
          </Button>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Your name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bio</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    placeholder="tell us about yourself"
                    rows={4}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pronouns"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pronouns</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="your pronouns"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="links"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Links</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value?.join("\n") ?? ""}
                    onChange={(e) => {
                      const links = e.target.value.split("\n");
                      field.onChange(links);
                    }}
                    placeholder="one link per line"
                    rows={4}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={updateProfile.isPending}
            title={
              !form.formState.isValid
                ? "Please fill out all fields correctly"
                : ""
            }
          >
            save
          </Button>

          <div className="mt-4 pt-4">
            <Button
              type="button"
              variant="ghost"
              className="flex w-full items-center justify-between text-gray-500"
              onClick={() => setShowOptions(!showOptions)}
            >
              <span>Advanced Options</span>
              {showOptions ? <ChevronUp /> : <ChevronDown />}
            </Button>

            {showOptions && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">NSFW Mode</h3>
                    <p className="text-sm text-gray-500">
                      Enable NSFW content in your feed
                    </p>
                  </div>
                  <Switch
                    checked={
                      profileQuery.data?.flags?.includes("nsfw") ?? false
                    }
                    onCheckedChange={(checked: boolean) => {
                      setFlag.mutate({ flag: "nsfw", enabled: checked });
                    }}
                    disabled={setFlag.isPending}
                  />
                </div>

                <div className="min-h-80">
                  <DeleteProfile />
                </div>
              </div>
            )}
          </div>
        </fieldset>
      </form>
    </Form>
  );
}
