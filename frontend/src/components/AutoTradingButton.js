import React from 'react';
import styled, { keyframes, css } from 'styled-components';

const pulseAnimation = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
`;

const FloatingButton = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 15px 25px;
  border-radius: 25px;
  font-weight: bold;
  font-size: 16px;
  z-index: 9999;
  cursor: pointer;
  border: 3px solid;
  transition: all 0.3s ease;
  text-align: center;
  min-width: 200px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.15);
  backdrop-filter: blur(10px);
  color: white;
  
  ${props => props.enabled ? css`
    background: linear-gradient(135deg, #28a745, #20c997);
    border-color: #28a745;
    animation: ${pulseAnimation} 3s infinite;
  ` : css`
    background: linear-gradient(135deg, #dc3545, #c82333);
    border-color: #dc3545;
    animation: ${pulseAnimation} 2s infinite;
  `}
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 25px rgba(0,0,0,0.2);
  }
`;

const ButtonContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
`;

const ButtonSubtext = styled.div`
  font-size: 12px;
  margin-top: 5px;
  opacity: 0.9;
`;

const AutoTradingButton = ({ enabled, onClick }) => {
  return (
    <FloatingButton enabled={enabled} onClick={onClick}>
      <ButtonContent>
        <span>{enabled ? '⚡' : '🚫'}</span>
        <span>Auto Trading {enabled ? 'ENABLED' : 'DISABLED'}</span>
      </ButtonContent>
      <ButtonSubtext>Click to toggle</ButtonSubtext>
    </FloatingButton>
  );
};

export default AutoTradingButton;