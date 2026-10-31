// Form rules shared by sign up, password reset and settings.

export const PASSWORD_HINT = "8+ characters, letters and numbers";
export const PASSWORD_ERROR = "Use at least 8 characters with letters and numbers.";

/** 8+ characters with at least one letter and one number. */
export function passwordOk(p: string): boolean {
  return p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);
}
