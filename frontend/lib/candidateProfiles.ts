export interface CandidateProfile {
  name: string;
  photo: string; // base64 data URL
}

const key = (addr: string) => `candidate_profile_${addr.toLowerCase()}`;

export function getProfile(addr: string): CandidateProfile {
  if (typeof window === "undefined") return { name: "", photo: "" };
  try {
    const d = localStorage.getItem(key(addr));
    return d ? JSON.parse(d) : { name: "", photo: "" };
  } catch {
    return { name: "", photo: "" };
  }
}

export function setProfile(addr: string, profile: CandidateProfile) {
  localStorage.setItem(key(addr), JSON.stringify(profile));
}

export function displayName(addr: string): string {
  const p = getProfile(addr);
  return p.name || `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
