import {
  Config,
  Configs,
  getSwapDetails,
  TimeUnit,
} from '@orbs-network/twap-sdk';
import { OptimalRate, SwapSide } from '@paraswap/sdk';
import { useQuery } from '@tanstack/react-query';
import { ChainId, Currency, CurrencyAmount } from '@uniswap/sdk';
import {
  CurrencyAmount as CurrencyAmountV3,
  Currency as CurrencyV3,
} from '@uniswap/sdk-core';
import { GlobalValue, paraswapTaxBuy, paraswapTaxSell } from 'constants/index';
import { useActiveWeb3React } from 'hooks';
import { useCurrency } from 'hooks/Tokens';
import { useParaswap, getBestTradeCurrencyAddress } from 'hooks/useParaswap';
import useParsedQueryString from 'hooks/useParsedQueryString';
import React, { createContext, useEffect, useMemo } from 'react';
import { Field } from 'state/swap/actions';
import { tryParseAmount } from 'state/swap/hooks';
import { useTwapState, useTwapSwapActionHandlers } from 'state/swap/twap/hooks';
import { useExpertModeManager } from 'state/user/hooks';
import { useCurrencyBalances } from 'state/wallet/hooks';
import useUSDCPrice from 'utils/useUSDCPrice';
import { fromRawAmount } from '../utils';

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

interface ContextValues {
  currencies: { [field in Field]?: Currency };
  currencyBalances: { [field in Field]?: CurrencyAmount };
  parsedAmount: CurrencyAmount | undefined;
  inputError: string | undefined;
  config: Config;
  maxImpactAllowed: number;
  swapData: ReturnType<typeof getSwapDetails>;
  limitPrice?: string;
  marketPrice?: string;
  optimalRate?: OptimalRate;
  optimalRateError?: string;
  loadingOptimalRate: boolean;
  tradeDestAmount?: string;
  srcChukAmountUsd: number;
  isMarketOrder: boolean;
  isLimitPanel: boolean;
}

const Context = createContext({} as ContextValues);

interface Props {
  children: React.ReactNode;
  isLimitPanel?: boolean;
}
const config = Configs.QuickSwap;
export const TwapContextProvider = ({ children, isLimitPanel }: Props) => {
  const [isExpertMode] = useExpertModeManager();
  const { account, chainId } = useActiveWeb3React();
  const chainIdToUse = chainId ?? ChainId.MATIC;
  const parsedQuery = useParsedQueryString();
  const swapType = parsedQuery?.swapIndex;
  const { onDurationInput } = useTwapSwapActionHandlers();

  useEffect(() => {
    if (isLimitPanel) {
      onDurationInput({ unit: TimeUnit.Days, value: 7 });
    } else {
      onDurationInput(undefined);
    }
  }, [isLimitPanel]);

  const {
    typedValue,
    [Field.INPUT]: { currencyId: inputCurrencyId },
    [Field.OUTPUT]: { currencyId: outputCurrencyId },
    typedChunks,
    typedDuration,
    typedFillDelay,
    typedLimitPrice,
    isMarketOrder: _isMarketOrder,
    isLimitPriceInverted,
  } = useTwapState();
  const inputCurrency = useCurrency(inputCurrencyId);
  const outputCurrency = useCurrency(outputCurrencyId);
  const isMarketOrder = isLimitPanel ? false : typedLimitPrice === undefined;

  const relevantTokenBalances = useCurrencyBalances(account ?? undefined, [
    inputCurrency ?? undefined,
    outputCurrency ?? undefined,
  ]);

  const parsedAmount = tryParseAmount(
    chainIdToUse,
    typedValue,
    inputCurrency ?? undefined,
  );

  const currencyBalances = {
    [Field.INPUT]: relevantTokenBalances[0],
    [Field.OUTPUT]: relevantTokenBalances[1],
  };

  const currencies: { [field in Field]?: Currency } = {
    [Field.INPUT]: inputCurrency ?? undefined,
    [Field.OUTPUT]: outputCurrency ?? undefined,
  };

  const inputError = useMemo(() => {
    if (!account) {
      return 'Connect Wallet';
    }
    if (!parsedAmount) {
      return 'Enter an amount';
    }

    if (!currencies[Field.INPUT] || !currencies[Field.OUTPUT]) {
      return 'Select a token';
    }

    const balanceIn = currencyBalances[Field.INPUT];
    const amountIn = parsedAmount;

    if (
      swapType !== '0' &&
      balanceIn &&
      amountIn &&
      balanceIn.lessThan(amountIn)
    ) {
      return 'Insufficient ' + amountIn.currency.symbol + ' balance';
    }
  }, [
    account,
    parsedAmount,
    currencies,
    swapType,
    currencyBalances[Field.INPUT],
  ]);

  const maxImpactAllowed = isExpertMode
    ? 100
    : Number(
        GlobalValue.percents.BLOCKED_PRICE_IMPACT_NON_EXPERT.multiply(
          '100',
        ).toFixed(4),
      );

  const { data, isLoading: loadingOptimalRate } = useOptimalRateQuery(
    currencies,
    maxImpactAllowed,
  );
  const marketPrice = data?.rate?.destAmount;
  const limitPrice = useMemo(() => {
    let result = marketPrice;
    if (isMarketOrder) {
      return marketPrice;
    }
    if (typedLimitPrice !== undefined) {
      result = tryParseAmount(
        chainId,
        isLimitPriceInverted
          ? (1 / Number(typedLimitPrice)).toString()
          : typedLimitPrice,
        currencies.OUTPUT,
      )?.raw.toString();
    }
    return result;
  }, [
    typedLimitPrice,
    chainId,
    currencies.OUTPUT,
    marketPrice,
    isMarketOrder,
    isLimitPriceInverted,
  ]);

  const oneSrcTokenUsd = Number(
    useUSDCPrice(currencies.INPUT)?.toSignificant() ?? 0,
  );

  const swapData = getSwapDetails({
    config,
    srcAmount: parsedAmount?.raw.toString(),
    customChunks: typedChunks,
    customDuration: typedDuration,
    customFillDelay: typedFillDelay,
    limitPrice,
    isLimitPanel,
    oneSrcTokenUsd,
    srcDecimals: currencies.INPUT?.decimals,
    dstDecimals: currencies.OUTPUT?.decimals,
    isMarketOrder,
  });

  const tradeDestAmount = useMemo(() => {
    if (!limitPrice || !typedValue || !currencies.OUTPUT || !currencies.INPUT)
      return;
    const SCALE = BigInt(10 ** 18);

    const scaledParsedAmount = BigInt(
      Math.floor(Number(typedValue) * Number(SCALE)),
    );

    const result =
      BigInt(
        fromRawAmount(currencies.OUTPUT, limitPrice)?.numerator.toString() || 0,
      ) * scaledParsedAmount;
    return (result / SCALE).toString();
  }, [
    limitPrice,
    typedValue,
    currencies.OUTPUT,
    currencies.INPUT,
    parsedAmount?.toFixed(),
  ]);

  const srcChukAmountUsd = useMemo(() => {
    const srcChunkAmount = fromRawAmount(
      currencies.INPUT,
      swapData.srcChunkAmount,
    );
    return oneSrcTokenUsd * Number(srcChunkAmount?.toExact() ?? 0);
  }, [oneSrcTokenUsd, typedValue]);

  return (
    <Context.Provider
      value={{
        config,
        currencies,
        currencyBalances,
        inputError,
        maxImpactAllowed,
        parsedAmount,
        limitPrice,
        marketPrice,
        swapData,
        optimalRate: data?.rate,
        optimalRateError: data?.error,
        loadingOptimalRate,
        tradeDestAmount,
        srcChukAmountUsd,
        isMarketOrder,
        isLimitPanel: !!isLimitPanel,
      }}
    >
      {children}
    </Context.Provider>
  );
};

export const useTwapContext = () => {
  return React.useContext(Context);
};
