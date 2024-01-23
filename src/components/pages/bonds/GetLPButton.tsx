import React, { useState } from 'react';
import {
  dexDisplayAttributes,
  dexToZapMapping,
  LiquidityDex,
  ZapVersion,
} from '@ape.swap/apeswap-lists';
import SoulZapAddLiquidity from './SoulZapAddLiquidity';
import { useActiveWeb3React } from 'hooks';
import { Box, Button } from '@mui/material';
import { useTranslation } from 'next-i18next';
import ZapIcon from 'svgs/ZapIcon.svg';
import Image from 'next/image';

const GetLpButton = ({ bond }: { bond: any }) => {
  // Hooks
  const { chainId, account } = useActiveWeb3React();
  const { t } = useTranslation();

  // Bond Data
  const billType = bond?.billType;
  const lpToken = bond?.lpToken;
  const bondContractAddress = bond?.contractAddress[chainId] || '';

  const liquidityDex =
    lpToken?.liquidityDex?.[chainId] || LiquidityDex.ApeSwapV2;
  const dexToZapMappingAny = dexToZapMapping as any;
  const zapIntoLPVersion = dexToZapMappingAny[liquidityDex]?.[
    chainId
  ] as ZapVersion;

  const shouldSendToExternalLpUrl = zapIntoLPVersion === ZapVersion.External;

  const sendToExternalLpUrl = () => {
    if (lpToken?.getLpUrl?.[chainId]) {
      window.open(lpToken?.getLpUrl?.[chainId], '_blank');
    } else {
      throw new Error('External lp url not found. Please contact support');
    }
  };

  // Modals
  const [openSoulZapAddLiquidity, setOpenSoulZapAddLiquidity] = useState(false);
  const dexDisplayAttributesAny = dexDisplayAttributes as any;

  return (
    <>
      {openSoulZapAddLiquidity && (
        <SoulZapAddLiquidity
          open={openSoulZapAddLiquidity}
          onDismiss={() => setOpenSoulZapAddLiquidity(false)}
          lpAddress={bond?.lpToken?.address?.[chainId]}
          token0={bond?.token?.address?.[chainId]}
          token1={bond?.quoteToken?.address?.[chainId]}
          liquidityDex={liquidityDex}
          lpPrice={bond?.lpPrice}
        />
      )}
      {bond &&
        billType !== 'reserve' &&
        (shouldSendToExternalLpUrl ||
          zapIntoLPVersion === ZapVersion.SoulZap) && (
          <Button
            disabled={!account}
            onClick={() => {
              if (shouldSendToExternalLpUrl) {
                return sendToExternalLpUrl();
              }
              if (zapIntoLPVersion === ZapVersion.SoulZap) {
                return setOpenSoulZapAddLiquidity(true);
              }
            }}
          >
            <Box className='flex items-center' gap='8px'>
              <p>{t('Get LP')}</p>
              {bondContractAddress ===
              '0xdE766645C9b24e87165107714c88400FedA269A3' ? null : !shouldSendToExternalLpUrl ? (
                <ZapIcon />
              ) : (
                <Image
                  src={
                    dexDisplayAttributesAny[
                      lpToken?.liquidityDex?.[chainId] ?? LiquidityDex.ApeSwapV2
                    ].icon ?? ''
                  }
                  width={20}
                  height={20}
                  alt='Dex Icon'
                />
              )}
            </Box>
          </Button>
        )}
    </>
  );
};

export default React.memo(GetLpButton);
