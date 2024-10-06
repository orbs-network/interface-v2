import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MIN_FILL_DELAY_MINUTES,
  MAX_FILL_DELAY_FORMATTED,
  MIN_DURATION_MINUTES,
  groupOrdersByStatus,
  zeroAddress,
  constructSDK
} from '@orbs-network/twap-sdk';
import { ChainId, Currency, currencyEquals, ETHER } from '@uniswap/sdk';
import { useActiveWeb3React } from 'hooks';
import { useCallback, useMemo } from 'react';
import { useTwapContext } from './context';
import { V3Currency } from 'v3lib/entities/v3Currency';
import { useApproval } from '../hooks';
import { useCurrency } from 'hooks/Tokens';
import { useTranslation } from 'react-i18next';
import { SwapSide } from '@paraswap/sdk';
import { GlobalValue, paraswapTaxBuy, paraswapTaxSell } from 'constants/index';
import { getBestTradeCurrencyAddress, useParaswap } from '../../../../hooks/useParaswap';
import { tryParseAmount } from 'state/swap/hooks';
import { Field } from '../../../../state/swap/actions';


export const useOptimalRateQuery = (
  currencies: { [field in Field]?: Currency },
  maxImpactAllowed: number,
) => {
  const paraswap = useParaswap();
  const { chainId, account } = useActiveWeb3React();
  const chainIdToUse = chainId || ChainId.MATIC;
  const inputCurrency = currencies[Field.INPUT];
  const outputCurrency = currencies[Field.OUTPUT];

  // we always use 1 as the amount for the market price
  const srcAmount = tryParseAmount(
    chainIdToUse,
    '1',
    inputCurrency,
  )?.raw.toString();

  const srcToken = inputCurrency
    ? getBestTradeCurrencyAddress(inputCurrency, chainIdToUse)
    : undefined;
  const destToken = outputCurrency
    ? getBestTradeCurrencyAddress(outputCurrency, chainIdToUse)
    : undefined;

  return useQuery({
    queryKey: [
      'fetchTwapOptimalRate',
      srcToken,
      destToken,
      srcAmount,
      account,
      chainId,
      maxImpactAllowed,
    ],
    queryFn: async () => {
      if (!srcToken || !destToken || !srcAmount || !account)
        return { error: undefined, rate: undefined };
      try {
        const rate = await paraswap.getRate({
          srcToken,
          destToken,
          srcDecimals: inputCurrency?.decimals,
          destDecimals: outputCurrency?.decimals,
          amount: srcAmount,
          side: SwapSide.SELL,
          options: {
            includeDEXS: 'quickswap,quickswapv3,quickswapv3.1,quickperps',
            maxImpact: maxImpactAllowed,
            partner: 'quickswapv3',
            //@ts-ignore
            srcTokenTransferFee: paraswapTaxSell[srcToken.toLowerCase()],
            destTokenTransferFee: paraswapTaxBuy[destToken.toLowerCase()],
          },
        });

        return { error: undefined, rate };
      } catch (err) {
        return { error: err.message, rate: undefined };
      }
    },
    refetchInterval: 5000,
    enabled: !!srcToken && !!destToken && !!account,
  });
};



export const useTwapSwapWarning = () => {
  const { t } = useTranslation();
  const {
    swapData: { warnings },
    config,
  } = useTwapContext();

  const durationWarning = useMemo(() => {
    if (warnings.minDuration) {
      return t('minExpiryWarning', { value: MIN_DURATION_MINUTES });
    }
    if (warnings.maxDuration) {
      return t('maxExpiryWarning');
    }
  }, [warnings.maxDuration, warnings.minDuration, t]);

  const tradeSizeWarning = useMemo(() => {
    if (warnings.tradeSize) {
      return t('tradeSizeWarning', { usd: config.minChunkSizeUsd });
    }
  }, [warnings.tradeSize, config.minChunkSizeUsd, t]);

  const fillDelayWarning = useMemo(() => {
    if (warnings.minFillDelay) {
      return t('minFillDelayWarning', { value: MIN_FILL_DELAY_MINUTES });
    }
    if (warnings.maxFillDelay) {
      return t('maxFillDelayWarning', { value: MAX_FILL_DELAY_FORMATTED });
    }
  }, [warnings.minFillDelay, warnings.maxFillDelay, t]);

  return tradeSizeWarning || fillDelayWarning || durationWarning;
};

export const isNativeCurrency = (currency?: Currency, chainId?: ChainId) => {
  if (!currency || !chainId) return false;
  const nativeCurrency = ETHER[chainId];
  return (
    currencyEquals(currency, nativeCurrency) ||
    (currency as V3Currency).isNative
  );
};

export const useTwapApprovalCallback = () => {
  const { parsedAmount, config, currencies } = useTwapContext();

  return useApproval(
    config.twapAddress,
    currencies.INPUT,
    parsedAmount?.raw.toString(),
  );
};

export const useTwapOrdersQuery = () => {
  const { account } = useActiveWeb3React();
  const { config } = useTwapContext();
  const queryClient = useQueryClient();
  const queryKey = ['useTwapOrders', account, config.chainId];
  const query = useQuery(
    queryKey,
    async ({ signal }) => {
      if (!account) return null;
      return getOrders(config, account!, signal);
    },
    {
      enabled: !!account,
    },
  );
  const fetchUpdatedOrders = useCallback(
    async (id?: number) => {
      if (!id) {
        query.refetch();
      } else {
        try {
          const orders = await waitForUpdatedOrders(config, id, account!);
          if (orders) {
            queryClient.setQueryData(queryKey, orders);
            return orders;
          }
        } catch (error) {
          console.error(error);
          return query.data;
        }
      }
    },
    [queryClient, queryKey, account, config, query.data],
  );

  return useMemo(() => {
    return {
      ...query,
      fetchUpdatedOrders,
    };
  }, [query, fetchUpdatedOrders]);
};

export const useGrouppedTwapOrders = () => {
  const orders = useTwapOrdersQuery();

  return useMemo(() => {
    if (!orders.data) return;
    return groupOrdersByStatus(orders.data);
  }, [orders.data]);
};

export const useTwapOrderCurrency = (address?: string) => {
  const _address = address?.toLowerCase() === zeroAddress ? 'ETH' : address;
  const currency = useCurrency(_address);
  return currency || undefined;
};
