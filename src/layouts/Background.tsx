import React from 'react';
import { Box } from '@material-ui/core';
import { useLocation } from 'react-router-dom';
import HeroBkg from 'assets/images/banner.webp';
import HeroBkg2 from 'assets/images/banner2.webp';
import layer from 'assets/images/layer1.png';
import layer2 from 'assets/images/BottomWave.png';
import layer3 from 'assets/images/layer3.png';

const Background: React.FC<{ fallback: boolean | undefined }> = ({
  fallback = false,
}) => {
  const { pathname } = useLocation();
  const showDefaultBG = fallback || pathname !== '/swap';
  return (
    <Box className={`heroBkg ${pathname === '/swap' ? 'isSwap' : ''}`}>
      {showDefaultBG && (
        <img
          className={showDefaultBG ? '' : 'hidden'}
          src={HeroBkg}
          alt='Hero Background'
          style={{ maxWidth: '1440px', position: 'absolute', right: 0 }}
        />
      )}
      {pathname === '/swap' && (
        <img
          src={HeroBkg2}
          alt='Hero Background'
          style={{ maxWidth: '1440px', position: 'absolute', left: 0 }}
        />
      )}
      {/* <img
        className={showDefaultBG ? '' : 'hidden'}
        src={defaultHeroBkg}
        alt='Hero Background'
      /> */}
      {pathname !== '/swap' && (
        <img
          src={layer}
          alt='layer'
          style={{ position: 'absolute', left: 0 }}
        />
      )}
      {pathname !== '/swap' && (
        <>
          <img
            src={layer2}
            alt='wave'
            style={{
              position: 'absolute',
              top: '42%',
              left: 0,
            }}
          />
          <img
            src={layer2}
            alt='layer 3'
            style={{
              position: 'absolute',
              top: '72%',
              left: 0,
            }}
          />
        </>
      )}
      {/* <img src={layer} alt='layer' /> */}
      {/* <img src={layer2} alt='layer2' /> */}
    </Box>
  );
};

export default React.memo(Background);
