interface GroupInput {
  group: {
    id: string;
    name: string;
  };
}
interface UserInput {
  user: {
    id: string;
    name: string | null;
  };
}
interface MemberInput {
  member: {
    id: string;
    name?: string | null;
  };
}
interface DiscussionInput {
  discussion: {
    id: string;
    title: string;
    content: string;
  };
}
interface MeetupInput {
  meetup: {
    id: string;
    title: string;
    description?: string;
    startTime: Date;
    location?: string;
  };
}

/**
 * What a template renders to. `from` is optional: sendEmail falls back to the
 * shared events sender when a template does not name its own.
 */
export interface RenderedEmail {
  subject: string;
  body: string;
  from?: string;
}

export const emailTemplates = {
  // sign-in link. confirmUrl is the interstitial page in the app that asks
  // for a click before the token is consumed (packages/auth builds it), so a
  // link scanner fetching this url does not sign anyone in
  magicLink({ confirmUrl }: { confirmUrl: string }): RenderedEmail {
    return {
      // its own sender, like the auth.js sign-in mail had: recipients (and
      // their filters) should not confuse a login link with meetup updates
      from: "laundryroom sign-in <noreply@laundryroom.social>",
      subject: "your laundryroom sign-in link",
      body: `hi there,

someone (hopefully you) asked to sign in to laundryroom.social with this email address. open the link below and press the button on that page to finish signing in:

${confirmUrl}

the link is valid for 15 minutes and works once. if you did not request it, just ignore this email, nothing happens without that click.

see you in the laundryroom!`,
    };
  },

  eventUpdate({
    isNew,
    group,
    meetup,
  }: {
    isNew: boolean;
  } & GroupInput &
    MeetupInput) {
    return {
      subject: `${isNew ? "📅 New Meetup:" : "📆 Meetup changed:"} ${meetup.title} in ${group.name}`,
      body: `Dear human,

A meetup has been ${isNew ? "cre" : "upd"}ated in your group "${group.name}" on https://www.laundryroom.social/meetup/${meetup.id}


${meetup.title}

${meetup.description ? `Description:\n    ${meetup.description}` : ""}

Have a great rest of your day!

`,
    };
  },

  newDiscussion({ group, discussion }: DiscussionInput & GroupInput) {
    return {
      subject: `New Discussion: ${discussion.title} in ${group.name}`,
      body: `Dear human,

A discussion has been created in your group "${group.name}" on https://www.laundryroom.social/group/${group.id}/discussions

Title: ${discussion.title}
Content: ${discussion.content}

check it out and join the conversation!`,
    };
  },

  newComment({
    discussion,
    comment,
    user,
    groupId,
  }: {
    comment: {
      content: string;
    };
    groupId: string;
  } & UserInput &
    DiscussionInput) {
    return {
      subject: `New Comment on: ${discussion.title}`,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      body: `Dear ${user.name || "human"},

A new comment has been posted on the discussion "${discussion.title}" on https://www.laundryroom.social/group/${groupId}/discussions

Content: ${comment.content}

check it out!`,
    };
  },

  newMember({ group, user, member }: UserInput & GroupInput & MemberInput) {
    return {
      subject: `New Member: ${member.name} joined ${group.name}`,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      body: `Dear ${user.name || "human"},

${member.name} has joined your group "${group.name}" on https://www.laundryroom.social/group/${group.id}/members

Say hi and welcome them to the group!`,
    };
  },

  promotionStatusChange({
    group,
    user,
    status,
    message,
  }: {
    status: "not_interested" | "pending";
    message: string;
  } & GroupInput & { user: UserInput["user"] & { email: string } }) {
    return {
      subject: `Promotion status changed: ${group.name}`,
      body: `Dear platform owner,
      
The user ${user.name} (${user.email}) has requested promotion for the group "${group.name}" on https://www.laundryroom.social/group/${group.id}/meetups

Status: ${status}
Message: ${message}

Have a great rest of your day!`,
    };
  },

  // TODO this is unused, decide if we should send calendar invites on meetup creation or rsvp
  welcomeToMeetup({ group, meetup }: GroupInput & MeetupInput) {
    return {
      subject: `[${group.name}] meetup invitation ${meetup.title}`,
      body: `Dear human of group ${group.name},

Welcome to the the meetup "${meetup.title}" in your group on https://www.laundryroom.social/meetup/${meetup.id}

Have a great rest of your day!`,
    };
  },
};
