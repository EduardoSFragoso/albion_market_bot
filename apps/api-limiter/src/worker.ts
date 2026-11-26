interface Env {
  API_RATE_LIMITER: {
    limit(options: { key: string; delta?: number }): Promise<{ success: boolean }>;
  };
}

const IP_PATTERN = /^[0-9a-fA-F:.]+$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }

    const clientIp = request.headers.get('x-albion-client-ip')?.trim() ?? '';
    const routeClass = request.headers.get('x-albion-route-class');
    if (clientIp.length > 64 || !IP_PATTERN.test(clientIp) || (routeClass !== 'rank' && routeClass !== 'standard')) {
      return new Response(null, { status: 400 });
    }

    const { success } = await env.API_RATE_LIMITER.limit({
      key: clientIp,
      delta: routeClass === 'rank' ? 10 : 1,
    });
    return new Response(null, {
      status: success ? 204 : 429,
      headers: { 'cache-control': 'no-store' },
    });
  },
};
