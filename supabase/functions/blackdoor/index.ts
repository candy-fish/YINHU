import { createHandler, withAPIKey } from './handler.mjs';
import { createRepository } from './repository.mjs';

// Supabase injects server secrets. They never enter browser bundles or source.
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const publicKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
const repository = createRepository({
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
});
Deno.serve(withAPIKey(createHandler(repository), [
  ...Object.values(publicKeys), Deno.env.get('SUPABASE_ANON_KEY')
].filter(Boolean)));
