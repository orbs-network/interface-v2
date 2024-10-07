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
import { KeyboardArrowDown } from '@material-ui/icons';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { TWAP_FAQ } from '../consts';
import useUSDCPrice from 'utils/useUSDCPrice';
import { useTwapContext } from './context';
import { Field } from '../../../../state/swap/actions';

export const Section = ({
  title,
  tootlip,
  children,
}: {
  title: string;
  tootlip?: string;
  children: React.ReactNode;
}) => {
  return (
    <Box className='swapBox bg-secondary4 TwapComponentContainer'>
      <Box mb={1.5} className='flex items-center'>
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
    <Box className={`TwapComponentContainerInput  bg-input1 ${className}`}>
      {children}
    </Box>
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



export const InputsContainer = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 10,
});

export const ChunksSelect = () => {
  const { t } = useTranslation();
  const { onChunksInput } = useTwapSwapActionHandlers();
  const { chunks } = useTwapContext().derivedSwapValues;

  return (
    <Section
      title='Over'
      tootlip='The total number of individual trades that will be scheduled as part of your order. Note that in limit orders, it is possible that not all scheduled trades will be executed.'
    >
      <SectionInput className='TwapChunkSelect'>
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
      <ChunkSize />
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
    <Box className='TwapChunkSelectSize'>
      {formatNumber(amount?.toExact())} {amount?.currency.symbol} per trade{' '}
      <small>{`($${formatNumber(srcChukAmountUsd)})`}</small>
    </Box>
  );
};

const options: { unit: TimeUnit; value: number; label: string }[] = [
  {
    label: 'day',
    unit: TimeUnit.Days,
    value: 1,
  },
  {
    label: 'week',
    unit: TimeUnit.Days,
    value: 7,
  },
  {
    label: 'month',
    unit: TimeUnit.Days,
    value: 30,
  },
];

export function DurationSelect() {
  const { t } = useTranslation();
  const { onDurationInput } = useTwapSwapActionHandlers();
  const { duration } = useTwapContext().derivedSwapValues;

  return (
    <Box className='TwapDurationSelect'>
      <p className='TwapDurationSelectTitle'>
        {t('expiry')} <QuestionHelper text={t('expiryTooltip')} />
      </p>
      <Box className='TwapDurationSelectButtons'>
        {options.map((option, index) => {
          const selected =
            duration.unit * duration.value === option.unit * option.value;
          return (
            <SelectorButton
              key={index}
              selected={selected}
              onClick={() =>
                onDurationInput({ unit: option.unit, value: option.value })
              }
            >
              1 <span>{t(option.label)}</span>
            </SelectorButton>
          );
        })}
      </Box>
    </Box>
  );
}

export const FillDelaySelect = () => {
  const { fillDelay } = useTwapContext().derivedSwapValues;
  const onChange = useTwapSwapActionHandlers().onFillDelayInput;
  return (
    <Section
      title='Every'
      tootlip='The estimated time that will elapse between each trade in your order. Note that as this time includes an allowance of two minutes for bidder auction and block settlement, which cannot be predicted exactly, actual time may vary.'
    >
     <SectionInput className='TwapFillDelaySelect'>
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

export const FillDelayAndChunks = () => {
  return (
    <Box style={{display:'flex', gap: 10}}>
      <FillDelaySelect />
      <ChunksSelect />
    </Box>
  );
}

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
    () => options.find((option) => option.unit === duration.unit),
    [duration],
  );

  return (
    <Box>
      <Button
        style={{ height: 38, textTransform: 'capitalize' }}
        onClick={onOpen}
        id='swap-button'
        aria-controls={open ? 'swap-menu' : undefined}
        aria-haspopup='true'
        aria-expanded={open ? 'true' : undefined}
        variant='text'
        disableElevation
        endIcon={<KeyboardArrowDown />}
        className={`tab tabMenu`}
      >
        {t(selected?.label || 'minutes')}
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
        {options.map((option, index) => {
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
