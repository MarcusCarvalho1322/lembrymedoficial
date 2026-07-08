type ClassValue = string | undefined | null | false | ClassValue[];

/** Merge class names, filtering falsy values */
export function cn(...inputs: ClassValue[]): string {
  const result: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string") {
      result.push(input);
    } else if (Array.isArray(input)) {
      result.push(cn(...input));
    }
  }
  return result.join(" ");
}
