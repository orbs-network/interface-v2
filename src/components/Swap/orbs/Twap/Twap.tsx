import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  JSBI,
  Token,
  currencyEquals,
  ETHER,
  Fraction,
  ChainId,
  WETH,
} from '@uniswap/sdk';
import { Currency, CurrencyAmount, NativeCurrency } from '@uniswap/sdk-core';
import { Box, Button } from '@material-ui/core';
import {
  useExpertModeManager,
  useUserSlippageTolerance,
} from 'state/user/hooks';
import { Field } from 'state/swap/actions';
import { useHistory } from 'react-router-dom';
import { CurrencyInput } from 'components';
import { useActiveWeb3React, useConnectWallet, useIsProMode } from 'hooks';
import useWrapCallback, { WrapType } from 'hooks/useWrapCallback';
import {
  useIsSupportedNetwork,
  maxAmountSpend,
  basisPointsToPercent,
  halfAmountSpend,
} from 'utils';
import { ReactComponent as ExchangeIcon } from 'assets/images/ExchangeIcon.svg';
import 'components/styles/Swap.scss';
import { useTranslation } from 'react-i18next';
import { SwapSide } from '@paraswap/sdk';
import { useAllTokens, useCurrency } from 'hooks/Tokens';
import TokenWarningModal from 'components/v3/TokenWarningModal';
import useParsedQueryString from 'hooks/useParsedQueryString';
import useSwapRedirects from 'hooks/useSwapRedirect';
import { ONE } from 'v3lib/utils';
import useNativeConvertCallback, {
  ConvertType,
} from 'hooks/useNativeConvertCallback';
import { useTwapSwapWarning } from './hooks';
import {
  useDefaultsFromURLSearch,
  useTwapState,
  useTwapSwapActionHandlers,
} from 'state/swap/twap/hooks';
import { TwapContextProvider, useTwapContext } from './context';
import { TwapSwapConfirmation } from './TwapSwapConfirmation/TwapSwapConfirmation';
import { ChunksSelect, DurationSelect, FillDelaySelect, InputsContainer, LimitPriceWarning } from './components';
import { LimitInputPanel } from './LimitPanel';
import { TwapOrders } from './TwapOrders/TwapOrders';
import 'components/styles/orbs/Twap.scss';


const Content: React.FC<{
  currencyBgClass?: string;
}> = ({ currencyBgClass }) => {
  const history = useHistory();
  const isProMode = useIsProMode();
  const isSupportedNetwork = useIsSupportedNetwork();
  const loadedUrlParams = useDefaultsFromURLSearch();

  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(
    false,
  );

  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true);
  }, []);

  // reset if they close warning without tokens in params
  const handleDismissTokenWarning = useCallback(() => {
    setDismissTokenWarning(true);
    history.push('/swap');
  }, [history]);

  // dismiss warning if all imported tokens are in active lists
  const defaultTokens = useAllTokens();
  const [showConfirm, setShowConfirm] = useState(false);

  const { t } = useTranslation();
  const { account, chainId } = useActiveWeb3React();
  const { typedValue } = useTwapState();
  const chainIdToUse = chainId ? chainId : ChainId.MATIC;
  const independentField = Field.INPUT;

  const {
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError,
    maxImpactAllowed,
    optimalRate,
    tradeDestAmount,
    loadingOptimalRate,
    optimalRateError,
    isLimitPanel,
  } = useTwapContext();

  const [isExpertMode] = useExpertModeManager();
  const {
    wrapType,
    execute: onWrap,
    inputError: wrapInputError,
  } = useWrapCallback(
    currencies[Field.INPUT],
    currencies[Field.OUTPUT],
    typedValue,
  );

  const [swapType, setSwapType] = useState<SwapSide>(SwapSide.SELL);

  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE;

  const { onCurrencySelection, onUserInput } = useTwapSwapActionHandlers();
  const [allowedSlippage] = useUserSlippageTolerance();

  const pct = basisPointsToPercent(allowedSlippage);

  const dependentField = Field.OUTPUT;
  const inputCurrency = currencies[Field.INPUT];
  const outputCurrency = currencies[Field.OUTPUT];

  const inputCurrencyV3 = useMemo(() => {
    if (!inputCurrency || !chainId) return;
    if (currencyEquals(inputCurrency, ETHER[chainId])) {
      return {
        ...ETHER[chainId],
        isNative: true,
        isToken: false,
      } as NativeCurrency;
    }
    return { ...inputCurrency, isNative: false, isToken: true } as Currency;
  }, [chainId, inputCurrency]);

  const outputCurrencyV3 = useMemo(() => {
    if (!outputCurrency || !chainId) return;
    if (currencyEquals(outputCurrency, ETHER[chainId]))
      return {
        ...ETHER[chainId],
        isNative: true,
        isToken: false,
      } as NativeCurrency;
    return { ...outputCurrency, isNative: false, isToken: true } as Currency;
  }, [chainId, outputCurrency]);

  const {
    convertType,
    execute: onConvert,
    inputError: convertInputError,
  } = useNativeConvertCallback(
    inputCurrencyV3?.isToken ? inputCurrencyV3 : undefined,
    outputCurrencyV3?.isToken ? outputCurrencyV3 : undefined,
    typedValue,
  );

  const showNativeConvert = convertType !== ConvertType.NOT_APPLICABLE;
  const { connectWallet } = useConnectWallet(isSupportedNetwork);

  const parsedQs = useParsedQueryString();
  const { redirectWithCurrency, redirectWithSwitch } = useSwapRedirects();
  const parsedCurrency0Id = (parsedQs.currency0 ??
    parsedQs.inputCurrency) as string;
  const parsedCurrency1Id = (parsedQs.currency1 ??
    parsedQs.outputCurrency) as string;

  const handleCurrencySelect = useCallback(
    (inputCurrency: any) => {
      const isSwichRedirect = currencyEquals(inputCurrency, ETHER[chainIdToUse])
        ? parsedCurrency1Id === 'ETH'
        : parsedCurrency1Id &&
          inputCurrency &&
          inputCurrency.address &&
          inputCurrency.address.toLowerCase() ===
            parsedCurrency1Id.toLowerCase();
      if (isSwichRedirect) {
        redirectWithSwitch();
        setSwapType(swapType === SwapSide.BUY ? SwapSide.SELL : SwapSide.BUY);
      } else {
        if (!Boolean(inputCurrency.address in defaultTokens)) {
          setDismissTokenWarning(false);
        }
        redirectWithCurrency(inputCurrency, true);
      }
    },
    [
      chainIdToUse,
      defaultTokens,
      parsedCurrency1Id,
      redirectWithCurrency,
      redirectWithSwitch,
      swapType,
    ],
  );

  const handleOtherCurrencySelect = useCallback(
    (outputCurrency: any) => {
      const isSwichRedirect = currencyEquals(
        outputCurrency,
        ETHER[chainIdToUse],
      )
        ? parsedCurrency0Id === 'ETH'
        : parsedCurrency0Id &&
          outputCurrency &&
          outputCurrency.address &&
          outputCurrency.address.toLowerCase() ===
            parsedCurrency0Id.toLowerCase();
      if (isSwichRedirect) {
        redirectWithSwitch();
        setSwapType(swapType === SwapSide.BUY ? SwapSide.SELL : SwapSide.BUY);
      } else {
        if (!Boolean(outputCurrency.address in defaultTokens)) {
          setDismissTokenWarning(false);
        }
        redirectWithCurrency(outputCurrency, false);
      }
    },
    [
      chainIdToUse,
      parsedCurrency0Id,
      redirectWithSwitch,
      swapType,
      redirectWithCurrency,
      defaultTokens,
    ],
  );

  const parsedCurrency0 = useCurrency(parsedCurrency0Id);
  const parsedCurrency1 = useCurrency(parsedCurrency1Id);
  const parsedCurrency0Fetched = !!parsedCurrency0;
  const parsedCurrency1Fetched = !!parsedCurrency1;

  useEffect(() => {
    if (parsedCurrency0 === undefined && !parsedCurrency1Id) {
      redirectWithCurrency(ETHER[chainIdToUse], true);
    } else {
      if (parsedCurrency0) {
        onCurrencySelection(Field.INPUT, parsedCurrency0);
      }
      if (parsedCurrency1) {
        onCurrencySelection(Field.OUTPUT, parsedCurrency1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    parsedCurrency0Id,
    parsedCurrency1Id,
    parsedCurrency0Fetched,
    parsedCurrency1Fetched,
  ]);

  const selectedTokens: Token[] = useMemo(
    () =>
      [parsedCurrency0, parsedCurrency1]?.filter(
        (c): c is Token => c instanceof Token,
      ) ?? [],
    [parsedCurrency0, parsedCurrency1],
  );
  const selectedTokensNotInDefault =
    selectedTokens &&
    selectedTokens.filter((token: Token) => {
      return !Boolean(token.address in defaultTokens);
    });

  const parsedAmounts = useMemo(() => {
    const parsedAmountInput =
      inputCurrencyV3 && parsedAmount
        ? CurrencyAmount.fromRawAmount(inputCurrencyV3, parsedAmount.raw)
        : undefined;
    const parsedAmountOutput =
      outputCurrencyV3 && parsedAmount
        ? CurrencyAmount.fromRawAmount(outputCurrencyV3, parsedAmount.raw)
        : undefined;

    return showWrap || showNativeConvert
      ? {
          [Field.INPUT]: parsedAmountInput,
          [Field.OUTPUT]: parsedAmountOutput,
        }
      : {
          [Field.INPUT]: parsedAmountInput,
          [Field.OUTPUT]:
            tradeDestAmount && outputCurrencyV3
              ? CurrencyAmount.fromRawAmount(
                  outputCurrencyV3,
                  JSBI.BigInt(tradeDestAmount),
                )
              : undefined,
        };
  }, [
    inputCurrencyV3,
    parsedAmount,
    outputCurrencyV3,
    showWrap,
    showNativeConvert,
    independentField,
    tradeDestAmount,
  ]);

  const maxAmountInputV2 = maxAmountSpend(
    chainIdToUse,
    currencyBalances[Field.INPUT],
  );
  const halfAmountInputV2 = halfAmountSpend(
    chainIdToUse,
    currencyBalances[Field.INPUT],
  );
  const formattedAmounts = useMemo(() => {
    return {
      [independentField]: typedValue,
      [dependentField]:
        showWrap || showNativeConvert
          ? parsedAmounts[independentField]?.toExact() ?? ''
          : parsedAmounts[dependentField]?.toExact() ?? '',
    };
  }, [
    independentField,
    typedValue,
    dependentField,
    showWrap,
    showNativeConvert,
    parsedAmounts,
  ]);

  const maxAmountInput =
    maxAmountInputV2 && inputCurrencyV3
      ? CurrencyAmount.fromRawAmount(inputCurrencyV3, maxAmountInputV2.raw)
      : undefined;

  const halfAmountInput =
    halfAmountInputV2 && inputCurrencyV3
      ? CurrencyAmount.fromRawAmount(inputCurrencyV3, halfAmountInputV2.raw)
      : undefined;

  const handleMaxInput = useCallback(() => {
    maxAmountInput && onUserInput(Field.INPUT, maxAmountInput.toExact());
    setSwapType(SwapSide.SELL);
  }, [maxAmountInput, onUserInput]);

  const handleHalfInput = useCallback(() => {
    if (!halfAmountInput) {
      return;
    }

    onUserInput(Field.INPUT, halfAmountInput.toExact());
    setSwapType(SwapSide.SELL);
  }, [halfAmountInput, onUserInput]);

  const atMaxAmountInput = Boolean(
    maxAmountInput && parsedAmounts[Field.INPUT]?.equalTo(maxAmountInput),
  );

  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] &&
      currencies[Field.OUTPUT] &&
      parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0)),
  );

  const noRoute = !optimalRate || optimalRate.bestRoute.length < 0;
  const srcAmount = optimalRate?.srcAmount;
  const twapSwapWarning = useTwapSwapWarning();

  const swapInputAmountWithSlippage =
    inputCurrencyV3 && srcAmount
      ? CurrencyAmount.fromRawAmount(inputCurrencyV3, srcAmount)
      : optimalRate && inputCurrencyV3
      ? CurrencyAmount.fromRawAmount(
          inputCurrencyV3,
          (optimalRate.side === SwapSide.BUY
            ? new Fraction(ONE).add(pct)
            : new Fraction(ONE)
          ).multiply(optimalRate.srcAmount).quotient,
        )
      : undefined;

  const swapInputBalanceCurrency = currencyBalances[Field.INPUT];

  const swapInputBalance =
    swapInputBalanceCurrency && inputCurrencyV3
      ? CurrencyAmount.fromRawAmount(
          inputCurrencyV3,
          swapInputBalanceCurrency.raw.toString(),
        )
      : undefined;

  const swapButtonText = useMemo(() => {
    if (account) {
      if (!isSupportedNetwork) return t('switchNetwork');
      if (!currencies[Field.INPUT] || !currencies[Field.OUTPUT]) {
        return t('selectToken');
      } else if (
        formattedAmounts[Field.INPUT] === '' &&
        formattedAmounts[Field.OUTPUT] === ''
      ) {
        return t('enterAmount');
      } else if (showNativeConvert) {
        if (convertInputError) return convertInputError;
        return convertType === ConvertType.CONVERT
          ? t('convert')
          : convertType === ConvertType.CONVERTING
          ? t('converting', { symbol: ETHER[chainId].symbol })
          : '';
      } else if (showWrap) {
        if (wrapInputError) return wrapInputError;
        return wrapType === WrapType.WRAP
          ? t('wrapMATIC', { symbol: ETHER[chainId].symbol })
          : wrapType === WrapType.UNWRAP
          ? t('unwrapMATIC', { symbol: WETH[chainId].symbol })
          : wrapType === WrapType.WRAPPING
          ? t('wrappingMATIC', { symbol: ETHER[chainId].symbol })
          : wrapType === WrapType.UNWRAPPING
          ? t('unwrappingMATIC', { symbol: WETH[chainId].symbol })
          : '';
      } else if (loadingOptimalRate) {
        return t('loading');
      } else if (
        optimalRateError === 'ESTIMATED_LOSS_GREATER_THAN_MAX_IMPACT'
      ) {
        return t('priceImpactReached', { maxImpact: maxImpactAllowed });
      } else if (optimalRateError) {
        return optimalRateError.includes('<!DOCTYPE')
          ? t('bestTradeBanned')
          : optimalRateError;
      } else if (swapInputError) {
        return swapInputError;
      } else if (twapSwapWarning) {
        return twapSwapWarning;
      } else if (noRoute && userHasSpecifiedInputOutput) {
        return t('insufficientLiquidityTrade');
      } else if (
        swapInputAmountWithSlippage &&
        swapInputBalance &&
        swapInputAmountWithSlippage.greaterThan(swapInputBalance)
      ) {
        return t('insufficientBalance', {
          symbol: currencies[Field.INPUT]?.symbol,
        });
      } else {
        return t('swap');
      }
    } else {
      return t('connectWallet');
    }
  }, [
    account,
    isSupportedNetwork,
    t,
    currencies,
    formattedAmounts,
    showNativeConvert,
    showWrap,
    loadingOptimalRate,
    optimalRateError,
    swapInputError,
    noRoute,
    userHasSpecifiedInputOutput,
    swapInputAmountWithSlippage,
    swapInputBalance,
    convertInputError,
    convertType,
    chainId,
    wrapInputError,
    wrapType,
    maxImpactAllowed,
    twapSwapWarning,
  ]);

  const maxImpactReached = optimalRate?.maxImpactReached;
  const tradeSrcAmount = parsedAmount?.numerator.toString();
  const swapButtonDisabled = useMemo(() => {
    if (swapInputError) {
      return true;
    }
    const isSwapError =
      (maxImpactReached && !isExpertMode) ||
      (tradeSrcAmount &&
        !parsedAmounts[Field.INPUT]?.equalTo(JSBI.BigInt(tradeSrcAmount))) ||
      (tradeDestAmount &&
        !parsedAmounts[Field.OUTPUT]?.equalTo(JSBI.BigInt(tradeDestAmount))) ||
      (swapInputAmountWithSlippage &&
        swapInputBalance &&
        swapInputAmountWithSlippage.greaterThan(swapInputBalance));

    if (account) {
      if (!isSupportedNetwork) return false;
      else if (showNativeConvert) {
        return (
          Boolean(convertInputError) || convertType === ConvertType.CONVERTING
        );
      } else if (showWrap) {
        return (
          Boolean(wrapInputError) ||
          wrapType === WrapType.WRAPPING ||
          wrapType === WrapType.UNWRAPPING
        );
      } else if (noRoute && userHasSpecifiedInputOutput) {
        return true;
      } else {
        return isSwapError || twapSwapWarning;
      }
    } else {
      return false;
    }
  }, [
    inputCurrencyV3,
    isExpertMode,
    parsedAmounts,
    swapInputAmountWithSlippage,
    swapInputBalance,
    account,
    isSupportedNetwork,
    showNativeConvert,
    showWrap,
    noRoute,
    userHasSpecifiedInputOutput,
    convertInputError,
    convertType,
    wrapInputError,
    wrapType,
    tradeSrcAmount,
    tradeDestAmount,
    maxImpactReached,
    twapSwapWarning,
    swapInputError,
  ]);

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value);
      setSwapType(SwapSide.SELL);
    },
    [onUserInput],
  );
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value);
      setSwapType(SwapSide.BUY);
    },
    [onUserInput],
  );

  const onSubmitSwap = useCallback(() => {
    setShowConfirm(true);
  }, []);
  return (
    <Box>
      <TokenWarningModal
        isOpen={selectedTokensNotInDefault.length > 0 && !dismissTokenWarning}
        tokens={selectedTokensNotInDefault}
        onConfirm={handleConfirmTokenWarning}
        onDismiss={handleDismissTokenWarning}
      />

      <TwapSwapConfirmation
        isOpen={showConfirm}
        onDismiss={() => setShowConfirm(false)}
      />
      <LimitInputPanel />
      <CurrencyInput
        title={`${t('allocate')}:`}
        id='swap-currency-input'
        currency={currencies[Field.INPUT]}
        onHalf={handleHalfInput}
        onMax={handleMaxInput}
        showHalfButton={true}
        showMaxButton={!atMaxAmountInput}
        otherCurrency={currencies[Field.OUTPUT]}
        handleCurrencySelect={handleCurrencySelect}
        amount={formattedAmounts[Field.INPUT]}
        setAmount={handleTypeInput}
        color={isProMode ? 'white' : 'secondary'}
        bgClass={isProMode ? 'swap-bg-highlight' : currencyBgClass}
      />
      <Box className='exchangeSwap'>
        <ExchangeIcon
          onClick={() => {
            setSwapType(
              swapType === SwapSide.BUY ? SwapSide.SELL : SwapSide.BUY,
            );
            redirectWithSwitch();
          }}
        />
      </Box>
      <CurrencyInput
        title={`${t('toEstimate')}:`}
        id='swap-currency-output'
        currency={currencies[Field.OUTPUT]}
        showPrice={Boolean(optimalRate)}
        showMaxButton={false}
        otherCurrency={currencies[Field.INPUT]}
        handleCurrencySelect={handleOtherCurrencySelect}
        amount={formattedAmounts[Field.OUTPUT]}
        setAmount={handleTypeOutput}
        color={isProMode ? 'white' : 'secondary'}
        bgClass={isProMode ? 'swap-bg-highlight' : currencyBgClass}
        disabled={true}
      />
      <InputsContainer>
        {!isLimitPanel && <FillDelaySelect />}
        {!isLimitPanel && <ChunksSelect />}
        {isLimitPanel && <DurationSelect />}
      </InputsContainer>

      <Box className='swapButtonWrapper'>
        <Box width={'100%'}>
          <Button
            fullWidth
            disabled={
              ((showNativeConvert ? false : optimalRateError) ||
                swapButtonDisabled) as boolean
            }
            onClick={
              account && isSupportedNetwork ? onSubmitSwap : connectWallet
            }
          >
            {swapButtonText}
          </Button>
        </Box>
      </Box>
      <LimitPriceWarning />
      <TwapOrders />
    </Box>
  );
};

export const SwapTwap: React.FC<{
  currencyBgClass?: string;
  isLimitPanel?: boolean;
}> = ({ isLimitPanel, currencyBgClass }) => {
  return (
    <TwapContextProvider isLimitPanel={!!isLimitPanel}>
      <Content currencyBgClass={currencyBgClass} />
    </TwapContextProvider>
  );
};
