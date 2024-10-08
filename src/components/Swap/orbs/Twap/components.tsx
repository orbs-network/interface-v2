import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Menu, MenuItem, Typography } from '@material-ui/core';
import { styled } from '@material-ui/core';
import { NumericalInput, QuestionHelper } from 'components';
import { ReactNode } from 'react';
import { formatNumber } from '@orderly.network/hooks/esm/utils';
import { useTranslation } from 'react-i18next';
import { useTwapSwapActionHandlers } from 'state/swap/twap/hooks';
import { fromRawAmount } from '../utils';
import { TimeDuration, TimeUnit } from '@orbs-network/twap-sdk';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { TWAP_FAQ } from '../consts';
import useUSDCPrice from 'utils/useUSDCPrice';
import { useTwapContext } from './context';
import { Field } from '../../../../state/swap/actions';
import { KeyboardArrowDown } from '@material-ui/icons';

export const Section = ({
  title,
  tootlip,
  children,
  className = '',
}: {
  title: string;
  tootlip?: string;
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <Box className={`swapBox bg-secondary4 TwapInput ${className}`}>
      <Box mb={1.5} className='flex items-center TwapInputHeader'>
        <SectionTitle>{title}</SectionTitle>
        {tootlip && <QuestionHelper size={18} text={tootlip} />}
      </Box>
      {children}
    </Box>
  );
};

const SectionInput = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => {
  return (
    <Box className={`TwapInputContent bg-input1 ${className}`}>{children}</Box>
  );
};

const SectionTitle = styled('p')({
  marginRight: 7,
  fontSize: 13,
  color: '#fff',
});

export const Card = ({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) => {
  return (
    <StyledCard onClick={onClick} className={`${className} bg-secondary4`}>
      {children}
    </StyledCard>
  );
};

const StyledCard = styled(Box)({
  padding: 15,
  minHeight: 60,
  borderRadius: 16,
});

const Chunks = () => {
  const { t } = useTranslation();
  const { onChunksInput } = useTwapSwapActionHandlers();
  const { chunks } = useTwapContext().derivedSwapValues;

  return (
    <Section
      className='TwapChunkSelect'
      title='Over'
      tootlip='The total number of individual trades that will be scheduled as part of your order. Note that in limit orders, it is possible that not all scheduled trades will be executed.'
    >
      <SectionInput>
        <NumericalInput
          value={chunks}
          align='left'
          color='secondary'
          placeholder='0.00'
          onUserInput={(val) => {
            onChunksInput(Number(val));
          }}
        />
        <p className='TwapChunkSelectText'>{t('orders')}</p>
      </SectionInput>
    </Section>
  );
};

const ChunkSize = () => {
  const { derivedSwapValues, currencies } = useTwapContext();
  const { srcChunkAmount } = derivedSwapValues;
  const oneSrcTokenUsd = Number(
    useUSDCPrice(currencies[Field.INPUT])?.toSignificant() ?? 0,
  );

  const srcChukAmountUsd = useMemo(() => {
    const srcChunkCurrencyAmount = fromRawAmount(
      currencies[Field.INPUT],
      srcChunkAmount,
    );
    return oneSrcTokenUsd * Number(srcChunkCurrencyAmount?.toExact() ?? 0);
  }, [oneSrcTokenUsd, srcChunkAmount, currencies[Field.INPUT]]);

  const amount = fromRawAmount(currencies[Field.INPUT], srcChunkAmount);
  return (
    <Box className='TwapChunkSize'>
      {formatNumber(amount?.toExact())} {amount?.currency.symbol} per trade{' '}
      <small>{`($${formatNumber(srcChukAmountUsd)})`}</small>
    </Box>
  );
};

const resolutions: { unit: TimeUnit; label: string }[] = [
  {
    label: 'minute',
    unit: TimeUnit.Minutes,
  },
  {
    label: 'day',
    unit: TimeUnit.Days,
  },
  {
    label: 'week',
    unit: TimeUnit.Weeks,
  },
  {
    label: 'month',
    unit: TimeUnit.Months,
  },
];

function DurationSelect() {
  const { t } = useTranslation();
  const { onDurationInput } = useTwapSwapActionHandlers();
  const { duration } = useTwapContext().derivedSwapValues;

  return (
    <Section
      tootlip={t('expiryTooltip')}
      title={t('expiry')}
      className='TwapDurationSelect'
    >
      <Box className='TwapDurationSelectButtons'>
        {resolutions
          .filter((it) => it.unit !== TimeUnit.Minutes)
          .map((option, index) => {
            const selected = duration.unit * duration.value === option.unit * 1;
            return (
              <SelectorButton
                key={index}
                selected={selected}
                onClick={() => onDurationInput({ unit: option.unit, value: 1 })}
              >
                1 <span>{t(option.label)}</span>
              </SelectorButton>
            );
          })}
      </Box>
    </Section>
  );
}

const FillDelay = () => {
  const { fillDelay } = useTwapContext().derivedSwapValues;
  const onChange = useTwapSwapActionHandlers().onFillDelayInput;
  return (
    <Section
      className='TwapFillDelaySelect'
      title='Every'
      tootlip='The estimated time that will elapse between each trade in your order. Note that as this time includes an allowance of two minutes for bidder auction and block settlement, which cannot be predicted exactly, actual time may vary.'
    >
      <SectionInput>
        <NumericalInput
          value={fillDelay.value}
          align='left'
          color='secondary'
          placeholder='0.00'
          onUserInput={(val) => {
            onChange({ ...fillDelay, value: Number(val) });
          }}
        />
        <ResolutionSelect duration={fillDelay} onChange={onChange} />
      </SectionInput>
    </Section>
  );
};

const ResolutionSelect = ({
  duration,
  onChange,
}: {
  duration: TimeDuration;
  onChange: (value: TimeDuration) => void;
}) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const onOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    },
    [setAnchorEl],
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, [setAnchorEl]);

  const handleMenuItemClick = useCallback(
    (unit: TimeUnit) => {
      onChange({ ...duration, unit });
      handleClose();
    },
    [duration, onChange, handleClose],
  );

  const selected = useMemo(
    () => resolutions.find((option) => option.unit === duration.unit),
    [duration],
  );

  return (
    <Box>
      <button onClick={onOpen} className='TwapResolutionButton'>
        <p style={{ fontSize: 13 }}>{t(selected?.label || 'minutes')}</p>
        <KeyboardArrowDown />
      </button>
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
        {resolutions.map((option) => {
          const selected = duration.unit === option.unit;

          return (
            <MenuItem
              style={{ textTransform: 'capitalize' }}
              className={`swap-menu-item ${
                selected ? 'swap-menu-item-selected' : ''
              }`}
              key={option.unit}
              disabled={selected}
              selected={selected}
              onClick={(event) => handleMenuItemClick(option.unit)}
            >
              {t(option.label)}
              {selected && <Box ml={5} className='selectedMenuDot' />}
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
};

export const TwapInputs = () => {
  const isLimitPanel = useTwapContext().isLimitPanel;

  if (isLimitPanel) {
    return (
      <Box className='TwapInputs'>
        <DurationSelect />
      </Box>
    );
  }

  return (
    <Box className='TwapInputs'>
      <Box style={{ display: 'flex', gap: 2 }}>
        <FillDelay />
        <Chunks />
      </Box>
      <ChunkSize />
    </Box>
  );
};

export function LimitPriceWarning() {
  const { isMarketOrder } = useTwapContext();
  if (isMarketOrder) return null;
  return (
    <Card className='TwapLimitPriceWarning'>
      <ReportProblemIcon />
      <p>
        Limit orders may not execute when the token's price is equal or close to
        the limit price, due to gas and standard swap fees.{' '}
        <a href={TWAP_FAQ} target='_blank' rel='noreferrer'>
          Learn more
        </a>
      </p>
    </Card>
  );
}

export function SelectorButton({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`TwapSelectorButton ${
        selected ? 'TwapSelectorButtonSelected' : ''
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
