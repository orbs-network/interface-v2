import useParsedQueryString from 'hooks/useParsedQueryString';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useUserSlippageAuto,
  useUserSlippageTolerance,
} from 'state/user/hooks';

export const SlippageWrapper: React.FC = () => {
  const { t } = useTranslation();
  const parsedQs = useParsedQueryString();
  const swapSlippage = parsedQs.slippage
    ? (parsedQs.slippage as string)
    : undefined;
  const [
    allowedSlippage,
    setUserSlippageTolerance,
  ] = useUserSlippageTolerance();
  const [userSlippageAuto] = useUserSlippageAuto();

  useEffect(() => {
    if (swapSlippage) {
      setUserSlippageTolerance(Number(swapSlippage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapSlippage]);

  return (
    <small className='subtext-color'>
      {userSlippageAuto ? 'Auto' : allowedSlippage / 100 + '%'} {t('slippage')}
    </small>
  );
};
