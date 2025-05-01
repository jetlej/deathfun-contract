import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { createViemAccount } from '@privy-io/server-auth/viem';
import { Chain, parseAbi, type Address } from 'viem';
import { createSessionClient, SessionConfig } from '@abstract-foundation/agw-client/sessions';
import { verifyToken } from '@/lib/server/auth';
import { supabaseServerClient } from '@/lib/server/supabase/server-client';
import { z } from 'zod';
import superjson from 'superjson';
import { abstractClientConfig } from '@/lib/utils/abstract/config';

// --- Clients
const privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);

// --- Input Validation
const submitTxSchema = z.object({
  betAmount: z.bigint(),
  rowConfig: z.array(z.number()), // Expecting a string representation, e.g., "[5,5,5]"
});

// --- Types
type SubmitTxBody = z.infer<typeof submitTxSchema>;
type SubmitTxResponse = {
  hash: string;
  error?: string;
};

// --- POST
export async function POST(
  request: Request
): Promise<NextResponse<SubmitTxResponse | { error: string }>> {
  try {
    // --- verify token
    const { walletAddress, error } = await verifyToken();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // --- parse body
    const rawBody = await request.text();
    const parsedBody = superjson.parse<SubmitTxBody>(rawBody);
    const body = submitTxSchema.safeParse(parsedBody);
    if (!body.success) {
      return NextResponse.json({ error: body.error.message }, { status: 400 });
    }
    const { betAmount, rowConfig } = body.data;

    // --- get session config
    const { data: user, error: userError } = await supabaseServerClient
      .from('users')
      .select('session_config')
      .eq('wallet_address', walletAddress)
      .single();
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 401 });
    }
    const sessionConfig = user?.session_config;
    if (!sessionConfig) {
      return NextResponse.json({ error: 'No session config found' }, { status: 401 });
    }
    const sessionConfigParsed = superjson.parse<SessionConfig>(sessionConfig as string);

    // --- get current active game
    const { data: currentGame, error: currentGameError } = await supabaseServerClient
      .from('games')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('status', 'active')
      .single();
    if (currentGameError) {
      return NextResponse.json({ error: currentGameError.message }, { status: 401 });
    }
    const currentGameId = currentGame?.id;

    // --- create viem account instance for the server wallet
    const account = await createViemAccount({
      walletId: process.env.PRIVY_SERVER_WALLET_ID!,
      address: process.env.PRIVY_SERVER_WALLET_ADDRESS as Address,
      // @ts-ignore
      privy: privy,
    });

    // --- initialize AGW Session client to send transactions from the server wallet using the session key
    const agwSessionClient = createSessionClient({
      account: walletAddress as `0x${string}`,
      chain: abstractClientConfig.chain,
      signer: account,
      session: sessionConfigParsed,
    });

    // --- use the session client to make transactions. e.g. mint NFT the AGW wallet address
    const hash = await agwSessionClient.writeContract({
      // @ts-ignore
      value: betAmount,
      account: walletAddress as `0x${string}`,
      chain: abstractClientConfig.chain,
      address: process.env.NEXT_PUBLIC_ABSTRACT_CONTRACT_ADDRESS as `0x${string}`,
      abi: parseAbi(['function createGame(string,bytes32,string,uint8[],uint256,bytes)']),
      functionName: 'createGame',
      args: [
        currentGameId,
        currentGame?.commitment_hash as `0x${string}`,
        'v1',
        rowConfig,
        // @ts-ignore
        currentGame?.deadline,
        // @ts-ignore
        currentGame?.server_signature,
      ],
    });

    return NextResponse.json({
      hash,
    });
  } catch (error) {
    console.error('Error submitting transaction:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
