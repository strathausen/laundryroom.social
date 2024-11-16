"use client";

import { useEffect } from "react";
import { CalendarIcon } from "lucide-react";

import { UpsertMeetupSchema } from "@laundryroom/db/schema";
import { Button } from "@laundryroom/ui/button";
import { Calendar } from "@laundryroom/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "@laundryroom/ui/form";
import { Input } from "@laundryroom/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@laundryroom/ui/popover";
import { ScrollArea, ScrollBar } from "@laundryroom/ui/scroll-area";
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

interface Props {
  eventId?: string;
  groupId: string;
  onSaved?: () => void;
}

export function UpsertMeetupForm(props: Props) {
  const utils = api.useUtils();
  const upsertMeetup = api.meetup.upsert.useMutation({
    async onSuccess(_data) {
      form.reset();
      await utils.meetup.invalidate();
      // if ("id" in data) router.push(`/events?highlight=${data.id}`);
      toast.success("Event saved");
      props.onSaved?.();
    },
  });
  const meetupQuery = api.meetup.byId.useQuery(
    { id: props.eventId ?? "" },
    { enabled: !!props.eventId },
  );
  const form = useForm({
    schema: UpsertMeetupSchema,
    defaultValues: {
      id: props.eventId,
      groupId: props.groupId,
      title: meetupQuery.data?.title ?? "",
      description: meetupQuery.data?.description ?? "",
      location: meetupQuery.data?.location ?? "",
      // default to tomorrow at 6pm
      startTime:
        meetupQuery.data?.startTime ??
        new Date(new Date().setHours(18, 0, 0, 0) + 24 * 60 * 60 * 1000),
    },
  });

  function handleDateSelect(date: Date | undefined) {
    if (date) {
      form.setValue("startTime", date);
    }
  }

  function handleTimeChange(type: "hour" | "minute" | "ampm", value: string) {
    const currentDate = form.getValues("startTime");
    const newDate = new Date(currentDate);

    switch (type) {
      case "hour": {
        const hour = parseInt(value, 10);
        newDate.setHours(newDate.getHours() >= 12 ? hour + 12 : hour);
        break;
      }
      case "minute":
        newDate.setMinutes(parseInt(value, 10));
        break;
      case "ampm": {
        const hours = newDate.getHours();
        if (value === "AM" && hours >= 12) {
          newDate.setHours(hours - 12);
        } else if (value === "PM" && hours < 12) {
          newDate.setHours(hours + 12);
        }
        break;
      }
    }

    form.setValue("startTime", newDate);
  }

  useEffect(() => {
    if (meetupQuery.data) {
      form.setValue("title", meetupQuery.data.title);
      form.setValue("description", meetupQuery.data.description);
      form.setValue("location", meetupQuery.data.location);
      form.setValue("startTime", meetupQuery.data.startTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetupQuery.data]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => {
          upsertMeetup.mutate(data);
        })}
      >
        <fieldset
          className="flex flex-col gap-4 rounded p-4 text-black"
          disabled={
            upsertMeetup.isPending || (!!props.eventId && meetupQuery.isPending)
          }
        >
          {/* {form.formState.errors && (
            <div>{Object.values(form.formState.errors).join(", ")}</div>
          )}
          {form.formState.isValid ? (
            <div> form is valid</div>
          ) : (
            <div> form is not valid</div>
          )} */}
          {upsertMeetup.error && <div>{upsertMeetup.error.message}</div>}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="" rows={5} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>location</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem className="my-2 flex flex-col">
                <FormLabel>date & time</FormLabel>
                <Popover modal>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="plattenbau"
                        className={
                          "w-full border-2 border-black px-2 text-left font-normal"
                        }
                      >
                        {field.value.toLocaleDateString()}
                        {/* {DateTime.format(field.value, "MM/dd/yyyy hh:mm aa")} */}
                        <CalendarIcon className="ml-auto h-4 w-4" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <div className="sm:flex">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={handleDateSelect}
                        initialFocus
                      />
                      <div className="flex flex-col divide-y sm:h-[300px] sm:flex-row sm:divide-x sm:divide-y-0">
                        <ScrollArea className="w-64 sm:w-auto">
                          <div className="flex p-2 sm:flex-col">
                            {Array.from({ length: 12 }, (_, i) => i + 1)
                              .reverse()
                              .map((hour) => (
                                <Button
                                  key={hour}
                                  size="icon"
                                  variant={
                                    field.value.getHours() % 12 === hour % 12
                                      ? "default"
                                      : "ghost"
                                  }
                                  className="aspect-square shrink-0 sm:w-full"
                                  onClick={() =>
                                    handleTimeChange("hour", hour.toString())
                                  }
                                >
                                  {hour}
                                </Button>
                              ))}
                          </div>
                          <ScrollBar
                            orientation="horizontal"
                            className="sm:hidden"
                          />
                        </ScrollArea>
                        <ScrollArea className="w-64 sm:w-auto">
                          <div className="flex p-2 sm:flex-col">
                            {Array.from({ length: 12 }, (_, i) => i * 5).map(
                              (minute) => (
                                <Button
                                  key={minute}
                                  size="icon"
                                  variant={
                                    field.value.getMinutes() === minute
                                      ? "default"
                                      : "ghost"
                                  }
                                  className="aspect-square shrink-0 sm:w-full"
                                  onClick={() =>
                                    handleTimeChange(
                                      "minute",
                                      minute.toString(),
                                    )
                                  }
                                >
                                  {minute.toString().padStart(2, "0")}
                                </Button>
                              ),
                            )}
                          </div>
                          <ScrollBar
                            orientation="horizontal"
                            className="sm:hidden"
                          />
                        </ScrollArea>
                        <ScrollArea className="">
                          <div className="flex p-2 sm:flex-col">
                            {["AM", "PM"].map((ampm) => (
                              <Button
                                key={ampm}
                                size="icon"
                                variant={
                                  (ampm === "AM" &&
                                    field.value.getHours() < 12) ||
                                  (ampm === "PM" &&
                                    field.value.getHours() >= 12)
                                    ? "default"
                                    : "ghost"
                                }
                                className="aspect-square shrink-0 sm:w-full"
                                onClick={() => handleTimeChange("ampm", ampm)}
                              >
                                {ampm}
                              </Button>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ends at</FormLabel>
                <FormControl>
                  <Input {...field} type="datetime-local" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          /> */}
          <Button
            type="submit"
            disabled={upsertMeetup.isPending}
            title={!form.formState.isValid ? "Please fill out all fields" : ""}
          >
            save
          </Button>
        </fieldset>
      </form>
    </Form>
  );
}
