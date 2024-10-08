import { Box } from '@material-ui/core';
import React, { useCallback, useMemo, useState } from 'react';
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
import { useOptimalRate } from './context';
import CustomTabSwitch from 'components/v3/CustomTabSwitch';

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

const Switch = () => {
  const [isLimit, setIsLimit] = useState(true);
  return (
    <Box className='TwapSwitch'>
      <Box
        onClick={() => setIsLimit(false)}
        className={`TwapSwitchItem ${!isLimit && 'TwapSwitchItemSelected'}`}
      >
        Market
      </Box>
      <Box
        onClick={() => setIsLimit(false)}
        className={`TwapSwitchItem ${isLimit && 'TwapSwitchItemSelected'}`}
      >
        Limit
      </Box>
    </Box>
  );
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
   <>
    <Switch />
    <Card className='TwapLimitPanel'>
   
      <Box className='TwapLimitPanelHeader'>
        <Box className='TwapLimitPanelHeaderTitle'>
          When 1 <CurrencyLogo currency={inCurrency} size='17px' />{' '}
          {inCurrency?.symbol} is worth
        </Box>
        <button
          className='TwapLimitPanelHeaderInvert'
          onClick={() => onInvertLimitPrice(!isLimitPriceInverted)}
        >
          <SwapVertIcon />
        </button>
      </Box>
      <Box
        mb={2}
        sx={{ borderRadius: '10px', padding: '8px 16px' }}
        className='bg-input1 TwapLimitPanelInputContainer'
      >
        <LimitPriceInput />
        <CurrencySelect
          id='twap-limit-currency-select'
          currency={outCurrency}
          otherCurrency={inCurrency}
          handleCurrencySelect={handleCurrencySelect}
        />
      </Box>
      <PercentButtons />
    </Card>
   </>
  );
}

const LimitPriceInput = () => {
  const isProMode = useIsProMode();
  const { currencies } = useTwapContext();
  const marketPrice = useOptimalRate().data?.rate?.destAmount;
  const state = useTwapState();
  const { onLimitPriceInput } = useTwapSwapActionHandlers();
  const invertedMarketPrice = useInvertedAmount(marketPrice);

  const value = useMemo(() => {
    if (state.limitPrice !== undefined) {
      return state.limitPrice;
    }
    if (state.isLimitPriceInverted) {
      return invertedMarketPrice?.toExact();
    }
    return fromRawAmount(currencies.OUTPUT, marketPrice)?.toExact();
  }, [
    state.limitPrice,
    marketPrice,
    currencies.OUTPUT,
    state.isLimitPriceInverted,
    invertedMarketPrice?.toExact(),
  ]);

  return (
    <NumericalInput
      className='TwapLimitPanelInput'
      value={value || ''}
      align='left'
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
  const destAmount = useOptimalRate().data?.rate?.destAmount;

  return useMemo(() => {
    if (!destAmount || !context.limitPrice) return 0;
    const marketPrice = Number(destAmount);
    const limitPrice = Number(context.limitPrice);

    if (marketPrice === 0) return 0;
    const diff = marketPrice - limitPrice;
    let percentageDiff = (diff * 100) / marketPrice;
    if (!isLimitPriceInverted) {
      percentageDiff = -percentageDiff;
    }
    return parseFloat(percentageDiff.toFixed(2));
  }, [context.limitPrice, destAmount, isLimitPriceInverted]);
}

const PercentButtons = () => {
  const { currencies } = useTwapContext();
  const { isLimitPriceInverted, limitPercent } = useTwapState();
  const { onLimitPriceInput } = useTwapSwapActionHandlers();
  const marketPrice = useOptimalRate().data?.rate?.destAmount;
  const invertedAmount = useInvertedAmount(marketPrice);

  const onPercent = useCallback(
    (percentage: number) => {
      if (!marketPrice || !currencies.OUTPUT) return;

      const price = isLimitPriceInverted
        ? invertedAmount?.toExact()
        : fromRawAmount(currencies.OUTPUT, marketPrice)?.toExact();
      if (!price) return;
      const adjustment = percentage / 100;

      const newLimitPrice = parseFloat(
        (Number(price) * (1 + adjustment)).toFixed(5),
      );
      onLimitPriceInput(newLimitPrice.toString() || '', percentage);
    },
    [marketPrice, currencies, onLimitPriceInput, isLimitPriceInverted],
  );

  const percent = useMemo(() => {
    return [1, 5, 10].map((it) => it * (isLimitPriceInverted ? -1 : 1));
  }, [isLimitPriceInverted]);

  return (
    <Box className='TwapLimitPanelPercent'>
      <ResetButton />
      {percent.map((percent) => {
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
  const state = useTwapState();
  const { t } = useTranslation();
  const showPercent = priceDiff && !state.limitPercent;
  console.log(state.limitPercent, priceDiff);

  if (!showPercent) {
    return (
      <SelectorButton
        onClick={() => onLimitPriceInput(undefined)}
        selected={Number(priceDiff) === 0 && state.limitPrice !== ''}
      >
        0%
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
