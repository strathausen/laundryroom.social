import { Resend } from "resend";

import { env } from "./env";

const resend = new Resend(env.RESEND_KEY);

const templates = {
  newEvent({
    isNew,
    group,
    meetup,
  }: {
    isNew: boolean;
    meetup: {
      id: string;
      title: string;
      description?: string;
      startTime: Date;
      location?: string;
    };
    group: {
      id: string;
      name: string;
    };
  }) {
    return {
      subject: `New Meetup ${meetup.title} in ${group.name}`,
      body: `Dear human,

An event has been ${isNew ? "upd" : "cre"}ated in your group "${group.name}" on https://www.laundromat.social/groups/${group.id}

Title: ${meetup.title}
${meetup.description ? `Description: ${meetup.description}` : ""}

Have a great rest of your day!`,
    };
  },
};

export async function sendEmail<K extends keyof typeof templates>(
  to: string,
  template: K,
  params: Parameters<(typeof templates)[K]>[0],
): Promise<void> {
  const renderedTemplate = templates[template](params);
  await resend.emails.send({
    to,
    from: "events@laundryroom.social",
    subject: renderedTemplate.subject,
    text: renderedTemplate.body,
  });
}
