import styled from 'styled-components';

export const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%);
  background-attachment: fixed;
  color: #ffffff;
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  
  /* Large laptop adjustments */
  @media (max-width: 1600px) {
    grid-template-columns: 1fr 300px;
    gap: 16px;
  }
  
  /* Standard laptop */
  @media (max-width: 1400px) {
    grid-template-columns: 1fr 280px;
    gap: 12px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    grid-template-columns: 1fr 260px;
    gap: 10px;
  }
  
  /* Tablet landscape - side by side */
  @media (min-width: 769px) and (max-width: 1024px) {
    grid-template-columns: 1fr 240px;
    gap: 8px;
  }
  
  /* Mobile and tablet portrait - stack vertically */
  @media (max-width: 768px) {
    display: block;
    padding-bottom: 0;
  }
`;

export const ControlPanelWrapper = styled.div`
  /* Desktop - sticky position in grid */
  @media (min-width: 769px) {
    order: 2;
    padding: 20px;
    display: flex;
    justify-content: center;
  }
  
  /* Mobile - let TradingControlPanel handle fixed positioning */
  @media (max-width: 768px) {
    order: 1;
    padding: 0;
  }
`;

export const ContentWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  
  /* Mobile - full width */
  @media (max-width: 768px) {
    order: 2;
  }
`;

export const MainContent = styled.main`
  padding: 20px;
  flex: 1;
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 12px;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    padding: 8px;
  }
`;

export const ScannerSection = styled.div`
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
  margin-top: 24px;
  transition: all 0.3s ease;
  
  &:hover {
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3);
  }
  
  /* Tablet adjustments */
  @media (max-width: 1024px) {
    padding: 24px;
    border-radius: 20px;
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 16px;
    border-radius: 16px;
    margin-top: 16px;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    padding: 12px;
    border-radius: 12px;
    margin-top: 12px;
  }
`;

export const ScanBlockNotification = styled.div`
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: 2px solid #fbbf24;
  color: white;
  padding: 20px 24px;
  border-radius: 16px;
  margin: 20px;
  font-weight: 600;
  text-align: center;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.3);
  animation: pulse 2s infinite;
  
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.85; transform: scale(1.02); }
  }
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    padding: 16px 20px;
    margin: 16px;
    border-radius: 14px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    padding: 14px 18px;
    margin: 14px;
    border-radius: 12px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    padding: 12px 16px;
    margin: 12px;
    border-radius: 10px;
  }
`;

export const ScanBlockHeader = styled.div`
  font-size: 18px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    font-size: 17px;
    margin-bottom: 10px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    font-size: 16px;
    margin-bottom: 8px;
    gap: 6px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    font-size: 15px;
  }
`;

export const ScanBlockDetails = styled.div`
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 8px;
`;

export const ScanBlockTiming = styled.div`
  font-size: 12px;
  opacity: 0.8;
  font-style: italic;
`;