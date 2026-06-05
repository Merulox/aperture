import type { MiddlewareHandler } from 'astro';

const USER = 'm';
const PASS = 'st';
const EXPECTED = 'Basic ' + btoa(`${USER}:${PASS}`);

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const auth = ctx.request.headers.get('authorization');
  if (auth !== EXPECTED) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="aperture"' },
    });
  }
  return next();
};
