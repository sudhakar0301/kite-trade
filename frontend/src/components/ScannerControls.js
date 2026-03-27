import React from 'react';
import styled from 'styled-components';

const ControlsContainer = styled.div`
  background: rgba(248, 249, 250, 0.1);
  backdrop-filter: blur(20px);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  padding: 25px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
`;

const ControlsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  align-items: center;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 15px;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const ScannerButton = styled.button`
  background: linear-gradient(135deg, #007bff, #0056b3);
  border: none;
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);

  &:hover {
    background: linear-gradient(135deg, #0056b3, #004085);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 123, 255, 0.4);
  }

  &:active {
    transform: translateY(0);
  }

  ${props => props.variant === 'info' && `
    background: linear-gradient(135deg, #17a2b8, #138496);
    box-shadow: 0 4px 15px rgba(23, 162, 184, 0.3);
    
    &:hover {
      background: linear-gradient(135deg, #138496, #117a8b);
      box-shadow: 0 6px 20px rgba(23, 162, 184, 0.4);
    }
  `}

  ${props => props.variant === 'secondary' && `
    background: linear-gradient(135deg, #6c757d, #545b62);
    box-shadow: 0 4px 15px rgba(108, 117, 125, 0.3);
    
    &:hover {
      background: linear-gradient(135deg, #545b62, #4e555b);
      box-shadow: 0 6px 20px rgba(108, 117, 125, 0.4);
    }
  `}

  ${props => props.active && `
    background: linear-gradient(135deg, #28a745, #20c997);
    box-shadow: 0 4px 15px rgba(40, 167, 69, 0.4);
    
    &:hover {
      background: linear-gradient(135deg, #20c997, #1dd2af);
    }
  `}
`;

const SelectInput = styled.select`
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
  font-size: 14px;
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 10px rgba(0, 123, 255, 0.3);
  }

  option {
    background: #2a2a2a;
    color: white;
  }
`;

const CheckboxContainer = styled.div`
  background: rgba(255, 255, 255, 0.05);
  padding: 15px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: white;
  font-size: 14px;
  font-weight: 500;

  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: #007bff;
    cursor: pointer;
  }
`;

const CheckboxDescription = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 5px;
  margin-left: 28px;
`;

const StatusInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
`;

const StatusRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const StatusLabel = styled.span`
  font-weight: 600;
`;

const StatusValue = styled.span`
  font-family: 'Courier New', monospace;
  font-weight: bold;
  color: #ffd89b;
`;

const ScannerControls = ({
  isPolling,
  onTogglePolling,
  onScan,
  autoTradingEnabled,
  onToggleAutoTrading,
  voiceEnabled,
  onToggleVoice,
  lastUpdate,
  onGetPositions,
  onLoadStocks,
  pollingInterval = 15,
  onIntervalChange
}) => {
  return (
    <ControlsContainer>
      <ControlsRow>
        <ButtonGroup>
          <ScannerButton onClick={onScan}>
            🔍 Scan
          </ScannerButton>
          <ScannerButton 
            active={isPolling} 
            onClick={onTogglePolling}
          >
            🔄 {isPolling ? 'Stop Auto' : 'Start Auto'}
          </ScannerButton>
          <ScannerButton variant='info' onClick={onGetPositions}>
            📈 Positions
          </ScannerButton>
          <ScannerButton variant='secondary' onClick={onLoadStocks}>
            📊 Scanner Data
          </ScannerButton>
        </ButtonGroup>

        <div>
          <SelectInput 
            value={pollingInterval} 
            onChange={(e) => onIntervalChange?.(e.target.value)}
          >
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
            <option value={120}>2m</option>
            <option value={300}>5m</option>
          </SelectInput>
        </div>

        <StatusInfo>
          <StatusRow>
            <StatusLabel>Update:</StatusLabel>
            <StatusValue>{lastUpdate}</StatusValue>
          </StatusRow>
          <StatusRow>
            <StatusLabel>Timer:</StatusLabel>
            <StatusValue>{isPolling ? `Every ${pollingInterval}s` : 'Stopped'}</StatusValue>
          </StatusRow>
        </StatusInfo>

        <CheckboxContainer>
          <CheckboxLabel>
            <input 
              type='checkbox' 
              checked={autoTradingEnabled} 
              onChange={onToggleAutoTrading}
            />
            <span style={{ color: autoTradingEnabled ? '#28a745' : '#dc3545', fontWeight: 600 }}>
              {autoTradingEnabled ? '✅' : '❌'} Auto Trading
            </span>
          </CheckboxLabel>
          <CheckboxDescription>
            Toggle via floating button or checkbox
          </CheckboxDescription>
        </CheckboxContainer>

        <CheckboxContainer>
          <CheckboxLabel>
            <input 
              type='checkbox' 
              checked={voiceEnabled} 
              onChange={onToggleVoice}
            />
            <span style={{ color: voiceEnabled ? '#28a745' : '#6c757d', fontWeight: 600 }}>
              {voiceEnabled ? '🎤' : '🔇'} Voice Alerts
            </span>
          </CheckboxLabel>
          <CheckboxDescription>
            Polling & order notifications
          </CheckboxDescription>
        </CheckboxContainer>
      </ControlsRow>
    </ControlsContainer>
  );
};

export default ScannerControls;