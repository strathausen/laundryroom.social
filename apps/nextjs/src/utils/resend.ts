import { Resend } from "resend";

import { env } from "../env";

const resend = new Resend(env.RESEND_KEY);

const templates = {
  newEvent(params: { eventId: string; eventName: string }) {
    return {
      subject: `New Meetup ${params.eventName}`,
      body: `A new event has been created on www.laundromat.social in your group with the id ${params.eventId}`,
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
