export function validateLogin(email: string, password: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) throw new Error('Enter a valid email address.');
  if (!password.length || password.length > 128) throw new Error('Enter your password (up to 128 characters).');
}
export function validateAccount(email: string, password: string, displayName?: string): void {
  validateLogin(email, password);
  if (password.length < 8 || password.length > 128) throw new Error('Use a password between 8 and 128 characters.');
  if (displayName !== undefined && !/^[A-Za-z0-9 _-]{2,24}$/.test(displayName.trim())) throw new Error('Display name must be 2–24 letters, numbers, spaces, underscores or hyphens.');
}
export function validateDisplayName(name: string): string {
  if (!/^[A-Za-z0-9 _-]{2,24}$/.test(name.trim())) throw new Error('Display name must be 2–24 letters, numbers, spaces, underscores or hyphens.');
  return name.trim();
}
