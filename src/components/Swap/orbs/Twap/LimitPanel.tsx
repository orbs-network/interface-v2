import { Box } from '@material-ui/core';
import React, { useCallback, useMemo } from 'react';
import { useTwapState, useTwapSwapActionHandlers } from 'state/swap/twap/hooks';
import { Card, SelectorButton } from './components';
import NumericalInput from 'components/NumericalInput';
import { Currency } from '@uniswap/sdk';
import CurrencySelect from 'components/CurrencySelect';
import { useActiveWeb3React, useIsProMode } from 'hooks';
import useSwapRedirects from 'hooks/useSwapRedirect';
import { fromRawAmount } from '../utils';
import { useTwapContext } from './context';
import CloseIcon from '@material-ui/icons/Close';
import { tryParseAmount } from 'state/swap/hooks';
import CurrencyLogo from 'components/CurrencyLogo';
import SwapVertIcon from '@material-ui/icons/SwapVert';
import { useTranslation } from 'react-i18next';
const useInvertedAmount = (amount?: string) => {
  const { chainId } = useActiveWeb3React();
  const { currencies } = useTwapContext();
  return useMemo(() => {
    if (!amount || !currencies.OUTPUT) return;
    const result = (
      10 ** currencies.OUTPUT.decimals /
      Number(amount)
    ).toString();
    return tryParseAmount(chainId, result, currencies.OUTPUT);
  }, [chainId, currencies.OUTPUT, amount]);
};

export function LimitInputPanel() {
  const { redirectWithCurrency } = useSwapRedirects();
  const { onInvertLimitPrice } = useTwapSwapActionHandlers();
  const { currencies } = useTwapContext();
  const { isLimitPriceInverted } = useTwapState();
  const handleCurrencySelect = (currency: Currency) => {
    redirectWithCurrency(currency, isLimitPriceInverted ? true : false);
  };

  const inCurrency = isLimitPriceInverted
    ? currencies.OUTPUT
    : currencies.INPUT;
  const outCurrency = isLimitPriceInverted
    ? currencies.INPUT
    : currencies.OUTPUT;

  return (
    <Card className='TwapLimitPanel'>
      <Box className='TwapLimitPanelHeader'>
        <Box className='TwapLimitPanelHeaderTitle'>
          When 1 <CurrencyLogo currency={inCurrency} size='17px' />{' '}
          {outCurrency?.symbol} is worth
        </Box>
        <button
          className='TwapLimitPanelHeaderInvert'
          onClick={() => onInvertLimitPrice(!isLimitPriceInverted)}
        >
          <SwapVertIcon />
        </button>
      </Box>
      <Box className='TwapLimitPanelInputContainer'>
        <CurrencySelect
          id='twap-limit-currency-select'
          currency={outCurrency}
          otherCurrency={inCurrency}
          handleCurrencySelect={handleCurrencySelect}
        />
        <LimitPriceInput />
      </Box>
      <PercentButtons />
    </Card>
  );
}

const LimitPriceInput = () => {
  const isProMode = useIsProMode();
  const { marketPrice, currencies } = useTwapContext();
  const { typedLimitPrice, isLimitPriceInverted } = useTwapState();
  const { onLimitPriceInput } = useTwapSwapActionHandlers();
  const invertedMarketPrice = useInvertedAmount(marketPrice);

  const value = useMemo(() => {
    if (typedLimitPrice !== undefined) {
      return typedLimitPrice;
    }
    if (isLimitPriceInverted) {
      return invertedMarketPrice?.toExact();
    }
    return fromRawAmount(currencies.OUTPUT, marketPrice)?.toExact();
  }, [
    typedLimitPrice,
    marketPrice,
    currencies.OUTPUT,
    isLimitPriceInverted,
    invertedMarketPrice?.toExact(),
  ]);

  return (
    <NumericalInput
      className='TwapLimitPanelInput'
      value={value || ''}
      align='right'
      color={isProMode ? 'white' : 'secondary'}
      placeholder='0.00'
      onUserInput={(val) => {
        onLimitPriceInput(val);
      }}
    />
  );
};

function useCalculatePercentageDiff() {
  const context = useTwapContext();
  const { isLimitPriceInverted } = useTwapState();
  return useMemo(() => {
    if (!context.marketPrice || !context.limitPrice) return 0;
    const marketPrice = Number(context.marketPrice);
    const limitPrice = Number(context.limitPrice);

    if (marketPrice === 0) return 0;
    const diff = marketPrice - limitPrice;
    let percentageDiff = (diff * 100) / marketPrice;
    if (!isLimitPriceInverted) {
      percentageDiff = -percentageDiff;
    }
    return parseFloat(percentageDiff.toFixed(2));
  }, [context.marketPrice, context.limitPrice, isLimitPriceInverted]);
}

const PercentButtons = () => {
  const {
    swapData: {},
    marketPrice,
    currencies,
  } = useTwapContext();
  const { isLimitPriceInverted, limitPercent } = useTwapState();
  const { onLimitPriceInput } = useTwapSwapActionHandlers();
  const invertedAmount = useInvertedAmount(marketPrice);

  const onPercent = useCallback(
    (percentage: number) => {
      if (!marketPrice || !currencies.OUTPUT) return;

      const price = isLimitPriceInverted
        ? invertedAmount?.toExact()
        : fromRawAmount(currencies.OUTPUT, marketPrice)?.toExact();
      if (!price) return;
      const adjustment = percentage / 100;

      const newLimitPrice = (Number(price) * (1 + adjustment)).toString();
      onLimitPriceInput(newLimitPrice.toString() || '', percentage);
    },
    [marketPrice, currencies, onLimitPriceInput, isLimitPriceInverted],
  );

  return (
    <Box className='TwapLimitPanelPercent'>
      <ResetButton />
      {isLimitPriceInverted
        ? [-1, -5, -10]
        : [1, 5, 10].map((percent) => {
            return (
              <SelectorButton
              key={percent}
                selected={limitPercent === percent}
                onClick={() => onPercent(percent)}
              >
                {isLimitPriceInverted ? '' : '+'}
                {percent}%
              </SelectorButton>
            );
          })}
    </Box>
  );
};

const ResetButton = () => {
  const { onLimitPriceInput } = useTwapSwapActionHandlers();
  const priceDiff = useCalculatePercentageDiff();
  const { limitPercent, typedLimitPrice } = useTwapState();
  const { t } = useTranslation();
  const { isLimitPanel } = useTwapContext();
  const showPercent = priceDiff && !limitPercent;

  if (!showPercent) {
    return (
      <SelectorButton
        onClick={() => onLimitPriceInput(undefined)}
        selected={Number(priceDiff) === 0 && typedLimitPrice !== ''}
      >
        {isLimitPanel ? '0%' : t('market')}
      </SelectorButton>
    );
  }

  return (
    <Box className='TwapLimitPanelPercentReset'>
      <SelectorButton
        onClick={() => onLimitPriceInput(undefined)}
        selected={true}
      >
        {Number(priceDiff) > 0 ? '+' : ''}
        {priceDiff}%
      </SelectorButton>
      <SelectorButton
        onClick={() => onLimitPriceInput(undefined)}
        selected={true}
      >
        <CloseIcon />
      </SelectorButton>
    </Box>
  );
};
