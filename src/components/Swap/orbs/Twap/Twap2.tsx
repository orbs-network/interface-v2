import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ButtonProps,
  Configs,
  LabelProps,
  OrderConfirmationModalProps,
  OrderHistoryModalProps,
  SelectMenuProps,
  ToggleProps,
  Token,
  TokenLogoProps,
  useLimitPricePanel,
  useTokenPanel,
  Widget,
} from '@orbs-network/twap-ui';
import { useCurrency, useToken } from 'hooks/Tokens';
import { useActiveWeb3React, useConnectWallet, useIsProMode } from 'hooks';
import {
  tryParseAmount,
  useDefaultsFromURLSearch,
  useDerivedSwapInfo,
  useSwapActionHandlers,
} from 'state/swap/hooks';
import { Field } from 'state/swap/actions';
import useParsedQueryString from 'hooks/useParsedQueryString';
import { useQuery } from '@tanstack/react-query';
import { getBestTradeCurrencyAddress, useParaswap } from 'hooks/useParaswap';
import { Currency, currencyEquals, ETHER, JSBI } from '@uniswap/sdk';
import { SwapSide } from '@paraswap/sdk';
import { useExpertModeManager } from 'state/user/hooks';
import { GlobalValue, paraswapTaxBuy, paraswapTaxSell } from 'constants/index';
import CustomModal from 'components/CustomModal';
import { Box, Button, Menu, MenuItem } from '@material-ui/core';
import { ReactComponent as CloseIcon } from 'assets/images/CloseIcon.svg';
import CurrencyInput from 'components/CurrencyInput';
import useSwapRedirects from 'hooks/useSwapRedirect';
import arrowDown from 'assets/images/icons/arrow-down.png';
import { useIsSupportedNetwork } from 'utils';
import QuestionHelper from 'components/QuestionHelper';
import CurrencyLogo from 'components/CurrencyLogo';
import { ZERO_ADDRESS } from 'constants/v3/misc';
import useUSDCPrice from 'utils/useUSDCPrice';
import ToggleSwitch from 'components/ToggleSwitch';
import { KeyboardArrowDown } from '@material-ui/icons';
import './index.scss';

const addressOrETH = (address?: string) => {
  return address === ZERO_ADDRESS ? 'ETH' : address;
};

const isNative = (address?: string) => {
  return address === ZERO_ADDRESS || address === 'ETH';
};

const useConfig = () => {
  const { chainId } = useActiveWeb3React();
  return useMemo(() => {
    if (chainId === 137) {
      return Configs.QuickSwap;
    }
    return Configs.QuickSwap;
  }, [chainId]);
};

const useParsedToken = (_address?: string) => {
  const { chainId } = useActiveWeb3React();
  const native = isNative(_address);
  const wrappedToken = useToken(native ? undefined : _address);
  const nativeToken = ETHER[chainId];
  return useMemo((): Token | undefined => {
    if (native) {
      return {
        address: ZERO_ADDRESS,
        symbol: nativeToken.symbol || '',
        decimals: nativeToken.decimals,
        logoUrl: '',
      };
    }
    if (wrappedToken) {
      return {
        address: wrappedToken.address,
        symbol: wrappedToken.symbol || '',
        decimals: wrappedToken.decimals,
        logoUrl: '',
      };
    }
  }, [native, nativeToken.decimals, nativeToken.symbol, wrappedToken]);
};

const useCurrencyToAddress = (currency?: Currency) => {
  const { chainId } = useActiveWeb3React();
  return useMemo(
    () =>
      !chainId || !currency
        ? undefined
        : getBestTradeCurrencyAddress(currency, chainId),
    [chainId, currency],
  );
};

const useMarketPrice = () => {
  const { chainId, account, library } = useActiveWeb3React();
  const { currencies } = useDerivedSwapInfo();
  const inputCurrency = currencies[Field.INPUT];
  const outputCurrency = currencies[Field.OUTPUT];
  const srcToken = useCurrencyToAddress(inputCurrency);
  const destToken = useCurrencyToAddress(outputCurrency);
  const paraswap = useParaswap();
  const [isExpertMode] = useExpertModeManager();

  const srcAmount = useMemo(() => {
    const parsedAmount = tryParseAmount(chainId, '1', inputCurrency);
    return parsedAmount && inputCurrency?.decimals
      ? parsedAmount
          .multiply(JSBI.BigInt(10 ** inputCurrency.decimals))
          .toFixed(0)
      : undefined;
  }, [inputCurrency, chainId]);

  const maxImpactAllowed = useMemo(() => {
    return isExpertMode
      ? 100
      : Number(
          GlobalValue.percents.BLOCKED_PRICE_IMPACT_NON_EXPERT.multiply(
            '100',
          ).toFixed(4),
        );
  }, [isExpertMode]);

  const fetchOptimalRate = async () => {
    if (
      !srcToken ||
      !destToken ||
      !account ||
      !chainId ||
      !library ||
      !srcAmount
    ) {
      return null;
    }
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
  };

  const {
    isLoading: loadingOptimalRate,
    data: optimalRateData,
    refetch: reFetchOptimalRate,
  } = useQuery({
    queryKey: [
      'fetchOptimalRate',
      srcToken,
      destToken,
      srcAmount,
      account,
      chainId,
      maxImpactAllowed,
    ],
    queryFn: fetchOptimalRate,
    refetchInterval: 10_000,
  });

  return {
    value: optimalRateData?.rate?.destAmount.toString(),
    isLoading: loadingOptimalRate,
  };
};

const OrderHistoryModal = (props: OrderHistoryModalProps) => {
  return (
    <CustomModal
      open={props.isOpen}
      onClose={props.onClose}
      modalWrapper='twapModalWrapper'
    >
      <Box padding={4} overflow='hidden'>
        <Box className='twapModalHeader'>
          <CloseIcon onClick={props.onClose} />
        </Box>
        <Box className='twapModalContent'>{props.children}</Box>
      </Box>
    </CustomModal>
  );
};

const OrderConfirmationModal = ({
  isOpen,
  onClose,
  children,
  title
}: OrderConfirmationModalProps) => {
  return (
    <CustomModal
      open={isOpen}
      onClose={onClose}
      modalWrapper='twapModalWrapper'
    >
      <Box padding={4} overflow='hidden'>
        <Box className='twapModalHeader'>
          <h5>{title}</h5>
          <CloseIcon onClick={onClose} />
        </Box>
        <Box className='twapModalContent'>{children}</Box>
      </Box>
    </CustomModal>
  );
};

const useCurrencyIds = () => {
  const parsedQs = useParsedQueryString();

  return useMemo(() => {
    const parsedCurrency0Id = (parsedQs.currency0 ??
      parsedQs.inputCurrency) as string;
    const parsedCurrency1Id = (parsedQs.currency1 ??
      parsedQs.outputCurrency) as string;
    return {
      parsedCurrency0Id,
      parsedCurrency1Id,
    };
  }, [parsedQs]);
};

const useCurrencySelect = () => {
  const { chainId } = useActiveWeb3React();

  const { parsedCurrency0Id, parsedCurrency1Id } = useCurrencyIds();
  const { redirectWithCurrency, redirectWithSwitch } = useSwapRedirects();

  const handleCurrencySelect = useCallback(
    (inputCurrency: any) => {
      const isSwitchRedirect = currencyEquals(inputCurrency, ETHER[chainId])
        ? parsedCurrency1Id === 'ETH'
        : parsedCurrency1Id &&
          inputCurrency &&
          inputCurrency.address &&
          inputCurrency.address.toLowerCase() ===
            parsedCurrency1Id.toLowerCase();
      if (isSwitchRedirect) {
        redirectWithSwitch();
      } else {
        redirectWithCurrency(inputCurrency, true);
      }
    },
    [chainId, parsedCurrency1Id, redirectWithCurrency, redirectWithSwitch],
  );

  const handleOtherCurrencySelect = useCallback(
    (outputCurrency: any) => {
      const isSwitchRedirect = currencyEquals(outputCurrency, ETHER[chainId])
        ? parsedCurrency0Id === 'ETH'
        : parsedCurrency0Id &&
          outputCurrency &&
          outputCurrency.address &&
          outputCurrency.address.toLowerCase() ===
            parsedCurrency0Id.toLowerCase();
      if (isSwitchRedirect) {
        redirectWithSwitch();
      } else {
        redirectWithCurrency(outputCurrency, false);
      }
    },
    [chainId, parsedCurrency0Id, redirectWithCurrency, redirectWithSwitch],
  );

  return {
    handleCurrencySelect,
    handleOtherCurrencySelect,
  };
};

const TokenPanel = ({ isSrcToken = false }: { isSrcToken?: boolean }) => {
  const { title, onPercent, onMax, value, onChange } = useTokenPanel({
    isSrcToken,
  });
  const { currencies } = useDerivedSwapInfo();

  const currency = isSrcToken
    ? currencies[Field.INPUT]
    : currencies[Field.OUTPUT];
  const otherCurrency = isSrcToken
    ? currencies[Field.OUTPUT]
    : currencies[Field.INPUT];
  const isProMode = useIsProMode();
  const currencySelect = useCurrencySelect();

  const onHalf = useCallback(() => {
    onPercent(0.5);
  }, [onPercent]);

  return (
    <CurrencyInput
      title={`${title}:`}
      id='swap-currency-input'
      classNames={isSrcToken ? 'twap_from_input' : 'twap_to_input'}
      currency={currency}
      onHalf={onHalf}
      onMax={onMax}
      showHalfButton={isSrcToken}
      showMaxButton={isSrcToken}
      otherCurrency={otherCurrency}
      handleCurrencySelect={
        isSrcToken
          ? currencySelect.handleCurrencySelect
          : currencySelect.handleOtherCurrencySelect
      }
      amount={value}
      setAmount={onChange}
      color={isProMode ? 'white' : 'secondary'}
      bgClass={isProMode ? 'swap-bg-highlight' : undefined}
    />
  );
};

const DappLabel = (props: LabelProps) => {
  return (
    <Box className='flex items-center twap-label' gridGap={6}>
      <p>{props.text}</p>
      {props.tooltip && <QuestionHelper size={20} text={props.tooltip} />}
    </Box>
  );
};

const LimitInput = () => {
  const { input, isInverted } = useLimitPricePanel();
  const isProMode = useIsProMode();
  const { currencies } = useDerivedSwapInfo();
  const currency = isInverted
    ? currencies[Field.INPUT]
    : currencies[Field.OUTPUT];
  const otherCurrency = isInverted
    ? currencies[Field.OUTPUT]
    : currencies[Field.INPUT];
  const currencySelect = useCurrencySelect();
  return (
    <Widget.LimitPricePanel>
      <Box className='twap-limit-price-panel-header'>
        <Box className='twap-limit-price-panel-header-title'>
          <p>Swap when 1</p>{' '}
          <CurrencyLogo currency={otherCurrency} size={'18px'} />
          <p>{otherCurrency?.symbol} is worth</p>
        </Box>
        <Widget.LimitPricePanel.InvertPriceButton />
      </Box>
      <CurrencyInput
        title=''
        id='limit-price-input'
        classNames='twap_limit_input'
        currency={currency}
        showHalfButton={false}
        showMaxButton={false}
        otherCurrency={otherCurrency}
        handleCurrencySelect={
          isInverted
            ? currencySelect.handleCurrencySelect
            : currencySelect.handleOtherCurrencySelect
        }
        amount={input.value}
        setAmount={input.onChange}
        color={isProMode ? 'white' : 'secondary'}
        bgClass={isProMode ? 'swap-bg-highlight' : undefined}
      />
      <Widget.LimitPricePanel.PercentSelector />
    </Widget.LimitPricePanel>
  );
};

const ChangeTokens = () => {
  const { redirectWithSwitch } = useSwapRedirects();
  return (
    <Box className='exchangeSwap'>
      <Box
        onClick={() => {
          redirectWithSwitch();
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          borderRadius: '4px',
          border: '2px solid #191b2e',
          bgcolor: '#232734',
        }}
      >
        <img src={arrowDown} alt='arrow down' width='12px' height='12px' />
      </Box>
    </Box>
  );
};

const Listeners = () => {
  useDefaultsFromURLSearch();
  const { parsedCurrency0Id, parsedCurrency1Id } = useCurrencyIds();
  const parsedCurrency0 = useCurrency(parsedCurrency0Id);
  const parsedCurrency1 = useCurrency(parsedCurrency1Id);
  const parsedCurrency0Fetched = !!parsedCurrency0;
  const parsedCurrency1Fetched = !!parsedCurrency1;
  const { onCurrencySelection } = useSwapActionHandlers();
  const { redirectWithCurrency } = useSwapRedirects();
  const { chainId } = useActiveWeb3React();
  useEffect(() => {
    if (parsedCurrency0 === undefined && !parsedCurrency1Id) {
      redirectWithCurrency(ETHER[chainId], true);
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

  return null;
};

const TokenLogo = ({ token }: TokenLogoProps) => {
  const currency = useCurrency(addressOrETH(token?.address)) ?? undefined;
  return <CurrencyLogo currency={currency} size={'18px'} />;
};

const DexButton = (props: ButtonProps) => {
  return (
    <Box className='swapButtonWrapper'>
      <Button fullWidth onClick={props.onClick} disabled={props.disabled}>
        {props.children}
      </Button>
    </Box>
  );
};

const Toggle = (props: ToggleProps) => {
  return <ToggleSwitch toggled={props.checked} onToggle={props.onChange} />;
};

const SelectMenu = (props: SelectMenuProps) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClose = () => {
    setAnchorEl(null);
  };

  const items = useMemo(() => {
    return props.items.map((it) => {
      return {
        ...it,
        key: it.value,
        selected: it.value === props.selected?.value,
      };
    });
  }, [props.items, props.selected]);

  const handleClickListItem = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  return (
    <>
      <Button
        id='swap-button'
        aria-controls={open ? 'swap-menu' : undefined}
        aria-haspopup='true'
        aria-expanded={open ? 'true' : undefined}
        variant='text'
        disableElevation
        onClick={handleClickListItem}
        endIcon={<KeyboardArrowDown />}
        style={{
          fontSize: '14px',
        }}
        className={`tab tabMenu`}
      >
        {props.selected?.text}
      </Button>
      <Menu
        id='swap-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'swap-button',
          role: 'listbox',
        }}
      >
        {items.map((option, index) => (
          <MenuItem
            className={`swap-menu-item ${
              option.selected ? 'swap-menu-item-selected' : ''
            }`}
            key={option.key}
            disabled={false}
            selected={option.selected}
            onClick={(event) => {
              handleClose();
              props.onSelect?.(option);
            }}
          >
            {option.text}

            {option.selected && <Box ml={5} className='selectedMenuDot' />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

const Twap2: React.FC<{ isLimitPanel?: boolean }> = ({ isLimitPanel }) => {
  const { chainId, provider, account } = useActiveWeb3React();
  const config = useConfig();

  const { parsedCurrency0Id, parsedCurrency1Id } = useCurrencyIds();

  const srcToken = useParsedToken(parsedCurrency0Id);
  const dstToken = useParsedToken(parsedCurrency1Id);
  const inputCurrency = useCurrency(parsedCurrency0Id);
  const outputCurrency = useCurrency(parsedCurrency1Id);
  const marketReferencePrice = useMarketPrice();
  const { currencyBalances } = useDerivedSwapInfo();
  const isSupportedNetwork = useIsSupportedNetwork();

  const { connectWallet } = useConnectWallet(isSupportedNetwork);

  const srcUsd1Token = Number(
    useUSDCPrice(inputCurrency ?? undefined)?.toSignificant() ?? 0,
  );

  const dstUsd1Token = Number(
    useUSDCPrice(outputCurrency ?? undefined)?.toSignificant() ?? 0,
  );

  return (
    <Widget
      provider={provider?.provider as any}
      chainId={chainId}
      config={config}
      useToken={useParsedToken}
      account={account}
      srcToken={srcToken}
      isLimitPanel={isLimitPanel}
      dstToken={dstToken}
      srcBalance={currencyBalances.INPUT?.raw?.toString()}
      dstBalance={currencyBalances.OUTPUT?.raw?.toString()}
      marketReferencePrice={marketReferencePrice}
      components={{
        Button: DexButton,
        Label: DappLabel,
        TokenLogo,
        Toggle,
        SelectMenu,
      }}
      modals={{ OrderConfirmationModal, OrderHistoryModal }}
      callbacks={{
        onConnect: connectWallet,
      }}
      srcUsd1Token={srcUsd1Token}
      dstUsd1Token={dstUsd1Token}
    >
      <Listeners />
      <Widget.PriceSwitch />
      <LimitInput />
      <TokenPanel isSrcToken={true} />
      <ChangeTokens />
      <TokenPanel isSrcToken={false} />
      {isLimitPanel ? (
        <Widget.DurationPanel />
      ) : (
        <Box className='twap-inputs'>
          <Widget.FillDelayPanel />
          <Widget.TradesAmountPanel />
        </Box>
      )}
      <Widget.TradeAmountMessage />
      <Widget.ShowConfirmationButton />
      <Widget.WarningMessage />
      <Widget.Orders />
    </Widget>
  );
};

export default Twap2;
