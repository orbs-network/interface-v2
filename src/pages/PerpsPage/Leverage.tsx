import React, { useEffect, useMemo, useState } from 'react';
import { Check, KeyboardArrowDown, KeyboardArrowUp } from '@material-ui/icons';
import { useActiveWeb3React } from 'hooks';
import {
  useAccount,
  useChains,
  useCollateral,
  useDeposit,
  useOrderEntry,
  usePositionStream,
} from '@orderly.network/hooks';
import AssetModal from '../../components/AssetModal';
import {
  AccountStatusEnum,
  OrderEntity,
  OrderSide,
  OrderType,
} from '@orderly.network/types';
import AccountModal from '../../components/AccountModal';
import { Box, Button, useMediaQuery, useTheme } from '@material-ui/core';
import { ColoredSlider, ToggleSwitch } from 'components';
import { useTranslation } from 'react-i18next';
import { useWalletModalToggle } from 'state/application/hooks';
import { formatNumber } from 'utils';
import { formatDecimalInput } from 'utils/numbers';
import OrderConfirmModal from './OrderConfirmModal';
import { useQuery } from '@tanstack/react-query';

type Inputs = {
  side: OrderSide;
  order_type: OrderType;
  order_price: string;
  order_quantity: string;
  order_symbol: string;
};

function getInput(
  data: Inputs,
  reduce_only?: boolean,
  orderHidden?: boolean,
  otherOrderType?: OrderType,
): OrderEntity {
  return {
    symbol: data.order_symbol,
    side: data.side,
    order_type: otherOrderType ?? data.order_type,
    order_price: data.order_price,
    order_quantity: data.order_quantity,
    reduce_only,
    visible_quantity: orderHidden ? 0 : undefined,
  };
}

export const Leverage: React.FC<{ perpToken: string; orderItem: number[] }> = ({
  perpToken,
  orderItem,
}) => {
  const { t } = useTranslation();
  const [data] = usePositionStream(perpToken);

  const { breakpoints } = useTheme();
  const isMobile = useMediaQuery(breakpoints.down('sm'));

  const [reducedOnly, setReducedOnly] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const otherOrderTypes = [
    { id: OrderType.POST_ONLY, text: 'Post Only' },
    { id: OrderType.IOC, text: 'IOC' },
    { id: OrderType.FOK, text: 'FOK' },
  ];
  const [orderType, setOrderType] = useState<OrderType>(OrderType.LIMIT);
  const [otherOrderType, setOtherOrderType] = useState<OrderType | undefined>(
    undefined,
  );
  const [orderConfirm, setOrderConfirm] = useState(false);
  const [orderHidden, setOrderHidden] = useState(false);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const { account: quickSwapAccount, library, chainId } = useActiveWeb3React();
  const [chains] = useChains('mainnet');
  const chainData = chains.find(
    (item) => item.network_infos.chain_id === chainId,
  );

  const { account, state } = useAccount();
  const token = useMemo(() => {
    return chainData ? chainData.token_infos[0] : undefined;
  }, [chainData]);
  const quoteToken = perpToken.split('_')[1] ?? 'ETH';

  const deposit = useDeposit({
    address: token?.address,
    decimals: token?.decimals,
    srcToken: token?.symbol,
    srcChainId: Number(chainId),
  });

  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const collateral = useCollateral();
  const [order, setOrder] = useState<Inputs>({
    order_price: '0',
    order_quantity: '0',
    order_type: OrderType.LIMIT,
    side: OrderSide.BUY,
    order_symbol: perpToken,
  });

  const selectedOrderPrice = orderItem[0];
  const selectedOrderQuantity = orderItem[1];
  useEffect(() => {
    const orderToSelect = order;
    if (selectedOrderPrice) {
      orderToSelect.order_price = selectedOrderPrice.toString();
    }
    if (selectedOrderQuantity) {
      orderToSelect.order_quantity = selectedOrderQuantity.toString();
    }
    setOrder(orderToSelect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderPrice, selectedOrderQuantity]);

  const { onSubmit, helper, maxQty, markPrice } = useOrderEntry(
    {
      symbol: perpToken,
      side: order.side,
      order_type: otherOrderType ?? order.order_type,
      order_price: order.order_price,
      order_quantity: order.order_quantity,
      reduce_only: reducedOnly,
      visible_quantity: orderHidden ? 0 : undefined,
    },
    { watchOrderbook: true },
  );

  const { isLoading: orderFilterLoading, data: orderFilter } = useQuery({
    queryKey: ['orderly-filter', perpToken],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.REACT_APP_ORDERLY_API_URL}/v1/public/info/${perpToken}`,
      );
      const data = await res.json();
      return data?.data ?? null;
    },
  });

  const { data: orderValidation } = useQuery({
    queryKey: [
      'orderly-order-validation',
      order,
      reducedOnly,
      orderHidden,
      otherOrderType,
    ],
    queryFn: async () => {
      const validation = await helper.validator(
        getInput(order, reducedOnly, orderHidden, otherOrderType),
      );
      return validation;
    },
  });

  useEffect(() => {
    if (!library || !quickSwapAccount) return;
    account.setAddress(quickSwapAccount, {
      provider: library.provider,
      chain: {
        id: chainId,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickSwapAccount, chainId]);

  useEffect(() => {
    if (state.status === AccountStatusEnum.EnableTrading) {
      setAccountModalOpen(false);
    }
  }, [state.status]);

  const orderValue =
    (orderType === OrderType.LIMIT ? Number(order.order_price) : markPrice) *
    Number(order.order_quantity);

  const [totalValue, setTotalValue] = useState('');

  const buttonDisabled =
    state.status === AccountStatusEnum.EnableTrading &&
    (orderFilterLoading ||
      (orderValidation && Object.values(orderValidation).length > 0) ||
      orderValue < 10 ||
      loading);

  const buttonText = useMemo(() => {
    if (!quickSwapAccount) return t('connectWallet');
    if (state.status === AccountStatusEnum.EnableTrading) {
      if (orderValidation && Object.values(orderValidation).length > 0) {
        const validationErrors: any[] = Object.values(orderValidation);
        return validationErrors[0].message;
      } else if (orderValue < 10) {
        return 'The order value should be greater or equal to 10';
      } else if (loading) {
        return t('creatingOrder');
      }
      return t('createOrder');
    }
    return t('signIn');
  }, [loading, orderValidation, orderValue, quickSwapAccount, state.status, t]);

  const toggleWalletModal = useWalletModalToggle();

  const quantityPercent =
    maxQty > 0 ? (Number(order.order_quantity) / maxQty) * 100 : 0;

  return (
    <>
      <Box padding='15px 10px'>
        {!isMobile && (
          <Box
            className='flex items-center justify-between border-bottom'
            gridGap={8}
            mb={2}
            pb={2}
          >
            <Box>
              <p className='span text-secondary'>{t('totalWalletBalance')} </p>
              <p className='span'>
                {formatNumber(deposit?.balance)}{' '}
                <span className='text-secondary'>{token?.symbol}</span>
              </p>
              <Box mt={1}>
                <p className='span text-secondary'>
                  {t('totalTradingBalance')}{' '}
                </p>
                <p className='span'>
                  {formatNumber(collateral.availableBalance)}{' '}
                  <span className='text-secondary'>{token?.symbol}</span>
                </p>
              </Box>
            </Box>
            <Button
              className='leverageManageButton'
              disabled={!quickSwapAccount}
              onClick={() => {
                setModalOpen(true);
              }}
            >
              {t('deposit')}
            </Button>
          </Box>
        )}
        <Box pb={2} mb={2} className='border-bottom flex flex-col' gridGap={12}>
          <Box className='leverageGradient' />
          <Box className='flex justify-between' gridGap={8}>
            <Box>
              <p className='span text-secondary'>{t('accountLeverage')}</p>
              <p className='span'>
                {isNaN(state.leverage) ? 0 : state.leverage}
              </p>
            </Box>
            <Box textAlign='right'>
              <p className='span text-secondary'>{t('marginRatio')}</p>
              <p className='span'>{formatNumber(data.totalUnrealizedROI)}%</p>
            </Box>
          </Box>
        </Box>
        <Box className='leverageTypesWrapper' gridGap={2}>
          <Box
            onClick={() => setOrder({ ...order, side: OrderSide.BUY })}
            className={
              order.side === OrderSide.BUY ? 'bg-primary' : 'bg-palette'
            }
          >
            <span
              className={
                order.side === OrderSide.BUY ? 'text-white' : 'text-secondary'
              }
            >
              {t('buy')}/{t('long')}
            </span>
          </Box>
          <Box
            onClick={() => setOrder({ ...order, side: OrderSide.SELL })}
            className={
              order.side === OrderSide.SELL ? 'bg-primary' : 'bg-palette'
            }
          >
            <span
              className={
                order.side === OrderSide.SELL ? 'text-white' : 'text-secondary'
              }
            >
              {t('sell')}/{t('short')}
            </span>
          </Box>
        </Box>
        <Box className='flex' gridGap={16} mt={2}>
          <p
            className={`span cursor-pointer ${
              orderType === 'LIMIT' ? '' : 'text-secondary'
            }`}
            onClick={() => {
              setOrderType(OrderType.LIMIT);
              setOrder({ ...order, order_type: OrderType.LIMIT });
            }}
          >
            {t('limit')}
          </p>
          <p
            className={`span cursor-pointer ${
              orderType === OrderType.MARKET ? '' : 'text-secondary'
            }`}
            onClick={() => {
              setOrderType(OrderType.MARKET);
              setOrder({ ...order, order_type: OrderType.MARKET });
            }}
          >
            {t('market')}
          </p>
        </Box>
        {orderType === 'LIMIT' && (
          <Box className='leverageInputWrapper' mt={2}>
            <span className='text-secondary'>{t('price')}</span>
            <Box gridGap={5}>
              <input
                placeholder='0'
                disabled={state.status !== AccountStatusEnum.EnableTrading}
                value={order.order_price}
                onChange={(e) => {
                  const value = formatDecimalInput(
                    e.target.value,
                    orderFilter && orderFilter.quote_tick > 0
                      ? Math.log10(1 / Number(orderFilter.quote_tick))
                      : undefined,
                  );
                  if (value !== null) {
                    setOrder({
                      ...order,
                      order_price: value,
                    });
                    const totalVal = formatDecimalInput(
                      (Number(value) * Number(order.order_quantity)).toString(),
                      orderFilter && orderFilter.base_tick > 0
                        ? Math.log10(1 / Number(orderFilter.base_tick))
                        : undefined,
                    );
                    if (totalVal !== null) {
                      setTotalValue(totalVal);
                    }
                  }
                }}
              />
              <span className='text-secondary'>{token?.symbol}</span>
            </Box>
          </Box>
        )}
        <Box className='leverageInputWrapper' mt={2}>
          <span className='text-secondary'>{t('quantity')}</span>
          <Box gridGap={5}>
            <input
              placeholder='0'
              value={order.order_quantity}
              onChange={(e) => {
                const value = formatDecimalInput(
                  e.target.value,
                  orderFilter && orderFilter.base_tick > 0
                    ? Math.log10(1 / Number(orderFilter.base_tick))
                    : undefined,
                );
                if (value !== null) {
                  setOrder({
                    ...order,
                    order_quantity: value,
                  });
                  const orderPrice =
                    orderType === OrderType.LIMIT
                      ? Number(order.order_price)
                      : markPrice;
                  const totalVal = formatDecimalInput(
                    (Number(value) * orderPrice).toString(),
                    orderFilter && orderFilter.base_tick > 0
                      ? Math.log10(1 / Number(orderFilter.base_tick))
                      : undefined,
                  );
                  if (totalVal !== null) {
                    setTotalValue(totalVal);
                  }
                }
              }}
              disabled={state.status !== AccountStatusEnum.EnableTrading}
            />
            <span className='text-secondary'>{quoteToken}</span>
          </Box>
        </Box>
        <Box className='leverageSquareWrapper' margin='16px 4px 16px 12px'>
          {[0, 1, 2, 3, 4].map((item) => (
            <Box
              key={item}
              className={`leverageSquare
                  ${quantityPercent > item * 25 ? ' filledSquare' : ''}`}
              left={`calc(${(item / 4) * 100}% - 8px)`}
            />
          ))}
          <ColoredSlider
            min={0}
            max={100}
            step={1}
            value={quantityPercent}
            handleChange={(_, percent) => {
              const value = formatDecimalInput(
                ((Number(percent) / 100) * maxQty).toString(),
                orderFilter && orderFilter.base_tick > 0
                  ? Math.log10(1 / Number(orderFilter.base_tick))
                  : undefined,
              );
              if (value !== null) {
                setOrder({
                  ...order,
                  order_quantity: value,
                });
                const orderPrice =
                  orderType === OrderType.LIMIT
                    ? Number(order.order_price)
                    : markPrice;
                const totalVal = formatDecimalInput(
                  (Number(value) * orderPrice).toString(),
                  orderFilter && orderFilter.base_tick > 0
                    ? Math.log10(1 / Number(orderFilter.base_tick))
                    : undefined,
                );
                if (totalVal !== null) {
                  setTotalValue(totalVal);
                }
              }
            }}
          />
        </Box>
        <Box className='flex justify-between'>
          <p
            className={`span ${
              order.side === 'BUY' ? 'text-success' : 'text-error'
            }`}
          >
            {formatNumber(quantityPercent)}%
          </p>
          <p
            className='span text-secondary cursor-pointer'
            onClick={() => {
              const value = formatDecimalInput(
                maxQty.toString(),
                Math.log10(1 / Number(orderFilter.base_tick)),
              );
              if (value !== null) {
                setOrder({
                  ...order,
                  order_quantity: value,
                });
                const orderPrice =
                  orderType === OrderType.LIMIT
                    ? Number(order.order_price)
                    : markPrice;
                const totalVal = formatDecimalInput(
                  (Number(value) * orderPrice).toString(),
                  orderFilter && orderFilter.base_tick > 0
                    ? Math.log10(1 / Number(orderFilter.base_tick))
                    : undefined,
                );
                if (totalVal !== null) {
                  setTotalValue(totalVal);
                }
              }
            }}
          >
            {order.side === 'BUY' ? t('maxBuy') : t('maxSell')}{' '}
            <span
              className={order.side === 'BUY' ? 'text-success' : 'text-error'}
            >
              {formatNumber(maxQty)}
            </span>
          </p>
        </Box>
        <Box className='leverageInputWrapper flex justify-between' my={2}>
          <span className='text-secondary'>{t('total')}</span>
          <Box gridGap={5}>
            <input
              placeholder='0'
              value={totalValue}
              onChange={(e) => {
                const value = formatDecimalInput(
                  e.target.value,
                  orderFilter && orderFilter.base_tick > 0
                    ? Math.log10(1 / Number(orderFilter.base_tick))
                    : undefined,
                );
                if (value !== null) {
                  setTotalValue(value);
                  const orderPrice =
                    orderType === OrderType.LIMIT
                      ? Number(order.order_price) > 0
                        ? Number(order.order_price)
                        : markPrice
                      : markPrice;
                  const orderQuantity = formatDecimalInput(
                    (Number(value) / orderPrice).toString(),
                    orderFilter && orderFilter.base_tick > 0
                      ? Math.log10(1 / Number(orderFilter.base_tick))
                      : undefined,
                  );
                  if (orderQuantity !== null) {
                    setOrder({
                      ...order,
                      order_quantity: orderQuantity,
                    });
                  }
                }
              }}
              disabled={state.status !== AccountStatusEnum.EnableTrading}
            />
            <span className='text-secondary'>{token?.symbol}</span>
          </Box>
        </Box>
        <Box
          className='border-top flex justify-between items-center'
          padding='16px 0'
        >
          <Box className='flex items-center' gridGap={8}>
            <ToggleSwitch
              toggled={reducedOnly}
              onToggle={() => {
                setReducedOnly(!reducedOnly);
              }}
            />
            <span className='text-secondary'>{t('reduceOnly')}</span>
          </Box>
          <Box
            className='leverageDetailsArrow'
            onClick={() => setOpenDetails(!openDetails)}
          >
            {openDetails ? (
              <KeyboardArrowUp fontSize='small' className='text-secondary' />
            ) : (
              <KeyboardArrowDown fontSize='small' className='text-secondary' />
            )}
          </Box>
        </Box>
        {openDetails && (
          <Box pb={2}>
            {orderType === OrderType.LIMIT && (
              <Box className='flex items-center' mb={2} gridGap={12}>
                {otherOrderTypes.map((item) => (
                  <Box
                    key={item.id}
                    className='cursor-pointer'
                    onClick={() => setOtherOrderType(item.id)}
                  >
                    <Box className='flex items-center' gridGap={5}>
                      <Box className='radio-wrapper'>
                        {item.id === otherOrderType && <Box />}
                      </Box>
                      <small
                        className={
                          item.id === otherOrderType ? '' : 'text-secondary'
                        }
                      >
                        {item.text}
                      </small>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            <Box className='flex items-center' gridGap={12}>
              <Box
                className='flex items-center cursor-pointer'
                gridGap={5}
                onClick={() => setOrderConfirm(!orderConfirm)}
              >
                <Box
                  className={`checkbox-wrapper ${
                    orderConfirm ? 'checkbox-wrapper-filled' : ''
                  }`}
                >
                  {orderConfirm && (
                    <Check fontSize='small' className='text-bgColor' />
                  )}
                </Box>
                <small className='text-secondary'>Order confirm</small>
              </Box>
              <Box
                className='flex items-center cursor-pointer'
                gridGap={5}
                onClick={() => setOrderHidden(!orderHidden)}
              >
                <Box
                  className={`checkbox-wrapper ${
                    orderHidden ? 'checkbox-wrapper-filled' : ''
                  }`}
                >
                  {orderHidden && (
                    <Check fontSize='small' className='text-bgColor' />
                  )}
                </Box>
                <small className='text-secondary'>Hidden</small>
              </Box>
            </Box>
          </Box>
        )}
        <Button
          className='leverageSubmitButton'
          disabled={buttonDisabled}
          onClick={async () => {
            if (!quickSwapAccount) {
              toggleWalletModal();
            } else if (state.status === AccountStatusEnum.EnableTrading) {
              if (orderConfirm) {
                setOpenConfirmModal(true);
              } else {
                try {
                  setLoading(true);
                  await onSubmit(
                    getInput(order, reducedOnly, orderHidden, otherOrderType),
                  );
                  setLoading(false);
                } catch {
                  setLoading(false);
                }
              }
            } else {
              setAccountModalOpen(true);
            }
          }}
        >
          {buttonText}
        </Button>
      </Box>
      <AssetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        modalType={'deposit'}
      />
      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
      />
      <OrderConfirmModal
        open={openConfirmModal}
        onClose={() => setOpenConfirmModal(false)}
        order={getInput(order, reducedOnly, orderHidden, otherOrderType)}
        orderValue={orderValue}
        tokenSymbol={token?.symbol}
        onSubmit={onSubmit}
      />
    </>
  );
};
