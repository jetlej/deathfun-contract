import { z } from 'zod';
import { supabaseServerClient } from '@/lib/server/supabase/server-client';
import { verifyToken } from '@/lib/server/auth';
import { APP_ID } from '@/lib/server/constants';
import camelcaseKeys from 'camelcase-keys';
import superjson from 'superjson';
import type { SessionConfig } from '@abstract-foundation/agw-client/sessions';
import { NextResponse } from 'next/server';

const userUpdateBodySchema = z.object({
  username: z.string(),
  sessionConfig: z.any(),
});

type UserUpdateBody = z.infer<typeof userUpdateBodySchema> & {
  sessionConfig?: SessionConfig;
};

export async function PATCH(request: Request) {
  try {
    const { walletAddress, error } = await verifyToken();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const rawBody = await request.text();
    const parsedBody = superjson.parse<UserUpdateBody>(rawBody);
    const body = userUpdateBodySchema.safeParse(parsedBody);
    if (!body.success) {
      return NextResponse.json({ error: body.error.message }, { status: 400 });
    }
    const { username, sessionConfig }: UserUpdateBody = body.data;

    const { data: user, error: userError } = await supabaseServerClient
      .from('users')
      .update({
        username: username,
        session_config: superjson.stringify(sessionConfig),
      })
      .eq('wallet_address', walletAddress)
      .eq('app', APP_ID)
      .single();

    if (userError) {
      if (userError.code === 'PGRST116') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      console.error('Error updating user:', userError);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    const resp = superjson.stringify(camelcaseKeys(user, { deep: true }));

    return new Response(resp, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in PATCH /api/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
