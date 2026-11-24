import { createTravelHandler } from './handler.mjs';
import { createTravelRepository } from './repository.mjs';
import regionIDs from './region-ids.json' with { type: 'json' };

const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const publicKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
Deno.serve(createTravelHandler({
  repository: createTravelRepository({ url: Deno.env.get('SUPABASE_URL'),
    serviceKey: secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }),
  allowedKeys: [...Object.values(publicKeys), Deno.env.get('SUPABASE_ANON_KEY')].filter(Boolean), regionIDs
}));
