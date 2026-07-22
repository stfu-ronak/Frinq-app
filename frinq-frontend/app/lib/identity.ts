export interface FrinqIdentity {
  name?: string;
  phone?: string;
}

export function getIdentity(): FrinqIdentity {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("frinq_identity") ?? "{}") as FrinqIdentity;
  } catch {
    return {};
  }
}

export function setIdentityField(key: keyof FrinqIdentity, value: string): void {
  if (typeof window === "undefined") return;
  const current = getIdentity();
  current[key] = value;
  localStorage.setItem("frinq_identity", JSON.stringify(current));
}
