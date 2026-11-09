export const PASSWORD_REQUIREMENTS = 'Use 8–128 characters with at least one uppercase letter, one lowercase letter, one number, and one symbol (such as !, @, or #).';

export function validateLogin(email: string, password: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) throw new Error('Enter a valid email address.');
  if (!password.length || password.length > 128) throw new Error('Enter your password (up to 128 characters).');
}
export function validateAccount(email: string, password: string, displayName?: string): void {
  validateLogin(email, password);
  // Match Supabase's ASCII letter, digit and punctuation requirements.
  if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password)
    || !/[0-9]/.test(password) || !/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(password)) {
    throw new Error(PASSWORD_REQUIREMENTS);
  }
  if (displayName !== undefined && !/^[A-Za-z0-9 _-]{2,24}$/.test(displayName.trim())) throw new Error('Display name must be 2–24 letters, numbers, spaces, underscores or hyphens.');
}
export function validateDisplayName(name: string): string {
  if (!/^[A-Za-z0-9 _-]{2,24}$/.test(name.trim())) throw new Error('Display name must be 2–24 letters, numbers, spaces, underscores or hyphens.');
  return name.trim();
}
