/**
 * People who sign up with an atproto account get a placeholder in
 * user.email: better-auth requires a unique address and atproto does not hand
 * one out. The domain is reserved (rfc 2606), so nothing is ever delivered
 * there, but sending to it would still cost a resend request and a bounce.
 */
export const ATPROTO_PLACEHOLDER_EMAIL_DOMAIN = "atproto.invalid";

export function isPlaceholderEmail(email: string): boolean {
  return email
    .trim()
    .toLowerCase()
    .endsWith(`@${ATPROTO_PLACEHOLDER_EMAIL_DOMAIN}`);
}

/**
 * Where mail for a user goes: the confirmed address their pds shared at the
 * last atproto sign-in (contact_email), else the address they signed in with,
 * and null when neither is deliverable (an atproto sign-up whose pds shared no
 * confirmed email). Every place that emails a user goes through this and
 * skips the send on null.
 */
export function deliverableEmail(user: {
  email: string;
  contactEmail?: string | null;
}): string | null {
  const address = user.contactEmail ?? user.email;
  if (!address || isPlaceholderEmail(address)) return null;
  return address;
}
