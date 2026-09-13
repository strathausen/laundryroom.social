import { Resend } from "resend";

import type { RenderedEmail } from "./email-templates";
import { emailTemplates } from "./email-templates";
import { env } from "./env";

// Created on first use rather than at import time: the resend sdk throws when
// the api key is undefined, and `next build` evaluates every route module that
// (transitively) imports this package while it collects page data, where no
// key exists (the docker image is built with SKIP_ENV_VALIDATION=1).
let resend: Resend | undefined;
const getResend = () => (resend ??= new Resend(env.RESEND_KEY));
type Attachments = Parameters<Resend["emails"]["send"]>[0]["attachments"];

export async function sendEmail<K extends keyof typeof emailTemplates>(
  to: string,
  template: K,
  params: Parameters<(typeof emailTemplates)[K]>[0],
  attachments?: Attachments,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  const renderedTemplate: RenderedEmail = emailTemplates[template](
    params as any,
  );
  // the resend sdk reports failures (rate limits, 4xx/5xx, network errors)
  // via the result instead of throwing, so surface them to callers
  const { error } = await getResend().emails.send({
    to,
    from: renderedTemplate.from ?? "events@laundryroom.social",
    subject: renderedTemplate.subject,
    text: renderedTemplate.body,
    attachments,
  });
  if (error) {
    throw new Error(`resend ${error.name}: ${error.message}`);
  }
}
