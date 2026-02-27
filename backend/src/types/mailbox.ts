export const MailboxProviders = ["gmail"] as const;
export type MailboxProvider = (typeof MailboxProviders)[number];

export const MailboxConnectionStates = ["CONNECTED", "NEEDS_REAUTH"] as const;
export type MailboxConnectionState = (typeof MailboxConnectionStates)[number];
