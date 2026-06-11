export const projectMetadata = {
  name: "ARCANA GRID",
  description: "Online Tactical Card Battle",
} as const;

export function formatProjectTitle(name: string): string {
  return name.trim().toUpperCase();
}
