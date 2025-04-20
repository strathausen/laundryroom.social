"use client";

import { useEffect, useState } from "react";

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
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

interface Props {
  onSave?: () => void;
}

export function EditProfileForm(props: Props) {
  const utils = api.useUtils();
  const [image, setImage] = useState<string | null>(null);

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
                      const links = e.target.value
                        .split("\n")
                        .map((link) => link.trim())
                        .filter((link) => link.length > 0);
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
        </fieldset>
      </form>
    </Form>
  );
}
