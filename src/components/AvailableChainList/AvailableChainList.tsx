import { Box, Typography } from '@material-ui/core';
import { getConfig } from 'config/index';
import { SUPPORTED_CHAINIDS } from 'constants/index';
import React from 'react';
import { useTranslation } from 'react-i18next';

const AvailableChainList: React.FC = ({}) => {
  const supportedChains = SUPPORTED_CHAINIDS.filter((chain: any) => {
    const config = getConfig(chain);
    return config && config.visible;
  });
  const { t } = useTranslation();

  return (
    <Box style={{ display: 'flex', gap: '16px' }}>
      <Typography style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
        {t('availableOn')}:
      </Typography>
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        {supportedChains.map((chain: any, index) => {
          const config = getConfig(chain);
          return (
            <Box
              className='networkItemWrapper'
              key={chain}
              style={{
                borderRight:
                  index === supportedChains.length
                    ? 'none'
                    : '2px dashed #1f263d',
                height: '28px',
                width: 'fit-content',
                borderRadius: '0px',
                gap: '4px',
                padding: '0 16px',
              }}
            >
              <Box className='flex items-center'>
                <img
                  src={config['nativeCurrencyImage']}
                  alt='network Image'
                  className='networkIcon'
                />
                <small className='weight-600'>{config['networkName']}</small>
              </Box>
              {/* {isSupportedNetwork && chainId && chainId === chain && (
              <img
                src={ActiveDotImage}
                alt='chain active'
                width={12}
                height={12}
              />
            )} */}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
export default AvailableChainList;
