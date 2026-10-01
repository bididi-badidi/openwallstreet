const cookieName = "ow_reception";
export async function hmac(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function hashCode(code: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function receptionSession(request: Request, secret: string) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (raw && /^[a-f0-9-]{36}\.\d{10}\.[a-f0-9]{64}$/.test(raw)) {
    const [id, expires, signature] = raw.split(".");
    const expected = await hmac(secret, `session:${id}.${expires}`);
    const { secureCompare } = await import("./job-service");
    if (
      Number(expires) > Date.now() / 1000 &&
      (await secureCompare(signature, expected))
    )
      return { id, cookie: undefined };
  }
  const id = crypto.randomUUID(),
    expires = Math.floor(Date.now() / 1000) + 86400;
  const signature = await hmac(secret, `session:${id}.${expires}`);
  return {
    id,
    cookie: `${cookieName}=${id}.${expires}.${signature}; Path=/; HttpOnly; SameSite=Strict${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
  };
}
