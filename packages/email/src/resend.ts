import { Resend } from "resend";

import { emailTemplates } from "./email-templates";
import { env } from "./env";

const resend = new Resend(env.RESEND_KEY);
type Attachments = Parameters<typeof resend.emails.send>[0]["attachments"];

export async function sendEmail<K extends keyof typeof emailTemplates>(
  to: string,
  template: K,
  params: Parameters<(typeof emailTemplates)[K]>[0],
  attachments?: Attachments,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const renderedTemplate = emailTemplates[template](params as any);
  await resend.emails.send({
    to,
    from: "events@laundryroom.social",
    subject: renderedTemplate.subject,
    text: renderedTemplate.body,
    attachments,
  });
}
