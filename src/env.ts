export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}. Copy .env.example to .env.`);
  return value;
}

export function requireNumberEnv(name: string): number {
  const value = Number(requireEnv(name));
  if (Number.isNaN(value)) throw new Error(`Env var ${name} must be a number.`);
  return value;
}
