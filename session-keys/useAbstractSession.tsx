import { useAccount } from 'wagmi';
import { useCreateSession } from '@abstract-foundation/agw-react';
import { toFunctionSelector } from 'viem';
import { LimitType, SessionConfig } from '@abstract-foundation/agw-client/sessions';
import { parseEther } from 'viem';
import { useMutation } from '@tanstack/react-query';
import superjson from 'superjson';
import { toast } from 'sonner';
import { getAccessToken } from '@privy-io/react-auth';

export const sessionPolicy: SessionConfig = {
  signer: process.env.NEXT_PUBLIC_SERVER_WALLET_ADDRESS as `0x${string}`, // Pass the server wallet address as the signer
  expiresAt: BigInt(0), // never expires
  feeLimit: {
    limitType: LimitType.Lifetime,
    limit: parseEther('1'), // 1 ETH lifetime gas limit
    period: BigInt(0),
  },
  callPolicies: [
    {
      target: process.env.NEXT_PUBLIC_ABSTRACT_CONTRACT_ADDRESS as `0x${string}`, // Example NFT Contract
      selector: toFunctionSelector('createGame(string,bytes32,string,uint8[],uint256,bytes)'), // Allowed function (createGame)
      valueLimit: {
        limitType: LimitType.Unlimited,
        limit: BigInt(0),
        period: BigInt(0),
      },
      maxValuePerUse: BigInt(0),
      constraints: [],
    },
  ],
  transferPolicies: [],
};

export const useAbstractSession = () => {
  const { address } = useAccount();
  const { createSessionAsync, isError, error: sessionError } = useCreateSession();

  const { mutate: createSession, isPending: isCreatingSession } = useMutation({
    mutationKey: ['createSession'],
    mutationFn: async () => {
      // --- renew access token if expired
      await getAccessToken();

      // --- create abstract session
      const result = await createSessionAsync({ session: sessionPolicy });
      if (isError) {
        throw sessionError;
      }
      if (!result.session) {
        throw new Error('Failed to create session');
      }

      // --- update user
      const resp = await fetch('/api/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: superjson.stringify({ sessionConfig: result.session }),
        credentials: 'include',
      });
      if (!resp.ok) {
        throw new Error('Failed to update user');
      }
      return resp.json();
    },
    onSuccess: () => {
      toast.success('Session created');
    },
    onError: (error) => {
      toast.error('Failed to create session');
      console.error('Error creating session', error);
    },
  });

  const handleCreateSession = async () => {
    if (isCreatingSession || !address) {
      return;
    }
    return createSession();
  };

  return {
    handleCreateSession,
  };
};
