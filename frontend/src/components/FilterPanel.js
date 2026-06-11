import React, { useState, useMemo } from 'react';
import styled from 'styled-components';

const FilterContainer = styled.div`
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 15px;
  margin-bottom: 15px;
  min-height: 500px;
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 12px;
    margin-bottom: 12px;
    min-height: 400px;
    border-radius: 12px;
  }
  
  @media (max-width: 480px) {
    padding: 10px;
    margin-bottom: 10px;
    min-height: 350px;
    border-radius: 10px;
  }
`;

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
    text-align: center;
  }
`;

const FilterTitle = styled.h3`
  color: #79c0ff;
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-shadow: 0 0 10px rgba(121, 192, 255, 0.3);
  font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Helvetica', sans-serif;
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    font-size: 18px;
  }
  
  @media (max-width: 480px) {
    font-size: 16px;
  }
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
  margin-bottom: 15px;
  
  /* Tablet adjustments */
  @media (max-width: 1024px) {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }
  
  /* Mobile - single column */
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    gap: 10px;
  }
`;

const FilterSection = styled.div`
  background: linear-gradient(145deg, rgba(30, 41, 59, 0.4), rgba(51, 65, 85, 0.2));
  border: 1px solid rgba(139, 148, 158, 0.3);
  border-radius: 12px;
  padding: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 10px;
    border-radius: 10px;
  }
  
  @media (max-width: 480px) {
    padding: 8px;
    border-radius: 8px;
  }
`;

const SectionHeader = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: #a5b4fc;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  text-shadow: 0 0 5px rgba(165, 180, 252, 0.2);
  font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Helvetica', sans-serif;
  border-bottom: 2px solid rgba(165, 180, 252, 0.2);
  padding-bottom: 4px;
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 6px 0;
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 17px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  padding: 12px 14px;
  border-radius: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  line-height: 1.5;
  font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Helvetica', sans-serif;
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.3), rgba(51, 65, 85, 0.2));
  
  &:hover {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.1));
    border: 1px solid rgba(79, 70, 229, 0.3);
    transform: translateX(4px) scale(1.02);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
    color: #ffffff;
  }
  
  &:active {
    transform: translateX(2px) scale(1.01);
  }
`;

const Checkbox = styled.input`
  accent-color: #6366f1;
  width: 20px;
  height: 20px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  
  &:checked {
    filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.6));
    transform: scale(1.1);
  }
`;

const StatsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.15));
  border: 2px solid rgba(59, 130, 246, 0.4);
  border-radius: 12px;
  padding: 20px 24px;
  font-size: 16px;
  color: #ffffff;
  font-weight: 700;
  backdrop-filter: blur(15px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.2);
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  
  .label {
    font-size: 14px;
    opacity: 0.9;
    font-weight: 500;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Helvetica', sans-serif;
  }
  
  .value {
    font-weight: 800;
    font-size: 22px;
    text-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
    font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Helvetica', sans-serif;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  background: ${props => props.variant === 'clear' 
    ? 'linear-gradient(135deg, rgba(248, 81, 73, 0.2), rgba(220, 38, 127, 0.15))' 
    : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.15))'};
  border: 2px solid ${props => props.variant === 'clear' 
    ? 'rgba(248, 81, 73, 0.5)' 
    : 'rgba(16, 185, 129, 0.5)'};
  color: ${props => props.variant === 'clear' ? '#fca5a5' : '#6ee7b7'};
  border-radius: 8px;
  padding: 12px 20px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-shadow: 0 0 6px ${props => props.variant === 'clear' 
    ? 'rgba(248, 81, 73, 0.3)' 
    : 'rgba(16, 185, 129, 0.3)'};
  font-family: 'Segoe UI', 'Tahoma', 'Arial', 'Helvetica', sans-serif;
  letter-spacing: 0.3px;
  
  &:hover {
    background: ${props => props.variant === 'clear' 
      ? 'linear-gradient(135deg, rgba(248, 81, 73, 0.3), rgba(220, 38, 127, 0.2))' 
      : 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.2))'};
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 8px 20px ${props => props.variant === 'clear' 
      ? 'rgba(248, 81, 73, 0.3)' 
      : 'rgba(16, 185, 129, 0.3)'};
  }
  
  &:active {
    transform: translateY(0) scale(1.02);
  }
`;

// Define filter conditions with OR logic only where it exists
const FILTER_CONDITIONS = {
  buy: [
    { id: 'buy_ema5_ema3', label: 'EMA5 (5min) < EMA3 (15min)', section: 'EMA Cross' },
    { id: 'buy_open_ema3', label: 'Open < EMA3 (15min)', section: 'Price Position' },
    { id: 'buy_plus_di_25', label: '+DI > 25 (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'buy_plus_di_adx', label: '+DI > ADX (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'buy_adx_1', label: 'ADX > 25 (1min)', section: 'ADX Conditions' },
    { id: 'buy_adx_5', label: 'ADX > 25 (5min)', section: 'ADX Conditions' },
    { id: 'buy_adx_gt_minus_di_1', label: 'ADX > -DI (1min)', section: 'ADX Conditions' },
    { id: 'buy_macd_signal_5', label: 'MACD > Signal (5min)', section: 'MACD Conditions' },
    { id: 'buy_macd_positive_5', label: 'MACD > 0 (5min)', section: 'MACD Conditions' },
    { id: 'buy_macd_positive_1', label: 'MACD > 0 (1min)', section: 'MACD Conditions' },
    { id: 'buy_ema9_vwap_1', label: 'EMA5 > VWAP (1min)', section: 'EMA Position' },
    { id: 'buy_ema3_ema5_1', label: 'EMA3 > EMA5 (1min)', section: 'EMA Cross' },
    { id: 'buy_ema3_band_5m', label: 'LTP < UBB (5min)', section: 'Price Position' },
    { id: 'buy_ltp_position', label: 'LTP < EMA3 (15min)', section: 'Price Position' }
  ],
  sell: [
    { id: 'sell_ema5_ema3', label: 'EMA5 (5min) > EMA3 (15min)', section: 'EMA Cross' },
    { id: 'sell_open_ema3', label: 'Open > EMA3 (15min)', section: 'Price Position' },
    { id: 'sell_minus_di_25', label: '-DI > 25 (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'sell_minus_di_adx', label: '-DI > ADX (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'sell_adx_1', label: 'ADX > 25 (1min)', section: 'ADX Conditions' },
    { id: 'sell_adx_5', label: 'ADX > 25 (5min)', section: 'ADX Conditions' },
    { id: 'sell_adx_gt_plus_di_1', label: 'ADX > +DI (1min)', section: 'ADX Conditions' },
    { id: 'sell_macd_signal_5', label: 'MACD < Signal (5min)', section: 'MACD Conditions' },
    { id: 'sell_macd_negative_5', label: 'MACD < 0 (5min)', section: 'MACD Conditions' },
    { id: 'sell_macd_negative_1', label: 'MACD < 0 (1min)', section: 'MACD Conditions' },
    { id: 'sell_ema9_vwap_1', label: 'EMA5 < VWAP (1min)', section: 'EMA Position' },
    { id: 'sell_ema3_ema5_1', label: 'EMA3 < EMA5 (1min)', section: 'EMA Cross' },
    { id: 'sell_ema3_band_5m', label: 'LTP > LBB (5min)', section: 'Price Position' },
    { id: 'sell_ltp_position', label: 'LTP > EMA3 (15min)', section: 'Price Position' }
  ]
};

const FilterPanel = ({ type = 'buy', allStocks = [], onFilteredResults, defaultAllSelected = false }) => {
  // Initialize with all filters selected if defaultAllSelected is true
  const [activeFilters, setActiveFilters] = useState(() => {
    if (!defaultAllSelected) return {};
    
    const allFilters = {};
    FILTER_CONDITIONS[type].forEach(condition => {
      allFilters[condition.id] = true;
    });
    return allFilters;
  });

  // Group filter conditions by section

  // Apply filters to stocks
  const filteredResults = useMemo(() => {
    if (!allStocks.length) return [];

    console.log(`🔍 Filtering ${type}:`, allStocks.length, 'stocks with active filters:', activeFilters);

    // DEBUG: Check EMA values in first few stocks
    if (allStocks.length > 0) {
      const sampleStocks = allStocks.slice(0, 2);
      console.log('🔍 EMA DEBUG - Frontend received stocks:');
      sampleStocks.forEach((stock, i) => {
        console.log(`   Stock ${i + 1} (${stock.symbol || stock.s}):`, {
          ema3_1: stock.ema3_1,
          ema5_1: stock.ema5_1,
          ema9_1: stock.ema9_1,
          ema3_1_type: typeof stock.ema3_1,
          ema5_1_type: typeof stock.ema5_1,
          ema9_1_type: typeof stock.ema9_1
        });
        if (stock.ema3_1 !== undefined && stock.ema5_1 !== undefined && stock.ema9_1 !== undefined) {
          console.log(`     1min EMA conditions:`, {
            'ema3_1 > ema5_1': `${stock.ema3_1} > ${stock.ema5_1} = ${stock.ema3_1 > stock.ema5_1}`,
            'ema5_1 > ema9_1': `${stock.ema5_1} > ${stock.ema9_1} = ${stock.ema5_1 > stock.ema9_1}`
          });
        }
      });
    }

    const activeFilterKeys = Object.keys(activeFilters).filter(key => activeFilters[key]);
    console.log(`📊 Active ${type} filters:`, activeFilterKeys.length);

    if (activeFilterKeys.length === 0) {
      // No filters selected - show all stocks
      return allStocks;
    }

    const filteredStocks = allStocks.filter(stock => {
      if (type === 'buy') {
        // Buy conditions - all selected conditions must pass (AND logic)
        
        // Condition 1: EMA5 (5min) < EMA3 (15min) - standalone condition
        const condition1 = !activeFilters.buy_ema5_ema3 || (stock.ema5_5 < stock.ema3_15);
        
        // Condition 2: Open < EMA3 (15min) - standalone condition
        const condition2 = !activeFilters.buy_open_ema3 || (stock.open15 < stock.ema3_15);
        
        // Condition 3: +DI > 25 (15min OR 5min) - OR condition exists in backend
        const condition3 = !activeFilters.buy_plus_di_25 || 
          (stock.plusDI15 > 25) || (stock.plusDI5 > 25);
        
        // Condition 4: +DI > ADX (15min OR 5min) - OR condition exists in backend  
        const condition4 = !activeFilters.buy_plus_di_adx ||
          (stock.plusDI15 > stock.adx15) || (stock.plusDI5 > stock.adx5);
        
        // Condition 5: ADX > 25 (1min) - standalone condition
        const condition5 = !activeFilters.buy_adx_1 || (stock.adx1 > 25);

        // Condition 5a: ADX > 25 (5min) - standalone condition
        const condition5a = !activeFilters.buy_adx_5 || (stock.adx5 > 25);

        // Condition 5b: ADX > -DI (1min) - standalone condition
        const condition5b = !activeFilters.buy_adx_gt_minus_di_1 || (stock.adx1 > stock.minusDI1);
        
        // Condition 6: MACD > Signal (5min) - standalone condition
        const condition6 = !activeFilters.buy_macd_signal_5 || (stock.macd5 > stock.signal5);

        const condition7 = true;
        
        // Condition 8: MACD > 0 (5min) - standalone condition
        const condition8 = !activeFilters.buy_macd_positive_5 || (stock.macd5 > 0);

        // Condition 9: MACD > 0 (1min) - standalone condition
        const condition9 = !activeFilters.buy_macd_positive_1 || (stock.macd1 > 0);
        
        // Condition 10: EMA5 > VWAP (1min) - standalone condition
        const condition10 = !activeFilters.buy_ema9_vwap_1 || (stock.ema5_1 > stock.vwap1);
        
        // Condition 11: EMA3 > EMA5 (1min) - standalone condition
        const condition11 = !activeFilters.buy_ema3_ema5_1 || (stock.ema3_1 > stock.ema5_1);

          // Condition 12: LTP < UBB (5min)
        const condition12 = !activeFilters.buy_ema3_band_5m ||
          (stock.ltp < (stock.ubb_5 || stock.ubb5 || 0));
        
        // Condition 13: LTP < EMA3 (15min) - EMA5 check handled via tick data
        const condition13 = !activeFilters.buy_ltp_position || 
          (stock.ltp < stock.ema3_15);
        
        return condition1 && condition2 && condition3 && condition4 && condition5 && condition5a && 
           condition5b &&
               condition6 && condition7 && condition8 && condition9 && condition10 && 
               condition11 && condition12 && condition13;
               
      } else {
        // Sell conditions - all selected conditions must pass (AND logic)
        
        // Condition 1: EMA5 (5min) > EMA3 (15min) - standalone condition
        const condition1 = !activeFilters.sell_ema5_ema3 || (stock.ema5_5 > stock.ema3_15);
        
        // Condition 2: Open > EMA3 (15min) - standalone condition
        const condition2 = !activeFilters.sell_open_ema3 || (stock.open15 > stock.ema3_15);
        
        // Condition 3: -DI > 25 (15min OR 5min) - OR condition exists in backend
        const condition3 = !activeFilters.sell_minus_di_25 || 
          (stock.minusDI15 > 25) || (stock.minusDI5 > 25);
        
        // Condition 4: -DI > ADX (15min OR 5min) - OR condition exists in backend  
        const condition4 = !activeFilters.sell_minus_di_adx ||
          (stock.minusDI15 > stock.adx15) || (stock.minusDI5 > stock.adx5);
        
        // Condition 5: ADX > 25 (1min) - standalone condition
        const condition5 = !activeFilters.sell_adx_1 || (stock.adx1 > 25);

        // Condition 5a: ADX > 25 (5min) - standalone condition
        const condition5a = !activeFilters.sell_adx_5 || (stock.adx5 > 25);

        // Condition 5b: ADX > +DI (1min) - standalone condition
        const condition5b = !activeFilters.sell_adx_gt_plus_di_1 || (stock.adx1 > stock.plusDI1);
        
        // Condition 6: MACD < Signal (5min) - standalone condition
        const condition6 = !activeFilters.sell_macd_signal_5 || (stock.macd5 < stock.signal5);

        const condition7 = true;
        
        // Condition 8: MACD < 0 (5min) - standalone condition
        const condition8 = !activeFilters.sell_macd_negative_5 || (stock.macd5 < 0);

        // Condition 9: MACD < 0 (1min) - standalone condition
        const condition9 = !activeFilters.sell_macd_negative_1 || (stock.macd1 < 0);
        
        // Condition 10: EMA5 < VWAP (1min) - standalone condition
        const condition10 = !activeFilters.sell_ema9_vwap_1 || (stock.ema5_1 < stock.vwap1);
        
        // Condition 11: EMA3 < EMA5 (1min) - standalone condition
        const condition11 = !activeFilters.sell_ema3_ema5_1 || (stock.ema3_1 < stock.ema5_1);

          // Condition 12: LTP > LBB (5min)
        const condition12 = !activeFilters.sell_ema3_band_5m ||
          (stock.ltp > (stock.lbb_5 || stock.lbb5 || 0));
        
        // Condition 13: LTP > EMA3 (15min) - EMA5 check handled via tick data
        const condition13 = !activeFilters.sell_ltp_position || 
          (stock.ltp > stock.ema3_15);
        
        return condition1 && condition2 && condition3 && condition4 && condition5 && condition5a && 
           condition5b &&
               condition6 && condition7 && condition8 && condition9 && condition10 && 
               condition11 && condition12 && condition13;
      }
    });

    console.log(`📊 ${type} filtering results:`, filteredStocks.length);
    return filteredStocks;
  }, [allStocks, activeFilters, type]);

  // Notify parent component of filtered results
  React.useEffect(() => {
    if (onFilteredResults) {
      onFilteredResults(filteredResults);
    }
  }, [filteredResults, onFilteredResults]);

  const handleFilterChange = (filterId, checked) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterId]: checked
    }));
  };

  const clearAllFilters = () => {
    setActiveFilters({});
  };

  const selectAllFilters = () => {
    const allFilters = {};
    FILTER_CONDITIONS[type].forEach(condition => {
      allFilters[condition.id] = true;
    });
    setActiveFilters(allFilters);
  };

  const activeFilters_count = Object.values(activeFilters).filter(Boolean).length;

  const conditions = type === 'buy' ? FILTER_CONDITIONS.buy : FILTER_CONDITIONS.sell;
  const groupedConditions = useMemo(() => {
    const grouped = {};
    conditions.forEach(condition => {
      if (!grouped[condition.section]) grouped[condition.section] = [];
      grouped[condition.section].push(condition);
    });
    return grouped;
  }, [conditions]);

  return (
    <FilterContainer>
      <FilterHeader>
        <FilterTitle style={{ color: type === 'buy' ? '#10b981' : '#ef4444' }}>
          {type === 'buy' ? '📈 Buy Filters' : '📉 Sell Filters'}
        </FilterTitle>
        <ActionButtons>
          <ActionButton onClick={selectAllFilters}>✅ All</ActionButton>
          <ActionButton variant="clear" onClick={clearAllFilters}>🗑️ Clear</ActionButton>
        </ActionButtons>
      </FilterHeader>

      <StatsBar>
        <StatItem>
          <div className="value">{filteredResults.length}</div>
          <div className="label">Matches</div>
        </StatItem>
        <StatItem>
          <div className="value">{activeFilters_count}</div>
          <div className="label">Active</div>
        </StatItem>
      </StatsBar>

      <div style={{ overflowY: 'auto', maxHeight: '500px', padding: '8px' }}>
        {Object.entries(groupedConditions).map(([sectionName, conditions]) => (
          <FilterSection key={sectionName}>
            <SectionHeader>{sectionName}</SectionHeader>
            <CheckboxGroup>
              {conditions.map(condition => (
                <CheckboxItem key={condition.id}>
                  <Checkbox
                    type="checkbox"
                    checked={activeFilters[condition.id] || false}
                    onChange={(e) => handleFilterChange(condition.id, e.target.checked)}
                  />
                  {condition.label}
                </CheckboxItem>
              ))}
            </CheckboxGroup>
          </FilterSection>
        ))}
      </div>
    </FilterContainer>
  );
};

export default FilterPanel;