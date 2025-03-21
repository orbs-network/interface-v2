import { Interface } from '@ethersproject/abi';
import {
  BigintIsh,
  Currency,
  CurrencyAmount,
  Percent,
  TradeType,
  validateAndParseAddress,
} from '@uniswap/sdk-core';
import invariant from 'tiny-invariant';
import { Trade } from './trade';
import { PermitOptions, SelfPermit } from './selfPermit';
import { MethodParameters, toHex } from './utils/calldata';
import abi from 'constants/abis/v3/swap-router.json';
import abiV4 from 'constants/abis/v4/swap-router.json';
import uniV3ABI from 'constants/abis/uni-v3/swap-router.json';
import { ADDRESS_ZERO } from 'v3lib/utils/v3constants';
import { encodeRouteToPath } from 'v3lib/utils/encodeRouteToPath';

export interface FeeOptions {
  /**
   * The percent of the output that will be taken as a fee.
   */
  fee: Percent;

  /**
   * The recipient of the fee.
   */
  recipient: string;
}

/**
 * Options for producing the arguments to send calls to the router.
 */
export interface SwapOptions {
  /**
   * How much the execution price is allowed to move unfavorably from the trade execution price.
   */
  slippageTolerance: Percent;

  /**
   * The account that should receive the output.
   */
  recipient: string;

  /**
   * When the transaction expires, in epoch seconds.
   */
  deadline: BigintIsh;

  /**
   * Deflationary token.
   */
  feeOnTransfer: boolean;

  /**
   * The optional permit parameters for spending the input.
   */
  inputTokenPermit?: PermitOptions;

  /**
   * The optional price limit for the trade.
   */
  sqrtPriceLimitX96?: BigintIsh;

  /**
   * Optional information for taking a fee on output.
   */
  fee?: FeeOptions;

  isUni?: boolean;

  isV4?: boolean;
}

/**
 * Represents the Uniswap V2 SwapRouter, and has static methods for helping execute trades.
 */
export abstract class SwapRouter extends SelfPermit {
  public static INTERFACE: Interface = new Interface(abi);
  public static INTERFACEV4: Interface = new Interface(abiV4); // algebra-router
  public static UNIV3INTERFACE: Interface = new Interface(uniV3ABI);

  /**
   * Cannot be constructed.
   */
  private constructor() {
    super();
  }

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
   * @param trade to produce call parameters for
   * @param options options for the call parameters
   */
  public static swapCallParameters(
    trades:
      | Trade<Currency, Currency, TradeType>
      | Trade<Currency, Currency, TradeType>[],
    options: SwapOptions,
  ): MethodParameters {
    if (!Array.isArray(trades)) {
      trades = [trades];
    }

    const sampleTrade = trades[0];
    const tokenIn = sampleTrade.inputAmount.currency.wrapped;
    const tokenOut = sampleTrade.outputAmount.currency.wrapped;

    // All trades should have the same starting and ending token.
    invariant(
      trades.every((trade) =>
        trade.inputAmount.currency.wrapped.equals(tokenIn),
      ),
      'TOKEN_IN_DIFF',
    );
    invariant(
      trades.every((trade) =>
        trade.outputAmount.currency.wrapped.equals(tokenOut),
      ),
      'TOKEN_OUT_DIFF',
    );

    const calldatas: string[] = [];

    const ZERO_IN: CurrencyAmount<Currency> = CurrencyAmount.fromRawAmount(
      trades[0].inputAmount.currency,
      0,
    );
    const ZERO_OUT: CurrencyAmount<Currency> = CurrencyAmount.fromRawAmount(
      trades[0].outputAmount.currency,
      0,
    );

    const totalAmountOut: CurrencyAmount<Currency> = trades.reduce(
      (sum, trade) =>
        sum.add(trade.minimumAmountOut(options.slippageTolerance)),
      ZERO_OUT,
    );

    // flag for whether a refund needs to happen
    const mustRefund =
      sampleTrade.inputAmount.currency.isNative &&
      sampleTrade.tradeType === TradeType.EXACT_OUTPUT;
    const inputIsNative = sampleTrade.inputAmount.currency.isNative;
    // flags for whether funds should be send first to the router
    const outputIsNative = sampleTrade.outputAmount.currency.isNative;
    const routerMustCustody = outputIsNative || !!options.fee;

    const totalValue: CurrencyAmount<Currency> = inputIsNative
      ? trades.reduce(
          (sum, trade) =>
            sum.add(trade.maximumAmountIn(options.slippageTolerance)),
          ZERO_IN,
        )
      : ZERO_IN;

    // encode permit if necessary
    if (options.inputTokenPermit) {
      invariant(sampleTrade.inputAmount.currency.isToken, 'NON_TOKEN_PERMIT');
      calldatas.push(
        SwapRouter.encodePermit(
          sampleTrade.inputAmount.currency,
          options.inputTokenPermit,
        ),
      );
    }

    const recipient: string = validateAndParseAddress(options.recipient);
    const deadline = toHex(options.deadline);

    for (const trade of trades) {
      for (const { route, inputAmount, outputAmount } of trade.swaps) {
        const amountIn: string = toHex(
          trade.maximumAmountIn(options.slippageTolerance, inputAmount)
            .quotient,
        );
        const amountOut: string = toHex(
          trade.minimumAmountOut(options.slippageTolerance, outputAmount)
            .quotient,
        );

        // flag for whether the trade is single hop or not
        const singleHop = route.pools.length === 1;

        if (singleHop) {
          if (trade.tradeType === TradeType.EXACT_INPUT) {
            const exactInputSingleParams = options.isV4
              ? {
                  tokenIn: route.tokenPath[0].address,
                  tokenOut: route.tokenPath[1].address,
                  deployer: ADDRESS_ZERO,
                  recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
                  deadline,
                  amountIn,
                  amountOutMinimum: amountOut,
                  limitSqrtPrice: toHex(options.sqrtPriceLimitX96 ?? 0),
                }
              : {
                  tokenIn: route.tokenPath[0].address,
                  tokenOut: route.tokenPath[1].address,
                  fee: route.pools[0].fee,
                  recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
                  deadline,
                  amountIn,
                  amountOutMinimum: amountOut,
                  sqrtPriceLimitX96: toHex(options.sqrtPriceLimitX96 ?? 0),
                };
            calldatas.push(
              options.isUni
                ? SwapRouter.UNIV3INTERFACE.encodeFunctionData(
                    'exactInputSingle',
                    [exactInputSingleParams],
                  )
                : options.isV4
                ? SwapRouter.INTERFACEV4.encodeFunctionData(
                    options.feeOnTransfer && !inputIsNative
                      ? 'exactInputSingleSupportingFeeOnTransferTokens'
                      : 'exactInputSingle',
                    [exactInputSingleParams],
                  )
                : SwapRouter.INTERFACE.encodeFunctionData(
                    options.feeOnTransfer && !inputIsNative
                      ? 'exactInputSingleSupportingFeeOnTransferTokens'
                      : 'exactInputSingle',
                    [exactInputSingleParams],
                  ),
            );
          } else {
            const exactOutputSingleParams = options.isV4
              ? {
                  tokenIn: route.tokenPath[0].address,
                  tokenOut: route.tokenPath[1].address,
                  deployer: ADDRESS_ZERO,
                  recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
                  deadline,
                  amountOut,
                  amountInMaximum: amountIn,
                  limitSqrtPrice: toHex(options.sqrtPriceLimitX96 ?? 0),
                }
              : {
                  tokenIn: route.tokenPath[0].address,
                  tokenOut: route.tokenPath[1].address,
                  fee: route.pools[0].fee,
                  recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
                  deadline,
                  amountOut,
                  amountInMaximum: amountIn,
                  sqrtPriceLimitX96: toHex(options.sqrtPriceLimitX96 ?? 0),
                };

            calldatas.push(
              options.isUni
                ? SwapRouter.UNIV3INTERFACE.encodeFunctionData(
                    'exactOutputSingle',
                    [exactOutputSingleParams],
                  )
                : options.isV4
                ? SwapRouter.INTERFACEV4.encodeFunctionData(
                    'exactOutputSingle',
                    [exactOutputSingleParams],
                  )
                : SwapRouter.INTERFACE.encodeFunctionData('exactOutputSingle', [
                    exactOutputSingleParams,
                  ]),
            );
          }
        } else {
          invariant(
            options.sqrtPriceLimitX96 === undefined,
            'MULTIHOP_PRICE_LIMIT',
          );

          const path: string = encodeRouteToPath(
            route,
            trade.tradeType === TradeType.EXACT_OUTPUT,
            options.isUni,
            options.isV4,
          );

          if (trade.tradeType === TradeType.EXACT_INPUT) {
            const exactInputParams = {
              path,
              recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
              deadline,
              amountIn,
              amountOutMinimum: amountOut,
            };

            calldatas.push(
              options.isUni
                ? SwapRouter.UNIV3INTERFACE.encodeFunctionData('exactInput', [
                    exactInputParams,
                  ])
                : SwapRouter.INTERFACE.encodeFunctionData('exactInput', [
                    exactInputParams,
                  ]),
            );
          } else {
            const exactOutputParams = {
              path,
              recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
              deadline,
              amountOut,
              amountInMaximum: amountIn,
            };

            calldatas.push(
              route.pools[0].isUni
                ? SwapRouter.UNIV3INTERFACE.encodeFunctionData('exactOutput', [
                    exactOutputParams,
                  ])
                : SwapRouter.INTERFACE.encodeFunctionData('exactOutput', [
                    exactOutputParams,
                  ]),
            );
          }
        }
      }
    }

    // unwrap
    if (routerMustCustody) {
      if (!!options.fee) {
        const feeRecipient: string = validateAndParseAddress(
          options.fee.recipient,
        );
        const fee = toHex(options.fee.fee.multiply(10_000).quotient);
        if (outputIsNative) {
          if (options.isUni) {
            calldatas.push(
              SwapRouter.UNIV3INTERFACE.encodeFunctionData(
                'unwrapWETH9WithFee',
                [toHex(totalAmountOut.quotient), recipient, fee, feeRecipient],
              ),
            );
          } else {
            calldatas.push(
              SwapRouter.INTERFACE.encodeFunctionData(
                'unwrapWNativeTokenWithFee',
                [toHex(totalAmountOut.quotient), recipient, fee, feeRecipient],
              ),
            );
          }
        } else {
          if (options.isUni) {
            calldatas.push(
              SwapRouter.UNIV3INTERFACE.encodeFunctionData(
                'sweepTokenWithFee',
                [
                  sampleTrade.outputAmount.currency.wrapped.address,
                  toHex(totalAmountOut.quotient),
                  recipient,
                  fee,
                  feeRecipient,
                ],
              ),
            );
          } else {
            calldatas.push(
              SwapRouter.INTERFACE.encodeFunctionData('sweepTokenWithFee', [
                sampleTrade.outputAmount.currency.wrapped.address,
                toHex(totalAmountOut.quotient),
                recipient,
                fee,
                feeRecipient,
              ]),
            );
          }
        }
      } else {
        if (options.isUni) {
          calldatas.push(
            SwapRouter.UNIV3INTERFACE.encodeFunctionData('unwrapWETH9', [
              toHex(totalAmountOut.quotient),
              recipient,
            ]),
          );
        } else {
          calldatas.push(
            SwapRouter.INTERFACE.encodeFunctionData('unwrapWNativeToken', [
              toHex(totalAmountOut.quotient),
              recipient,
            ]),
          );
        }
      }
    }

    // refund
    if (mustRefund) {
      if (options.isUni) {
        calldatas.push(
          SwapRouter.UNIV3INTERFACE.encodeFunctionData('refundETH'),
        );
      } else {
        calldatas.push(
          SwapRouter.INTERFACE.encodeFunctionData('refundNativeToken'),
        );
      }
    }

    return {
      calldata:
        calldatas.length === 1
          ? calldatas[0]
          : options.isUni
          ? SwapRouter.UNIV3INTERFACE.encodeFunctionData('multicall', [
              calldatas,
            ])
          : SwapRouter.INTERFACE.encodeFunctionData('multicall', [calldatas]),
      value: toHex(totalValue.quotient),
    };
  }
}
