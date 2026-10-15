import { handleApi } from '../_lib/api';
import type { Env } from '../_lib/security';

export const onRequest: PagesFunction<Env> = context => handleApi(context.request,context.env);
