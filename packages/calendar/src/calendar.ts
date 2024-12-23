import { createEvent } from "ics";

interface Meetup {
  uuid: string;
  title: string;
  description: string;
  start: Date;
  duration: number;
  status: "CONFIRMED" | "CANCELLED"; // "TENTATIVE" |
  url: string;
  location: string;
}

function transformDate(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth() + 1, // thanks Java
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ] as [number, number, number, number, number];
}

export function createEventUpdate(meetup: Meetup) {
  return createEvent({
    uid: meetup.uuid,
    productId: "laundryroom.social@adamgibbons/ics",
    title: meetup.title,
    description: meetup.description,
    start: transformDate(meetup.start),
    startInputType: "utc",
    duration: { minutes: meetup.duration },
    status: meetup.status,
    url: meetup.url,
    location: meetup.location,

    // TODO: add more fields
    // geo
    // organizer
    // created
    // lastModified
    // classification
    // sequence
    // categories
    // htmlDescription
  });
}
