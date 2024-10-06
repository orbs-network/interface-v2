import { useMutation } from '@tanstack/react-query';
import { useAppDispatch } from 'state';
import { updateUserBalance } from 'state/balance/actions';
import {
  TwapAbi,
  zeroAddress,
} from '@orbs-network/twap-sdk';
import { useCallback, useMemo, useRef } from 'react';
import { useTwapApprovalCallback, useTwapOrdersQuery } from '../hooks';
import { wrappedCurrency } from 'utils/wrappedCurrency';
import { useActiveWeb3React } from 'hooks';
import { useContract } from 'hooks/useContract';
import { calculateGasMargin } from 'utils';
import { useTwapConfirmationContext } from './context';
import { WETH } from '@uniswap/sdk';
import { Steps } from 'components/Swap/orbs/types';
import { useIsNativeCurrencyCallback } from '../../hooks';
import { useTwapContext } from '../context';
import { SwapStatus } from '@orbs-network/swap-ui';
import useWrapCallback from '../../hooks/useWrapCallback';
import { isRejectedError } from '../../utils';
import { BigNumber } from 'ethers';
import { useTwapSwapActionHandlers } from 'state/swap/twap/hooks';

const useGetStepsCallback = () => {
  const { currencies, swapData } = useTwapContext();
  const isNativeIn = useIsNativeCurrencyCallback();
  const { isApproved } = useTwapApprovalCallback();

  return useCallback(() => {
    const steps: Steps[] = [];

    if (isNativeIn(currencies.INPUT)) {
      steps.push(Steps.WRAP);
    }
    if (!isApproved) {
      steps.push(Steps.APPROVE);
    }
    steps.push(Steps.SWAP);
    return steps;
  }, [currencies, isApproved, isNativeIn]);
};

const useWrapFlowCallback = () => {
  const { currencies, parsedAmount, twapSDK} = useTwapContext();
  const { chainId } = useActiveWeb3React();
  const { execute: wrap } = useWrapCallback(
    currencies.INPUT,
    WETH[chainId],
    parsedAmount?.toExact(),
  );

  return useCallback(async () => {
    try {
      twapSDK.  onWrapRequest();
      await wrap?.();
      onWrapSuccess();
    } catch (error) {
      onWrapError(error);
      throw error;
    }
  }, [wrap]);
};

const useApprovalFlowCallback = () => {
  const { approve } = useTwapApprovalCallback();

  return useCallback(async () => {
    try {
      onApproveRequest();
      await approve();
      onApproveSuccess();
    } catch (error) {
      onApproveError(error);
      throw error;
    }
  }, [approve]);
};

const useCreateOrderFlowCallback = () => {
  const { config } = useTwapContext();
  const onSuccess = useOnCreateOrderSuccess();
  const tokenContract = useContract(config.twapAddress, TwapAbi);

  return useCallback(
    async (askParams: ReturnType<typeof getAskParams>) => {
      onCreateOrderRequest();
      if (!tokenContract) {
        throw new Error('Missing tokenContract');
      }

      try {
        const gasEstimate = await tokenContract.estimateGas.ask(askParams);

        // Step 2: Send the transaction with calculated gas limit
        const txResponse = await tokenContract.functions.ask(askParams, {
          gasLimit: calculateGasMargin(gasEstimate), // Adjust gas limit with margin
        });

        console.log('Transaction sent:', txResponse);

        // Step 3: Wait for the transaction to be mined
        const txReceipt = await txResponse.wait();
        try {
          const id = BigNumber.from(txReceipt.events[0].args[0]).toNumber();
          onCreateOrderSuccess(txReceipt.transactionHash, id);
          onSuccess(id);
        } catch (error) {
          console.log({ error });
        }
        return txReceipt; // Return the receipt of the mined transaction
      } catch (error) {
        onCreateOrderError(error);
        throw error;
      }
    },
    [tokenContract],
  );
};

const useOnCreateOrderSuccess = () => {
  const { fetchUpdatedOrders } = useTwapOrdersQuery();
  const { onUpdatingOrders } = useTwapSwapActionHandlers();

  return useCallback(
    async (id?: number) => {
      onUpdatingOrders(true);
      await fetchUpdatedOrders(id);
      onUpdatingOrders(false);
    },
    [fetchUpdatedOrders, onUpdatingOrders],
  );
};

export const useCreateOrderCallback = () => {
  const { config, parsedAmount, currencies, swapData } = useTwapContext();
  const { chainId, account } = useActiveWeb3React();
  const dispatch = useAppDispatch();
  const inCurrency = currencies?.INPUT;
  const outCurrency = currencies?.OUTPUT;
  const isNative = useIsNativeCurrencyCallback();
  const { updateStore } = useTwapConfirmationContext();
  const getSteps = useGetStepsCallback();
  const shouldUnwrap = useRef(false);
  const approvalCallback = useApprovalFlowCallback();
  const wrapCallback = useWrapFlowCallback();
  const createOrderCallback = useCreateOrderFlowCallback();

  return useMutation(
    async () => {
      const srcToken = wrappedCurrency(inCurrency, chainId);
      const dstToken = wrappedCurrency(outCurrency, chainId);

      if (!parsedAmount || !srcToken || !dstToken) {
        throw new Error('Missing args');
      }
      const askParams = getAskParams({
        config,
        fillDelay: swapData.fillDelay,
        deadline: swapData.deadline,
        srcAmount: parsedAmount?.raw.toString(),
        dstTokenMinAmount: swapData.dstTokenMinAmount,
        srcChunkAmount: swapData.srcChunkAmount,
        srcTokenAddress: srcToken.address,
        dstTokenAddress: isNative(outCurrency) ? zeroAddress : dstToken.address,
      });

      onSubmitOrder(config, askParams, account);
      const steps = getSteps();
      updateStore({ steps, swapStatus: SwapStatus.LOADING });
      if (steps.includes(Steps.WRAP)) {
        updateStore({ currentStep: Steps.WRAP });
        await wrapCallback();
        shouldUnwrap.current = true;
        updateStore({ shouldUnwrap: true });
      }

      if (steps.includes(Steps.APPROVE)) {
        updateStore({ currentStep: Steps.APPROVE });
        await approvalCallback();
      }
      updateStore({ currentStep: Steps.SWAP });

      const result = await createOrderCallback(askParams);
    },
    {
      onSuccess: () => {
        updateStore({
          swapStatus: SwapStatus.SUCCESS,
        });
        dispatch(updateUserBalance());
      },
      onError: (error) => {
        if (isRejectedError(error) && !shouldUnwrap.current) {
          updateStore({
            swapStatus: undefined,
          });
        } else {
          updateStore({
            shouldUnwrap: shouldUnwrap.current,
            swapStatus: SwapStatus.FAILED,
            error: (error as Error).message,
          });
        }
      },
      onSettled: () => {
        shouldUnwrap.current = false;
      },
    },
  );
};
