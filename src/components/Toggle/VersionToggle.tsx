import React, { useEffect } from 'react';
import NewTag from 'assets/images/NewTag.png';
import { Box } from '@material-ui/core';
import { useTranslation } from 'react-i18next';
import { useHistory, useParams } from 'react-router-dom';
import './index.scss';
import { useIsLpLock, useIsV2, useIsV4 } from 'state/application/hooks';
import { NEW_QUICK_ADDRESS } from 'constants/v3/addresses';
import { useActiveWeb3React, useAnalyticsVersion } from 'hooks';
import { getConfig } from 'config/index';

const VersionToggle: React.FC = () => {
  const { t } = useTranslation();
  const { updateIsV2 } = useIsV2();
  const { updateIsV4 } = useIsV4();
  const { isLpLock, updateIsLpLock } = useIsLpLock();
  const { chainId } = useActiveWeb3React();
  const config = getConfig(chainId);
  const v2Available = config['v2'];
  const v3Available = config['v3'];
  const v4Available = config['v4'];
  const lHAnalyticsAvailable = config['analytics']['liquidityHub'];
  const singleTokenEnabled = config['ichi']['available'];
  const lpLockEnabled = config['lpLock']['available'];
  const params: any = useParams();
  const history = useHistory();
  const isAnalyticsPage = history.location.pathname.includes('/analytics');
  const isPoolPage = history.location.pathname.includes('/pools');
  const analyticsVersion = useAnalyticsVersion(); // TODO: change default version in useAnalyticsVersion if it's needed to show total and v2
  const version =
    params && params.version
      ? params.version
      : isAnalyticsPage
      ? analyticsVersion
      : 'v3';

  // Hide v2 and total tab for now
  const hideV2 = true; // TODO: false to show v2
  const hideTotal = true; // TODO: false to show total

  useEffect(() => {
    updateIsV2(version === 'v2');
    updateIsLpLock(version === 'lpLocker');
    updateIsV4(version === 'v4');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const redirectWithVersion = (version: string) => {
    const versionParam = params ? params.version : undefined;
    const currencyIdAParam = params ? params.currencyIdA : undefined;
    const currencyIdBParam = params ? params.currencyIdB : undefined;
    if (versionParam !== version) {
      const redirectPathName = versionParam
        ? history.location.pathname.replace('/' + versionParam, `/${version}`)
        : history.location.pathname +
          (history.location.pathname.includes('/add')
            ? (currencyIdAParam ? '' : `/ETH`) +
              (currencyIdBParam ? '' : `/${NEW_QUICK_ADDRESS}`)
            : '') +
          `${history.location.pathname.endsWith('/') ? '' : '/'}${version}`;
      history.push(
        redirectPathName +
          (version !== 'singleToken' &&
          versionParam !== 'singleToken' &&
          history.location.pathname.includes('/pools')
            ? history.location.search
            : ''),
      );
    }
  };

  return (
    <Box className='version-toggle-container'>
      {!hideV2 && v2Available && (
        <Box
          className={version === 'v2' ? 'version-toggle-active' : ''}
          onClick={() => {
            redirectWithVersion('v2');
          }}
        >
          <small style={{ lineHeight: 5.85, fontSize: '13px' }}>
            {t('V2')}
          </small>
        </Box>
      )}

      {v3Available && (
        <Box
          className={version === 'v3' ? 'version-toggle-active' : ''}
          onClick={() => {
            redirectWithVersion('v3');
          }}
        >
          <small style={{ lineHeight: 5.85, fontSize: '13px' }}>
            {t('V3')}
          </small>
        </Box>
      )}

      {v4Available && (
        <Box
          className={version === 'v4' ? 'version-toggle-active' : ''}
          onClick={() => {
            redirectWithVersion('v4');
          }}
        >
          <small style={{ lineHeight: 5.85, fontSize: '13px' }}>
            {t('V4')}
          </small>
        </Box>
      )}
      {/* {isPoolPage && singleTokenEnabled && (
        <Box
          className={version === 'singleToken' ? 'version-toggle-active' : ''}
          onClick={() => {
            redirectWithVersion('singleToken');
          }}
        >
          <small>{t('singleToken')}</small>
        </Box>
      )} */}
      {isPoolPage && lpLockEnabled && (
        <Box
          className={isLpLock ? 'version-toggle-active' : ''}
          onClick={() => {
            redirectWithVersion('lpLocker');
          }}
        >
          <small>{t('liquidityLocker')}</small>
          <img src={NewTag} alt='new feature' width={46} />
        </Box>
      )}

      {isAnalyticsPage && (
        <>
          {lHAnalyticsAvailable &&
            !history.location.pathname.includes('/token') &&
            !history.location.pathname.includes('/pairs') && (
              <Box
                className={
                  version === 'liquidityhub' ? 'version-toggle-active' : ''
                }
                onClick={() => {
                  redirectWithVersion('liquidityhub');
                }}
              >
                <small>{t('liquidityHub')}</small>
              </Box>
            )}
          {!hideTotal && (
            <Box
              className={version === 'total' ? 'version-toggle-active' : ''}
              onClick={() => {
                redirectWithVersion('total');
              }}
            >
              <small>{t('total')}</small>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default VersionToggle;
