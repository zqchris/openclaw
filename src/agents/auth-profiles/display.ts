import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveAuthProfileMetadata } from "./identity.js";
import type { AuthProfileStore } from "./types.js";

const EMAIL_RE = /([\w!#$%&'*+/=?^`{|}~.-]+)@([\w-]+(?:\.[\w-]+)+)/g;

/**
 * Mask any email addresses embedded in a free-form display string. Keeps the
 * first character of the local-part and the entire domain so the label still
 * distinguishes accounts (e.g. work vs personal Google sign-in) without
 * leaking the full address to anyone who can read /status output, hover
 * tooltips, or screenshots.
 */
function maskEmailsInText(text: string): string {
  return text.replace(
    EMAIL_RE,
    (_match, local: string, domain: string) => `${local[0] ?? ""}***@${domain}`,
  );
}

export function resolveAuthProfileDisplayLabel(params: {
  cfg?: OpenClawConfig;
  store: AuthProfileStore;
  profileId: string;
}): string {
  const { displayName, email } = resolveAuthProfileMetadata(params);
  const safeProfileId = maskEmailsInText(params.profileId);
  if (displayName) {
    return `${safeProfileId} (${maskEmailsInText(displayName)})`;
  }
  if (email) {
    return `${safeProfileId} (${maskEmailsInText(email)})`;
  }
  return safeProfileId;
}
