import { Resend } from "resend";

import { env } from "../../../apps/nextjs/src/env";

const resend = new Resend(env.RESEND_KEY);

const templates = {
  newEvent(params: {
    eventId: string;
    eventName: string;
    groupName: string;
    groupId: string;
  }) {
    return {
      subject: `New Meetup ${params.eventName}`,
      body: `Dear human,

A new event has been created in your group "${params.groupName}" on https://www.laundromat.social/groups/${params.groupId}

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
    from: "events@tomatovillage.com",
    // from: "events@laundryroom.social",
    subject: renderedTemplate.subject,
    text: renderedTemplate.body,
  });
}
