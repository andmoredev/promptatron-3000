/** Best-effort JSON body parse; malformed/absent bodies resolve to an empty object. */
export const readJsonBody = async (req: Request): Promise<Record<string, unknown>> => {
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
};

/** Wraps a plain value as a 200 JSON Response -- sidesteps the resolver's strict JSONObject typing. */
export const json = (value: unknown, status = 200): Response => Response.json(value as any, { status });
