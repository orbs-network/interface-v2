import React, { useState, useMemo, useEffect } from 'react';
import { Box, Divider } from '@material-ui/core';
import { KeyboardArrowDown } from '@material-ui/icons';
import { AlertTriangle } from 'react-feather';
import {
  CustomModal,
  NumericalInput,
  QuestionHelper,
  ToggleSwitch,
} from 'components';
import { useSwapActionHandlers } from 'state/swap/hooks';
import {
  useExpertModeManager,
  useUserTransactionTTL,
  useUserSlippageTolerance,
  useBonusRouterManager,
  useSlippageManuallySet,
  useUserSlippageAuto,
  useUserSingleHopOnly,
  useIsInfiniteApproval,
} from 'state/user/hooks';
import { ReactComponent as CloseIcon } from 'assets/images/CloseIcon.svg';
import 'components/styles/SettingsModal.scss';
import { useTranslation } from 'react-i18next';
import { SLIPPAGE_DEFAULT } from 'state/user/reducer';
import { isMobile } from 'react-device-detect';
import { LiquidityHubSettings } from 'components/Swap/orbs/LiquidityHub/Components';

enum SlippageError {
  InvalidInput = 'InvalidInput',
  RiskyLow = 'RiskyLow',
  RiskyHigh = 'RiskyHigh',
}

enum DeadlineError {
  InvalidInput = 'InvalidInput',
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  defaultSlippage?: number;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  defaultSlippage = 0,
}) => {
  const { t } = useTranslation();
  const [
    userSlippageTolerance,
    setUserslippageTolerance,
  ] = useUserSlippageTolerance();

  const userSlippageIsSet = !!userSlippageTolerance;

  useEffect(() => {
    if (!userSlippageIsSet && defaultSlippage > 0) {
      setUserslippageTolerance(defaultSlippage);
    }
  }, [defaultSlippage, setUserslippageTolerance, userSlippageIsSet]);

  const [
    slippageManuallySet,
    setSlippageManuallySet,
  ] = useSlippageManuallySet();

  const [userSlippageAuto, setUserSlippageAuto] = useUserSlippageAuto();

  const [ttl, setTtl] = useUserTransactionTTL();
  const { onChangeRecipient } = useSwapActionHandlers();
  const [expertMode, toggleExpertMode] = useExpertModeManager();
  const [bonusRouterDisabled, toggleSetBonusRouter] = useBonusRouterManager();
  const [singleHopOnly, setSingleHopOnly] = useUserSingleHopOnly();
  const [isInfiniteApproval, setIsInfiniteApproval] = useIsInfiniteApproval();

  const [slippageInput, setSlippageInput] = useState('');
  const [deadlineInput, setDeadlineInput] = useState('');
  const [expertConfirm, setExpertConfirm] = useState(false);
  const [expertConfirmText, setExpertConfirmText] = useState('');

  const slippageInputIsValid =
    slippageInput === '' ||
    (userSlippageTolerance / 100).toFixed(2) ===
      Number.parseFloat(slippageInput).toFixed(2);
  const deadlineInputIsValid =
    deadlineInput === '' || (ttl / 60).toString() === deadlineInput;

  const slippageError = useMemo(() => {
    if (userSlippageAuto) {
      return undefined;
    }
    if (slippageInput !== '' && !slippageInputIsValid) {
      return SlippageError.InvalidInput;
    } else if (slippageInputIsValid && userSlippageTolerance < 50) {
      return SlippageError.RiskyLow;
    } else if (slippageInputIsValid && userSlippageTolerance > 500) {
      return SlippageError.RiskyHigh;
    } else {
      return undefined;
    }
  }, [
    slippageInput,
    userSlippageTolerance,
    slippageInputIsValid,
    userSlippageAuto,
  ]);

  const slippageAlert =
    !!slippageInput &&
    (slippageError === SlippageError.RiskyLow ||
      slippageError === SlippageError.RiskyHigh);

  const deadlineError = useMemo(() => {
    if (deadlineInput !== '' && !deadlineInputIsValid) {
      return DeadlineError.InvalidInput;
    } else {
      return undefined;
    }
  }, [deadlineInput, deadlineInputIsValid]);

  const parseCustomSlippage = (value: string) => {
    setSlippageInput(value);
    try {
      const valueAsIntFromRoundedFloat = Number.parseInt(
        (Number.parseFloat(value) * 100).toString(),
      );
      if (
        !Number.isNaN(valueAsIntFromRoundedFloat) &&
        valueAsIntFromRoundedFloat < 5000
      ) {
        setUserslippageTolerance(valueAsIntFromRoundedFloat);
        setUserSlippageAuto(false);
        if (userSlippageTolerance !== valueAsIntFromRoundedFloat) {
          setSlippageManuallySet(true);
        }
      }
    } catch {}
  };

  const parseCustomDeadline = (value: string) => {
    setDeadlineInput(value);

    try {
      const valueAsInt: number = Number.parseInt(value) * 60;
      if (!Number.isNaN(valueAsInt) && valueAsInt > 0) {
        setTtl(valueAsInt);
      }
    } catch {}
  };

  return (
    <CustomModal open={open} onClose={onClose}>
      <CustomModal open={expertConfirm} onClose={() => setExpertConfirm(false)}>
        <Box paddingX={3} paddingY={4}>
          <Box mb={3} className='flex items-center justify-between'>
            <h5>{t('areyousure')}</h5>
            <CloseIcon
              className='cursor-pointer'
              onClick={() => setExpertConfirm(false)}
            />
          </Box>
          <Divider />
          <Box mt={2.5} mb={1.5}>
            <p>{t('expertModeDesc')}</p>
            <Box mt={3}>
              <p className='text-bold text-uppercase'>{t('expertModeUse')}</p>
            </Box>
            <Box mt={3}>
              <p className='text-bold'>{t('typeConfirmExpertMode')}</p>
            </Box>
          </Box>
          <Box className='expertConfirmInput'>
            <input
              value={expertConfirmText}
              onChange={(e: any) => setExpertConfirmText(e.target.value)}
            />
          </Box>
          <Box
            className={`expertButtonWrapper${
              expertConfirmText === 'confirm' ? '' : ' opacity-disabled'
            }`}
            onClick={() => {
              if (expertConfirmText === 'confirm') {
                toggleExpertMode();
                setExpertConfirm(false);
              }
            }}
          >
            <p className='weight-600'>{t('turnonExpert')}</p>
          </Box>
        </Box>
      </CustomModal>
      <Box paddingX={3} paddingY={4}>
        <Box mb={3} className='flex items-center justify-between'>
          <h5>{t('settings')}</h5>
          <CloseIcon onClick={onClose} />
        </Box>
        <Divider />
        <Box my={2.5} className='flex items-center'>
          <Box mr='6px'>
            <p>{t('slippageTolerance')}</p>
          </Box>
          <QuestionHelper size={20} text={t('slippageHelper')} />
        </Box>
        <Box mb={2.5}>
          <Box className='flex items-center'>
            <Box
              className={`slippageButton${
                userSlippageTolerance === SLIPPAGE_DEFAULT && userSlippageAuto
                  ? ' activeSlippageButton'
                  : ''
              }`}
              onClick={() => {
                setSlippageInput('');
                setUserslippageTolerance(SLIPPAGE_DEFAULT);
                setUserSlippageAuto(true);
                if (userSlippageTolerance !== SLIPPAGE_DEFAULT) {
                  setSlippageManuallySet(true);
                }
              }}
            >
              <small>AUTO</small>
            </Box>
            <Box
              className={`slippageButton${
                userSlippageTolerance === 10 ? ' activeSlippageButton' : ''
              }`}
              onClick={() => {
                setSlippageInput('');
                setUserslippageTolerance(10);
                setUserSlippageAuto(false);
                if (userSlippageTolerance !== 10) {
                  setSlippageManuallySet(true);
                }
              }}
            >
              <small>0.1%</small>
            </Box>
            <Box
              className={`slippageButton${
                userSlippageTolerance === 50 && !userSlippageAuto
                  ? ' activeSlippageButton'
                  : ''
              }`}
              onClick={() => {
                setSlippageInput('');
                setUserslippageTolerance(50);
                setUserSlippageAuto(false);
                if (userSlippageTolerance !== 50) {
                  setSlippageManuallySet(true);
                }
              }}
            >
              <small>0.5%</small>
            </Box>
            <Box
              className={`slippageButton${
                userSlippageTolerance === 100 ? ' activeSlippageButton' : ''
              }`}
              onClick={() => {
                setSlippageInput('');
                setUserslippageTolerance(100);
                setUserSlippageAuto(false);
                if (userSlippageTolerance !== 100) {
                  setSlippageManuallySet(true);
                }
              }}
            >
              <small>1%</small>
            </Box>
            {!isMobile && (
              <Box
                className={`settingsInputWrapper ${
                  slippageAlert ? 'border-primary' : 'border-secondary1'
                }`}
              >
                {slippageAlert && <AlertTriangle color='#ffa000' size={16} />}
                <NumericalInput
                  placeholder={(userSlippageTolerance / 100).toFixed(2)}
                  value={slippageInput}
                  fontSize={14}
                  fontWeight={500}
                  align='right'
                  onBlur={() => {
                    parseCustomSlippage(
                      (userSlippageTolerance / 100).toFixed(2),
                    );
                  }}
                  onUserInput={(value) => parseCustomSlippage(value)}
                />
                <small>%</small>
              </Box>
            )}
          </Box>
          {isMobile && (
            <Box
              className={`settingsInputWrapper ${
                slippageAlert ? 'border-primary' : 'border-secondary1'
              }`}
              mt={2.5}
              maxWidth={168}
            >
              {slippageAlert && <AlertTriangle color='#ffa000' size={16} />}
              <NumericalInput
                placeholder={(userSlippageTolerance / 100).toFixed(2)}
                value={slippageInput}
                fontSize={14}
                fontWeight={500}
                align='right'
                onBlur={() => {
                  parseCustomSlippage((userSlippageTolerance / 100).toFixed(2));
                }}
                onUserInput={(value) => parseCustomSlippage(value)}
              />
              <small>%</small>
            </Box>
          )}
          {slippageError && (
            <Box mt={1.5}>
              <small className='text-yellow3'>
                {slippageError === SlippageError.InvalidInput
                  ? t('enterValidSlippage')
                  : slippageError === SlippageError.RiskyLow
                  ? t('txMayFail')
                  : t('txMayFrontrun')}
              </small>
            </Box>
          )}
        </Box>
        <Divider />
        <Box my={2.5} className='flex items-center'>
          <Box mr='6px'>
            <p>{t('txDeadline')}</p>
          </Box>
          <QuestionHelper size={20} text={t('txDeadlineHelper')} />
        </Box>
        <Box mb={2.5} className='flex items-center'>
          <Box className='settingsInputWrapper' maxWidth={168}>
            <NumericalInput
              placeholder={(ttl / 60).toString()}
              value={deadlineInput}
              fontSize={14}
              fontWeight={500}
              onBlur={() => {
                parseCustomDeadline((ttl / 60).toString());
              }}
              onUserInput={(value) => parseCustomDeadline(value)}
            />
          </Box>
          <Box ml={1}>
            <small>{t('minutes')}</small>
          </Box>
        </Box>
        {deadlineError && (
          <Box mt={1.5}>
            <small className='text-yellow3'>{t('enterValidDeadline')}</small>
          </Box>
        )}
        <Divider />
        <Box my={2.5} className='flex items-center justify-between'>
          <Box className='flex items-center' gridGap={6}>
            <p>{t('expertMode')}</p>
            <QuestionHelper size={20} text={t('expertModeHelper')} />
          </Box>
          <ToggleSwitch
            toggled={expertMode}
            onToggle={() => {
              if (expertMode) {
                toggleExpertMode();
                onChangeRecipient(null);
              } else {
                setExpertConfirm(true);
              }
            }}
          />
        </Box>
        <Divider />
        <Box my={2.5} className='flex items-center justify-between'>
          <p>{t('disableBonusRouter')}</p>
          <ToggleSwitch
            toggled={bonusRouterDisabled}
            onToggle={toggleSetBonusRouter}
          />
        </Box>
        <Divider />
        <Box my={2.5} className='flex items-center justify-between'>
          <p>{t('singleRouteOnly')}</p>
          <ToggleSwitch
            toggled={singleHopOnly}
            onToggle={() => setSingleHopOnly(!singleHopOnly)}
          />
        </Box>
        <Divider />
        <Box my={2.5} className='flex items-center justify-between'>
          <p>{t('infiniteApproval')}</p>
          <ToggleSwitch
            toggled={isInfiniteApproval}
            onToggle={() => setIsInfiniteApproval(!isInfiniteApproval)}
          />
        </Box>
        <Divider />
        <LiquidityHubSettings />
      </Box>
    </CustomModal>
  );
};

export default SettingsModal;
