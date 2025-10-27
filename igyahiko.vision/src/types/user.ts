import { combineSlug } from "@/lib/utils"


export type ConvexUserRaw = {
      _creationTime: number
      _id: string
      email: string
      emailVarificationTime?: string
      image?: string
      name?: string

}


export type Profile = {
     id: string
     createdAtMs: number
     email: string
     emailVarifiedAtMs?: number
     image?: string
     name?: string
}

export const normalizeProfile = (
  raw: ConvexUserRaw | null
): Profile | null => {
  if (!raw) return null;

  const extractNameFromEmail = (email: string): string => {
    const userName = email.split("@")[0];
    return userName
      .split(/[._-]/)
      .filter(Boolean) // ✅ avoids empty strings
      .map(
        (part) =>
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      )
      .join(" ");
  };

  // ✅ safer name logic — don't double-process `combineSlug`
  const name =
    raw.name && raw.name.trim().length > 0
      ? combineSlug(raw.name)
      : extractNameFromEmail(raw.email);

  return {
    id: raw._id,
    createdAtMs: raw._creationTime,
    email: raw.email,
    emailVarifiedAtMs: raw.emailVarificationTime
      ? new Date(raw.emailVarificationTime).getTime()
      : undefined,
    image: raw.image ?? undefined, // ✅ avoid null images
    name,
  };
};
