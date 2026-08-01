export async function approveDeviceAuthorization({ origin, userCode, session, fetchImpl = fetch } = {}) {
  if (typeof origin !== "string" || typeof userCode !== "string" || !session?.cookie) throw new TypeError("approval inputs are required");
  const page = await fetchImpl(`${origin}/web/device-authorization?${new URLSearchParams({ user_code: userCode })}`, {
    redirect: "manual", headers: { Cookie: session.cookie },
  });
  if (page.status !== 200) throw new Error(`authorization page failed with ${page.status}`);
  const csrfCookie = (page.headers.getSetCookie?.() ?? []).map(cookiePair).find((value) => value.startsWith("yuance_csrf="));
  const csrfToken = csrfCookie?.split("=", 2)[1] || session.csrfToken;
  const cookie = [session.cookie, csrfCookie].filter(Boolean).join("; ");
  const response = await fetchImpl(`${origin}/web/device-authorization/approve`, {
    method: "POST", redirect: "manual",
    headers: { Cookie: cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_code: userCode, _csrf: csrfToken }),
  });
  if (response.status !== 200) throw new Error(`authorization approval failed with ${response.status}`);
}

function cookiePair(value) { return value.split(";", 1)[0]; }
