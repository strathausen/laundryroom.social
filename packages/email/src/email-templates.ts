interface GroupInput {
  group: {
    id: string;
    name: string;
  };
}
interface UserInput {
  user: {
    id: string;
    email: string;
    name?: string | null;
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

export const emailTemplates = {
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
  } & GroupInput) {
    return {
      subject: `${isNew ? "New Meetup:" : "Meetup changed:"} ${meetup.title} in ${group.name}`,
      body: `Dear human,

A meetup has been ${isNew ? "upd" : "cre"}ated in your group "${group.name}" on https://www.laundromat.social/groups/${group.id}

Title: ${meetup.title}
${meetup.description ? `Description: ${meetup.description}` : ""}

Have a great rest of your day!`,
    };
  },

  newDiscussion({ group, discussion }: DiscussionInput & GroupInput) {
    return {
      subject: `New Discussion: ${discussion.title} in ${group.name}`,
      body: `Dear human,

A discussion has been created in your group "${group.name}" on https://www.laundromat.social/groups/${group.id}

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

A new comment has been posted on the discussion "${discussion.title}" on https://www.laundromat.social/groups/${groupId}

Content: ${comment.content}

check it out!`,
    };
  },

  newMember({ group, user, member }: UserInput & GroupInput & MemberInput) {
    return {
      subject: `New Member: ${member.name} joined ${group.name}`,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      body: `Dear ${user.name || "human"},

${member.name} has joined your group "${group.name}" on https://www.laundromat.social/groups/${group.id}

Say hi and welcome them to the group!`,
    };
  },
};
