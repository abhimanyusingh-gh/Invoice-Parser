export class GmailMailboxNeedsReauthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailMailboxNeedsReauthError";
  }
}
